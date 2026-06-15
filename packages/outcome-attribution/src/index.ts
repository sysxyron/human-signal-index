// =============================================================================
// @hsi/outcome-attribution — public entry point (HSI Phase 29).
//
// The OUTCOME ATTRIBUTION ENGINE: it measures EFFECTIVENESS (activity ≠ impact).
// It models the Signal→Investigation→Review→Governance→Publication→Outcome chain
// (single + many-to-many), scores impact per entity, and attributes outcomes to
// the contributors/teams that produced them — with anti-gaming controls.
//
// PURE + DETERMINISTIC (no DB, no UI, no Date.now()). GOVERNED: impact influences
// trust (impact → trust), NEVER the reverse, and NEVER changes RBAC.
// =============================================================================

export * from './types';
export * from './outcomes';
export * from './impact';
export * from './attribution';
export * from './chain';
export * from './fixtures';
