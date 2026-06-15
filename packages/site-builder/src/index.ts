// =============================================================================
// @hsi/site-builder — public entry point (HSI Phase 34).
//
// The operator SITE-BUILDER block vocabulary (10 block types) + validation +
// serialisation, reusable across every CMS page. PURE + DETERMINISTIC (no DB, no
// UI, no Date.now()). Content only — never touches RBAC.
// =============================================================================

export * from './types';
export * from './blocks';
export * from './serialize';
export * from './fixtures';
