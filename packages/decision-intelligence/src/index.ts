// =============================================================================
// @hsi/decision-intelligence — public entry point (WorldForge/HSI Phase 13).
//
// STRATEGIC DECISION INTELLIGENCE + WAR-GAMING. Built on the counterfactual /
// causal / temporal engines, it answers "what should we do next?" and "which
// intervention has the highest probability of success?" from a narrative's
// ACTUAL signal/causal/counterfactual history.
//
// PRINCIPLES (binding):
//   * PURE & DETERMINISTIC — callers inject `now`; NO Date.now()/Math.random().
//   * OFFLINE — fixtures + local heuristics; no network, no clocks, no keys.
//   * ZERO runtime deps beyond the @hsi workspace.
//   * NEVER CERTAINTY, NEVER BLACK-BOX — every output carries confidence +
//     reasoning + LIMITATIONS + evidence, all tied to real input data.
//
// __examples__
//   import { decisionDemo } from '@hsi/decision-intelligence';
//   const out = decisionDemo();
//   console.log(out.recommendation.decisionType, out.recommendation.recommendedAction);
// =============================================================================

export * from './types';
export * from './sensitivity';
export * from './ranking';
export * from './decision';
export * from './recommendations';
export * from './comparison';
export * from './crossNarrative';
export * from './audit';
export * from './fixtures';
