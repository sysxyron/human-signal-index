// =============================================================================
// HSI Phase 41 — Access review report shaping (Deliverable I). PURE.
//
// Read-only transformation over user/role/membership data the DAL already loads.
// It NEVER reads or writes user_roles / RBAC — it only summarizes for review.
// =============================================================================

import type { AccessReviewRow } from './types';

/** Roles considered "elevated" for an access review (least-privilege check). */
export const ELEVATED_ROLES = new Set(['admin', 'curator', 'reviewer']);

/** Days of inactivity after which an account is flagged in the review. */
export const INACTIVE_DAYS = 90;

export interface AccessReviewInput {
  user_id: string;
  email?: string;
  role?: string;
  organizations?: string[];
  lastLoginAt?: string;
}

/** Build a deterministic access-review report. `now` is injected (no Date.now). PURE. */
export function buildAccessReview(
  users: AccessReviewInput[],
  now: string,
): AccessReviewRow[] {
  const nowMs = Date.parse(now);
  const cutoff = INACTIVE_DAYS * 24 * 60 * 60 * 1000;
  return users.map((u) => {
    const role = (u.role ?? 'viewer').toLowerCase();
    const lastMs = u.lastLoginAt ? Date.parse(u.lastLoginAt) : NaN;
    const inactive = Number.isNaN(lastMs) ? true : nowMs - lastMs > cutoff;
    return {
      user_id: u.user_id,
      email: u.email,
      role,
      isAdmin: role === 'admin',
      organizations: u.organizations ?? [],
      elevated: ELEVATED_ROLES.has(role),
      lastLoginAt: u.lastLoginAt,
      inactive,
    };
  });
}

/** Summary counts over an access-review report. PURE. */
export function summarizeAccessReview(rows: AccessReviewRow[]): {
  total: number;
  admins: number;
  elevated: number;
  inactive: number;
} {
  return {
    total: rows.length,
    admins: rows.filter((r) => r.isAdmin).length,
    elevated: rows.filter((r) => r.elevated).length,
    inactive: rows.filter((r) => r.inactive).length,
  };
}
