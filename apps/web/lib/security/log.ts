// =============================================================================
// HSI Phase 14 — security-event LOGGING. SERVER-ONLY.
//
// `logSecurityEvent(input)` normalizes a loosely-typed event (PURE
// normalizeSecurityEvent) then routes the INSERT to the right Phase 14 table:
//
//   failed_login / successful_login -> login_attempts (+ email/success)
//                                       AND security_audit_events
//   logout / session_refresh_failure -> session_events
//   access_denied                    -> access_denials (+ required/actual role)
//   everything else                  -> security_audit_events
//
// All writes go through the request-scoped, cookie-backed createClient() (RLS:
// migration 0018 allows an authenticated caller to INSERT into the event tables;
// `with check (auth.uid() is not null)`). Logging is BEST-EFFORT: it NEVER throws
// and NEVER blocks the caller — a swallowed failure is logged to the console.
//
// SERVER-ONLY: uses next/headers via lib/supabase/server.ts. Never import from a
// 'use client' module. `server-only` is not installed here; this banner stands in
// for the import (mirrors the other server libs).
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getUser } from '@/lib/supabase/server';
import { logError } from '@/lib/errors/format-error';
import {
  normalizeSecurityEvent,
  type NormalizedSecurityEvent,
  type SecurityEventType,
} from '@/lib/security/security-events';

// -----------------------------------------------------------------------------
// Public input shape — a superset of the normalizer input plus the per-table
// extras (email/success for login_attempts; required/actual role for denials).
// `now` is supplied here (the normalizer stays pure/deterministic).
// -----------------------------------------------------------------------------
export interface LogSecurityEventInput {
  eventType: SecurityEventType;
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  route?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  /** login_attempts extras. */
  email?: string | null;
  success?: boolean;
  /** access_denials extras. */
  requiredRole?: string | null;
  actualRole?: string | null;
}

const LOGIN_EVENTS: ReadonlySet<SecurityEventType> = new Set<SecurityEventType>([
  'failed_login',
  'successful_login',
]);
const SESSION_EVENTS: ReadonlySet<SecurityEventType> = new Set<SecurityEventType>([
  'logout',
  'session_refresh_failure',
]);

/** Best-effort insert that never throws (RLS/permission/network errors swallowed). */
async function bestEffortInsert(
  client: SupabaseClient,
  table: string,
  row: Record<string, unknown>,
): Promise<void> {
  try {
    const { error } = await client.from(table).insert(row);
    if (error) logError(`security/log:${table}`, error);
  } catch (e) {
    logError(`security/log:${table}`, e);
  }
}

/** The base columns every Phase 14 telemetry table shares. */
function baseColumns(n: NormalizedSecurityEvent): Record<string, unknown> {
  return {
    user_id: n.user_id,
    event_type: n.event_type,
    severity: n.severity,
    ip_address: n.ip_address,
    user_agent: n.user_agent,
    route: n.route,
    message: n.message,
    metadata: n.metadata,
    created_at: n.created_at,
  };
}

/**
 * Log a security event. Resolves the current user id (when not supplied) for the
 * RLS `auth.uid()` check, normalizes the event, and routes the INSERT to the
 * correct table(s). BEST-EFFORT — always resolves, never throws.
 */
export async function logSecurityEvent(
  input: LogSecurityEventInput,
): Promise<void> {
  try {
    const client = createClient();

    // Resolve the acting user id for the RLS insert check + user_id column when
    // the caller did not pass one (anonymous failed logins keep a null user_id).
    let userId = input.userId ?? null;
    if (userId === undefined || userId === null) {
      const user = await getUser();
      userId = user?.id ?? null;
    }

    const normalized = normalizeSecurityEvent({
      eventType: input.eventType,
      userId,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      route: input.route,
      message: input.message,
      metadata: input.metadata,
      now: new Date().toISOString(),
    });

    const base = baseColumns(normalized);

    if (LOGIN_EVENTS.has(input.eventType)) {
      // login_attempts (+ email/success) AND the general audit trail.
      await bestEffortInsert(client, 'login_attempts', {
        ...base,
        email: input.email ?? null,
        success: input.success ?? input.eventType === 'successful_login',
      });
      await bestEffortInsert(client, 'security_audit_events', base);
      return;
    }

    if (SESSION_EVENTS.has(input.eventType)) {
      await bestEffortInsert(client, 'session_events', base);
      return;
    }

    if (input.eventType === 'access_denied') {
      await bestEffortInsert(client, 'access_denials', {
        ...base,
        required_role: input.requiredRole ?? null,
        actual_role: input.actualRole ?? null,
      });
      return;
    }

    // Everything else -> the general security audit trail.
    await bestEffortInsert(client, 'security_audit_events', base);
  } catch (e) {
    // The whole logging path is best-effort; never surface to the caller.
    logError('security/log', e);
  }
}

// -----------------------------------------------------------------------------
// Convenience helpers (thin wrappers over logSecurityEvent).
// -----------------------------------------------------------------------------

/** Log a FAILED login attempt (login_attempts + audit). */
export async function logFailedLogin(args: {
  email?: string | null;
  message?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  route?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  return logSecurityEvent({
    eventType: 'failed_login',
    email: args.email ?? null,
    success: false,
    message: args.message,
    ipAddress: args.ipAddress,
    userAgent: args.userAgent,
    route: args.route ?? '/auth',
    metadata: args.metadata,
    // A failed login for an unknown account has no resolvable user; keep null.
    userId: null,
  });
}

/** Log a SUCCESSFUL login (login_attempts + audit). */
export async function logSuccessfulLogin(args: {
  email?: string | null;
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  route?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  return logSecurityEvent({
    eventType: 'successful_login',
    email: args.email ?? null,
    success: true,
    userId: args.userId,
    ipAddress: args.ipAddress,
    userAgent: args.userAgent,
    route: args.route ?? '/auth',
    metadata: args.metadata,
  });
}

/** Log a logout (session_events). */
export async function logLogout(args?: {
  userId?: string | null;
  route?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  return logSecurityEvent({
    eventType: 'logout',
    userId: args?.userId,
    route: args?.route ?? '/auth',
    metadata: args?.metadata,
  });
}

/** Log an authorization denial (access_denials + required/actual role). */
export async function logAccessDenied(args: {
  route: string;
  requiredRole?: string | null;
  actualRole?: string | null;
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  message?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  return logSecurityEvent({
    eventType: 'access_denied',
    route: args.route,
    requiredRole: args.requiredRole ?? null,
    actualRole: args.actualRole ?? null,
    userId: args.userId,
    ipAddress: args.ipAddress,
    userAgent: args.userAgent,
    message:
      args.message ??
      `Access to ${args.route} denied (requires ${args.requiredRole ?? 'a higher'} role; have ${args.actualRole ?? 'none'}).`,
    metadata: args.metadata,
  });
}

/** Log a health-check failure (security_audit_events). */
export async function logHealthFailure(args: {
  service: string;
  message?: string;
  route?: string;
  cloudflareChallenge?: boolean;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  return logSecurityEvent({
    eventType: args.cloudflareChallenge ? 'cloudflare_challenge' : 'health_check_failure',
    route: args.route ?? `/api/health/${args.service}`,
    message:
      args.message ?? `Health check failed for the ${args.service} service.`,
    metadata: { service: args.service, ...(args.metadata ?? {}) },
  });
}
