// =============================================================================
// @hsi/outcome-intelligence — public entry point (WorldForge/HSI Phase 15).
//
// RECOMMENDATION OUTCOME TRACKING + CONFIDENCE LEARNING + ALERTING + GOVERNANCE.
// Closes the decision → outcome → learning loop on top of @hsi/decision-
// intelligence and @hsi/counterfactual-engine: did the recommendation actually
// work, and are recommendations getting better over time?
//
// PRINCIPLES (binding):
//   * PURE & DETERMINISTIC — callers inject `now`/seed; NO Date.now()/Math.random().
//   * OFFLINE — fixtures + local heuristics; no network, no clocks, no keys.
//   * ZERO runtime deps beyond the @hsi workspace.
//   * NEVER CERTAINTY, NEVER BLACK-BOX — every output carries a success score, a
//     confidence, an explanation, and explicit LIMITATIONS, all tied to real
//     observed data. NO auto-actions: alerts/reviews are AIDS for a human.
//
// __examples__
//   import { outcomeDemo } from '@hsi/outcome-intelligence';
//   const out = outcomeDemo();
//   out.evaluations.forEach((e) => console.log(e.recommendationId, e.outcomeStatus));
// =============================================================================

export * from './types';
export * from './measurement';
export * from './outcome';
export * from './learning';
export * from './alerts';
export * from './governance';
export * from './fixtures';
