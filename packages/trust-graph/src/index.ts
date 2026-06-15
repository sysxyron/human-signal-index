// =============================================================================
// @hsi/trust-graph — public entry point (HSI Phase 27).
//
// The TRUST GRAPH: it measures contributor QUALITY (not activity) and produces
// trust / accuracy / reliability / publication-quality / AUTHORITY scores plus a
// recognition LADDER. PURE + DETERMINISTIC (no DB, no UI, no Date.now()), and
// GOVERNED: authority is recognition only — it is NEVER an RBAC role and NEVER
// changes access. Self-generated validation is excluded (anti-gaming).
// =============================================================================

export * from './types';
export * from './scores';
export * from './ladder';
export * from './events';
export * from './fixtures';
