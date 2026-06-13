// =============================================================================
// HSI Phase 14 — Security data-access layer (DAL). SERVER-ONLY.
//
// Reads/writes the Phase 14 platform-security telemetry tables (migration 0018):
//   auth_diagnostics, security_audit_events, login_attempts, session_events,
//   access_denials, admin_security_reviews.
//
// Mirrors the operations DAL (lib/operations/persistence.ts): every function
// returns DbResult<T> and NEVER throws; empty/placeholder Supabase env degrades
// to NOT_CONFIGURED so `next build` passes. Reads go through the per-request,
// cookie-backed RLS client.
//
// AUTHZ MODEL (migration 0018 RLS, mirrored here for clean DbResult errors):
//   * The event tables (login_attempts/security_audit_events/session_events/
//     access_denials/auth_diagnostics) are effectively ADMIN-only for the
//     aggregate/cross-user reads the dashboard needs (login_attempts is strictly
//     admin-read; the others allow self-read but the dashboard wants ALL rows).
//     We therefore gate the dashboard + feed reads at `admin` in the DAL; RLS is
//     the backstop. admin_security_reviews is admin read/insert/update.
//   * getRbacAudit() reads the STATIC protected-route map — NOT sensitive data —
//     so any caller may read it (no role gate).
//
// SERVER-ONLY — never import from a 'use client' module (uses next/headers via
// lib/supabase/server.ts + the health probes). `server-only` is not installed in
// this workspace, so this banner stands in for the import.
// =============================================================================

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { loadHighestRole } from '@/lib/auth/get-session-role';
import { formatErrorMessage, logError } from '@/lib/errors/format-error';
import { createClient } from '@/lib/supabase/server';
import {
  probeAuth,
  probeRest,
  probeStorage,
  probeSupabase,
} from '@/lib/health/probes';
import { auditProtectedRoutes, type AuditedRoute } from '@/lib/security/rbac-audit';
import { validateStartupEnv } from '@/lib/env/validate-env';
import type {
  AccessDenialRecord,
  AdminSecurityReviewRecord,
  HealthCheckResult,
  LoginAttemptRecord,
  SecurityAuditEventRecord,
  SecurityDashboardData,
  SecurityReviewStatus,
  SessionEventRecord,
} from '@hsi/shared-types';

// -----------------------------------------------------------------------------
// Result type — canonical DbResult with 'FORBIDDEN' (mirrors operations DAL).
// -----------------------------------------------------------------------------
export type DbResultCode =
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'NOT_CONFIGURED'
  | 'DB_ERROR';

export type DbResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: DbResultCode };

const NOT_CONFIGURED =
  'Supabase is not configured (set NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).';

const AUTH_REQUIRED = 'Sign in to continue.';

type AppRole = 'viewer' | 'researcher' | 'reviewer' | 'curator' | 'admin';

export function fail(error: unknown): {
  ok: false;
  error: string;
  code: DbResultCode;
} {
  logError('security/persistence', error);
  if (
    error instanceof Error &&
    /required|not configured|SUPABASE_/i.test(error.message) &&
    /key|url/i.test(error.message)
  ) {
    return { ok: false, error: NOT_CONFIGURED, code: 'NOT_CONFIGURED' };
  }
  return { ok: false, error: formatErrorMessage(error), code: 'DB_ERROR' };
}

function authRequired(): { ok: false; error: string; code: DbResultCode } {
  return { ok: false, error: AUTH_REQUIRED, code: 'AUTH_REQUIRED' };
}

export function forbidden(required: AppRole): {
  ok: false;
  error: string;
  code: DbResultCode;
} {
  return {
    ok: false,
    error: `Requires the ${required} role or higher.`,
    code: 'FORBIDDEN',
  };
}

// -----------------------------------------------------------------------------
// Client + identity + role helpers (mirror lib/operations/persistence.ts).
// -----------------------------------------------------------------------------

/** Per-request, cookie-backed, RLS-enforced client for reads AND writes. */
function db(): SupabaseClient {
  return createClient();
}

async function currentUser(client: SupabaseClient): Promise<User | null> {
  const {
    data: { user },
  } = await client.auth.getUser();
  return user ?? null;
}

/** Ascending privilege ladder. viewer < researcher < reviewer < curator < admin. */
const ROLE_LEVEL: Record<AppRole, number> = {
  viewer: 1,
  researcher: 2,
  reviewer: 3,
  curator: 4,
  admin: 5,
};

async function sessionRole(client: SupabaseClient): Promise<AppRole | null> {
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;
  return loadHighestRole(client, user.id);
}

async function requireRole(
  client: SupabaseClient,
  min: AppRole,
): Promise<
  | { ok: true; user: User; role: AppRole }
  | { ok: false; error: string; code: DbResultCode }
> {
  const user = await currentUser(client);
  if (!user) return authRequired();
  const role = (await sessionRole(client)) ?? 'viewer';
  if (ROLE_LEVEL[role] < ROLE_LEVEL[min]) return forbidden(min);
  return { ok: true, user, role };
}

// -----------------------------------------------------------------------------
// Filters + helpers.
// -----------------------------------------------------------------------------
export interface SecurityEventFilters {
  eventType?: string;
  severity?: string;
  userId?: string;
  limit?: number;
}

export interface LoginAttemptFilters {
  email?: string;
  success?: boolean;
  limit?: number;
}

function sinceIso(hoursAgo: number): string {
  return new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
}

const DEFAULT_FEED_LIMIT = 100;

// =============================================================================
// SECURITY DASHBOARD (admin)
// =============================================================================

/**
 * Assemble the Security dashboard aggregate (admin). Runs all four health probes
 * for `health[]`, reads the recent failed-logins / access-denials / audit-events
 * / session-events feeds, derives a Cloudflare warning from any probe detail, and
 * computes 24h counts. NEVER throws; NOT_CONFIGURED on empty env.
 */
export async function getSecurityDashboard(): Promise<
  DbResult<SecurityDashboardData>
> {
  try {
    const client = db();
    const gate = await requireRole(client, 'admin');
    if (!gate.ok) return gate;

    // Health probes (each never throws; shape == HealthCheckResult).
    const [supabase, auth, rest, storage] = await Promise.all([
      probeSupabase(),
      probeAuth(),
      probeRest(),
      probeStorage(),
    ]);
    const health: HealthCheckResult[] = [supabase, auth, rest, storage];

    const cloudflareWarning = health.some(
      (h) => h.details?.cloudflareChallenge === true,
    )
      ? 'A Cloudflare challenge was detected on a Supabase endpoint. Add a WAF skip rule for /auth/.'
      : undefined;

    // Failed logins (recent).
    let failedLogins: LoginAttemptRecord[] = [];
    {
      const { data } = await client
        .from('login_attempts')
        .select('*')
        .eq('success', false)
        .order('created_at', { ascending: false })
        .limit(DEFAULT_FEED_LIMIT);
      failedLogins = (data ?? []) as LoginAttemptRecord[];
    }

    // Access denials (recent).
    let accessDenials: AccessDenialRecord[] = [];
    {
      const { data } = await client
        .from('access_denials')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(DEFAULT_FEED_LIMIT);
      accessDenials = (data ?? []) as AccessDenialRecord[];
    }

    // Security audit events (recent).
    let securityEvents: SecurityAuditEventRecord[] = [];
    {
      const { data } = await client
        .from('security_audit_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(DEFAULT_FEED_LIMIT);
      securityEvents = (data ?? []) as SecurityAuditEventRecord[];
    }

    // Session events (recent).
    let sessionEvents: SessionEventRecord[] = [];
    {
      const { data } = await client
        .from('session_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(DEFAULT_FEED_LIMIT);
      sessionEvents = (data ?? []) as SessionEventRecord[];
    }

    // 24h counts (head + exact count, best-effort).
    const since24h = sinceIso(24);

    let failedLogins24h = 0;
    {
      const { count } = await client
        .from('login_attempts')
        .select('id', { count: 'exact', head: true })
        .eq('success', false)
        .gte('created_at', since24h);
      failedLogins24h = count ?? 0;
    }

    let accessDenials24h = 0;
    {
      const { count } = await client
        .from('access_denials')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since24h);
      accessDenials24h = count ?? 0;
    }

    let criticalEvents24h = 0;
    {
      const { count } = await client
        .from('security_audit_events')
        .select('id', { count: 'exact', head: true })
        .eq('severity', 'critical')
        .gte('created_at', since24h);
      criticalEvents24h = count ?? 0;
    }

    // Startup env validation (no secret values — only presence/validity).
    const envResult = validateStartupEnv(process.env as Record<string, string | undefined>);
    const env = {
      ok: envResult.ok,
      requiredMissing: envResult.requiredMissing,
      optionalMissing: envResult.optionalMissing,
      required: envResult.required.map((s) => ({
        key: s.key,
        present: s.present,
        valid: s.valid,
        message: s.message,
      })),
      optional: envResult.optional.map((s) => ({ key: s.key, present: s.present })),
      warnings: envResult.warnings,
    };

    const data: SecurityDashboardData = {
      health,
      failedLogins,
      accessDenials,
      securityEvents,
      sessionEvents,
      cloudflareWarning,
      env,
      counts: { failedLogins24h, accessDenials24h, criticalEvents24h },
    };
    return { ok: true, data };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// FEEDS (admin)
// =============================================================================

/** List security audit events (filtered), newest first (admin). */
export async function listSecurityEvents(
  filters?: SecurityEventFilters,
): Promise<DbResult<SecurityAuditEventRecord[]>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'admin');
    if (!gate.ok) return gate;

    let query = client.from('security_audit_events').select('*');
    if (filters?.eventType) query = query.eq('event_type', filters.eventType);
    if (filters?.severity) query = query.eq('severity', filters.severity);
    if (filters?.userId) query = query.eq('user_id', filters.userId);
    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(filters?.limit ?? 200);
    if (error) return fail(error);
    return { ok: true, data: (data ?? []) as SecurityAuditEventRecord[] };
  } catch (e) {
    return fail(e);
  }
}

/** List login attempts (filtered), newest first (admin — carries others' emails). */
export async function listLoginAttempts(
  filters?: LoginAttemptFilters,
): Promise<DbResult<LoginAttemptRecord[]>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'admin');
    if (!gate.ok) return gate;

    let query = client.from('login_attempts').select('*');
    if (filters?.email) query = query.eq('email', filters.email);
    if (typeof filters?.success === 'boolean') {
      query = query.eq('success', filters.success);
    }
    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(filters?.limit ?? 200);
    if (error) return fail(error);
    return { ok: true, data: (data ?? []) as LoginAttemptRecord[] };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// RBAC AUDIT — the static protected-route map (any authenticated caller).
// Not sensitive data: it is the same map already bundled to the client via the
// pure rbac-audit module, so we do NOT role-gate it.
// =============================================================================

/** Return the static protected-route map for the RBAC audit view. Never fails. */
export async function getRbacAudit(): Promise<DbResult<AuditedRoute[]>> {
  try {
    return { ok: true, data: auditProtectedRoutes() };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// ADMIN SECURITY REVIEWS (admin read/insert/update)
// =============================================================================

/** List admin security reviews, newest first (admin). */
export async function listSecurityReviews(): Promise<
  DbResult<AdminSecurityReviewRecord[]>
> {
  try {
    const client = db();
    const gate = await requireRole(client, 'admin');
    if (!gate.ok) return gate;

    const { data, error } = await client
      .from('admin_security_reviews')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) return fail(error);
    return { ok: true, data: (data ?? []) as AdminSecurityReviewRecord[] };
  } catch (e) {
    return fail(e);
  }
}

export interface UpsertSecurityReviewInput {
  /** Present -> update; absent -> insert a new review row. */
  id?: string;
  status?: SecurityReviewStatus;
  notes?: string;
  eventType?: string;
  severity?: AdminSecurityReviewRecord['severity'];
  route?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  /** The user_id the review is ABOUT (the subject of the security signal). */
  subjectUserId?: string | null;
}

/**
 * Create or update an admin security review (admin). On update we patch the
 * provided fields; on insert we stamp reviewed_by with the acting admin. The
 * updated_at trigger maintains updated_at. NEVER throws.
 */
export async function upsertSecurityReview(
  input: UpsertSecurityReviewInput,
): Promise<DbResult<AdminSecurityReviewRecord>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'admin');
    if (!gate.ok) return gate;

    if (input.id) {
      const patch: Record<string, unknown> = {
        reviewed_by: gate.user.id,
      };
      if (input.status !== undefined) patch.status = input.status;
      if (input.notes !== undefined) patch.notes = input.notes;
      if (input.eventType !== undefined) patch.event_type = input.eventType;
      if (input.severity !== undefined) patch.severity = input.severity;
      if (input.route !== undefined) patch.route = input.route;
      if (input.message !== undefined) patch.message = input.message;
      if (input.metadata !== undefined) patch.metadata = input.metadata;

      const { data, error } = await client
        .from('admin_security_reviews')
        .update(patch)
        .eq('id', input.id)
        .select('*')
        .single();
      if (error) return fail(error);
      return { ok: true, data: data as AdminSecurityReviewRecord };
    }

    const { data, error } = await client
      .from('admin_security_reviews')
      .insert({
        user_id: input.subjectUserId ?? null,
        reviewed_by: gate.user.id,
        status: input.status ?? 'open',
        notes: input.notes ?? null,
        event_type: input.eventType ?? null,
        severity: input.severity ?? null,
        route: input.route ?? null,
        message: input.message ?? null,
        metadata: input.metadata ?? null,
      })
      .select('*')
      .single();
    if (error) return fail(error);
    return { ok: true, data: data as AdminSecurityReviewRecord };
  } catch (e) {
    return fail(e);
  }
}

// -----------------------------------------------------------------------------
// Re-export the shared client accessor + role helper for the actions layer.
// -----------------------------------------------------------------------------
export { db as securityDbClient, requireRole as requireSecurityRole };
