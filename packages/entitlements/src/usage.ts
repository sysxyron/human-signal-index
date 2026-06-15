// =============================================================================
// Usage evaluation (Deliverable D/F) — PURE. Maps recorded organization usage
// counters against the plan's limit entitlements to produce a per-limit status.
// Framework only: callers decide whether to surface or (later) enforce. Never
// touches RBAC/auth, never blocks here.
// =============================================================================

import type { Entitlement, FeatureKey } from './types';
import { getLimit } from './access';

/** Counters the platform records per organization (organization_usage table). */
export interface UsageCounters {
  investigations: number;
  publications: number;
  contributors: number;
}

/** The limit feature keys that map to a usage counter. */
export const LIMITED_USAGE: Array<{ key: FeatureKey; counter: keyof UsageCounters }> = [
  { key: 'investigations_limit', counter: 'investigations' },
  { key: 'publications_limit', counter: 'publications' },
  { key: 'contributors_limit', counter: 'contributors' },
];

export interface UsageStatus {
  key: FeatureKey;
  used: number;
  limit: number | null; // null = unlimited
  remaining: number; // Infinity if unlimited
  withinLimit: boolean;
  fractionUsed: number; // 0..1 (0 when unlimited)
}

/** Evaluate every limited usage counter against the entitlement set. PURE. */
export function evaluateUsage(entitlements: Entitlement[], usage: UsageCounters): UsageStatus[] {
  return LIMITED_USAGE.map(({ key, counter }) => {
    const used = Math.max(0, usage[counter] ?? 0);
    const limit = getLimit(entitlements, key);
    const within = limit === null || used < limit;
    return {
      key,
      used,
      limit,
      remaining: limit === null ? Infinity : Math.max(0, limit - used),
      withinLimit: within,
      fractionUsed: limit === null || limit <= 0 ? 0 : Math.min(1, used / limit),
    };
  });
}

/** Any limited counter at or over its limit? PURE. (Framework signal — not enforced yet.) */
export function anyLimitExceeded(entitlements: Entitlement[], usage: UsageCounters): boolean {
  return evaluateUsage(entitlements, usage).some((s) => !s.withinLimit);
}
