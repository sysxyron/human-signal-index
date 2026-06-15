// =============================================================================
// @hsi/lineage — public entry point (HSI Phase 30).
//
// The INTELLIGENCE LINEAGE & TRACEABILITY GRAPH. Makes every artifact traceable:
//   Signal → Evidence → Investigation → Review → Governance → Publication → Outcome
// + the contributors who touched each. Provides lineage queries, integrity
// validation (orphans / broken chains / cycles), and graph health metrics.
//
// PURE + DETERMINISTIC (no DB, no UI, no Date.now()). GOVERNED: lineage is
// traceability/measurement only — it NEVER changes RBAC.
// =============================================================================

export * from './types';
export * from './graph';
export * from './lineage';
export * from './validation';
export * from './health';
export * from './fixtures';
