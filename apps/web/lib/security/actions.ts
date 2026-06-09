'use server';

// =============================================================================
// HSI Phase 14 — security server actions ('use server').
//
// THIN wrappers over the Phase-14 security DAL (lib/security/persistence.ts) and
// the health probes (lib/health/probes.ts). They return DbResult (or, for the
// raw health-check action, HealthCheckResult[]) and NEVER throw.
//
// THE EXPORTED ACTION SURFACE IS LOAD-BEARING: the parallel Security UI agent
// builds against exactly these names — do not rename them.
//
// SERVER-ONLY: this module imports next/headers transitively via the DAL and must
// never be imported by a client component — it is reachable only via these
// actions (RSC / form actions).
// =============================================================================

import { revalidatePath } from 'next/cache';
import {
  getRbacAudit,
  getSecurityDashboard,
  listLoginAttempts,
  listSecurityEvents,
  listSecurityReviews,
  upsertSecurityReview,
  type DbResult,
  type LoginAttemptFilters,
  type SecurityEventFilters,
  type UpsertSecurityReviewInput,
} from './persistence';
import {
  probeAuth,
  probeRest,
  probeStorage,
  probeSupabase,
} from '@/lib/health/probes';
import type { HealthCheckResult } from '@hsi/shared-types';

const SECURITY_ROUTE = '/dashboard/security';

function revalidate(...paths: string[]): void {
  for (const p of paths) {
    try {
      revalidatePath(p);
    } catch {
      // revalidatePath throws outside a request scope — ignore (best-effort).
    }
  }
}

// =============================================================================
// DASHBOARD + FEEDS
// =============================================================================

/** The Security dashboard aggregate (admin). */
export async function getSecurityDashboardAction() {
  return getSecurityDashboard();
}

/**
 * Run all four dependency health checks. Returns a DbResult wrapping the
 * HealthCheckResult[] so the UI can branch on ok/error/code uniformly (the
 * RefreshHealthButton consumes it this way). Probes are public reachability
 * checks (no DB rows), so this is NOT role-gated — useful for a status banner.
 * NEVER throws (probes catch their own network errors).
 */
export async function runHealthChecksAction(): Promise<
  DbResult<HealthCheckResult[]>
> {
  try {
    const [supabase, auth, rest, storage] = await Promise.all([
      probeSupabase(),
      probeAuth(),
      probeRest(),
      probeStorage(),
    ]);
    return { ok: true, data: [supabase, auth, rest, storage] };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      code: 'DB_ERROR',
    };
  }
}

/** List security audit events (filtered), newest first (admin). */
export async function listSecurityEventsAction(filters?: SecurityEventFilters) {
  return listSecurityEvents(filters);
}

/** List login attempts (filtered), newest first (admin). */
export async function listLoginAttemptsAction(filters?: LoginAttemptFilters) {
  return listLoginAttempts(filters);
}

/** The static protected-route RBAC audit map (any authenticated caller). */
export async function getRbacAuditAction() {
  return getRbacAudit();
}

// =============================================================================
// ADMIN SECURITY REVIEWS
// =============================================================================

/** List admin security reviews, newest first (admin). */
export async function listSecurityReviewsAction() {
  return listSecurityReviews();
}

/** Create or update an admin security review (admin). Revalidates the dashboard. */
export async function upsertSecurityReviewAction(
  input: UpsertSecurityReviewInput,
) {
  const result = await upsertSecurityReview(input);
  if (result.ok) revalidate(SECURITY_ROUTE);
  return result;
}

// =============================================================================
// RE-EXPORTS for the UI — DbResult + Phase-14 view-model / record types.
// (Type re-exports are erased at compile time; safe in a 'use server' module.)
// =============================================================================
export type { DbResult, DbResultCode } from './persistence';
export type {
  SecurityEventFilters,
  LoginAttemptFilters,
  UpsertSecurityReviewInput,
} from './persistence';
export type {
  AuthDiagnosticRecord,
  SecurityAuditEventRecord,
  LoginAttemptRecord,
  SessionEventRecord,
  AccessDenialRecord,
  AdminSecurityReviewRecord,
  HealthCheckResult,
  SecurityDashboardData,
  SecurityEventSeverity,
  SecurityReviewStatus,
  HealthServiceStatus,
} from '@hsi/shared-types';
