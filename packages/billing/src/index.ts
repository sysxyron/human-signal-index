// =============================================================================
// @hsi/billing — public entry (HSI Phase 38, v1.1). Stripe billing business
// logic: pricing, subscription state mapping, reconciliation, trials, usage
// metering, revenue rollups, invoices, checkout/portal inputs, and webhook
// classification + replay protection. PURE + DETERMINISTIC — no Stripe SDK, no
// DB, no UI, no Date.now(). Gates FEATURES/billing only — never RBAC/auth.
// =============================================================================

export * from './types';
export * from './stripe';
export * from './subscriptions';
export * from './usage';
export * from './invoices';
export * from './checkout';
export * from './portal';
export * from './webhooks';
