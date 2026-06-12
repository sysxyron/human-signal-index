// =============================================================================
// @hsi/collective-intelligence — public entry point (WorldForge/HSI Phase 20).
//
// The COLLABORATIVE INTELLIGENCE layer: investigations (lifecycle state machine),
// findings / challenges / alternative narratives / endorsements, the evidence-
// debate system, the contributor-reputation layer, and the governance review of a
// forming consensus. Nothing is silently edited; every action is attributed +
// audited; NO auto-consensus, NO auto-truth, NO auto-publish.
//
// PRINCIPLES (binding):
//   * PURE & DETERMINISTIC — callers inject `now`; NO Date.now()/Math.random().
//   * OFFLINE — no network, no clocks, no keys.
//   * EXPLAINABLE + AUDITABLE — every score carries explanation[] + limitations[].
//
// __examples__
//   import { collectiveDemo } from '@hsi/collective-intelligence';
//   const out = collectiveDemo();
//   console.log(out.snapshot.consensusPosition);
// =============================================================================

export * from './types';
export * from './investigation';
export * from './findings';
export * from './evidence';
export * from './reputation';
export * from './governance';
export * from './fixtures';
