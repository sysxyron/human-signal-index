// =============================================================================
// Feature access engine (Deliverable E). PURE. Operates on an entitlement set the
// caller (DAL) loads for an organization. Never touches RBAC/auth.
// =============================================================================

import type { Entitlement, FeatureCheck, FeatureKey } from './types';

function find(entitlements: Entitlement[], key: FeatureKey): Entitlement | undefined {
  return entitlements.find((e) => e.featureKey === key);
}

/** Is a feature enabled for this entitlement set? PURE. */
export function hasFeature(entitlements: Entitlement[], key: FeatureKey): boolean {
  return Boolean(find(entitlements, key)?.enabled);
}

/** The numeric limit for a key: a number, or null = unlimited / not set. PURE. */
export function getLimit(entitlements: Entitlement[], key: FeatureKey): number | null {
  const e = find(entitlements, key);
  if (!e || !e.enabled) return e?.limitValue ?? null;
  return e.limitValue;
}

/** requireFeature — gate result (never throws; callers decide). PURE. */
export function requireFeature(entitlements: Entitlement[], key: FeatureKey): FeatureCheck {
  return hasFeature(entitlements, key)
    ? { ok: true }
    : { ok: false, featureKey: key, reason: `This feature (${key}) is not included in your plan.` };
}

/** Is `current` within the limit for `key`? Unlimited (null) → always true. PURE. */
export function withinLimit(entitlements: Entitlement[], key: FeatureKey, current: number): boolean {
  const limit = getLimit(entitlements, key);
  return limit === null || current < limit;
}

/** Remaining headroom for a limit key (Infinity if unlimited). PURE. */
export function remaining(entitlements: Entitlement[], key: FeatureKey, current: number): number {
  const limit = getLimit(entitlements, key);
  return limit === null ? Infinity : Math.max(0, limit - current);
}
