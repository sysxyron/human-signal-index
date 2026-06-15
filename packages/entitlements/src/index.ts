// =============================================================================
// @hsi/entitlements — public entry point (HSI Phase 37, v1.1).
//
// The commercial feature-access engine: plans, feature entitlements, limits, and
// hasFeature/getLimit/requireFeature/withinLimit. PURE + DETERMINISTIC (no DB, no
// UI, no Date.now()). Gates FEATURES only — never RBAC/auth. No payments.
// =============================================================================

export * from './types';
export * from './plans';
export * from './access';
export * from './usage';
