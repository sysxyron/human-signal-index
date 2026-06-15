// =============================================================================
// @hsi/source-collectors — public entry (HSI Phase 40). The advanced source-
// collection framework: source-type catalog, per-type validation + normalization
// with actionable errors, capture engines (rss/news/research/government/reddit/
// watchlist), watchlist snapshot + diffing, source-health derivation, capture
// routing, recommended seeds, and signal-draft creation. PURE — fetching is
// injected; no DB/UI. PUBLIC-only capture policy (via @hsi/source-connectors).
// Never touches RBAC/auth/billing.
// =============================================================================

export * from './types';
export * from './detectors';
export * from './routing';
export * from './validate';
export * from './watchlist';
export * from './capture';
export * from './health';
export * from './seeds';
