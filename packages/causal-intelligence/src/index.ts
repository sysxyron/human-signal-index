// =============================================================================
// @hsi/causal-intelligence — public entry point (WorldForge/HSI Phase 11).
//
// The CAUSAL-ANALYSIS + NARRATIVE-REPLAY engine. It EXPLAINS change: detect
// causal events in a narrative's timeline, order them into explainable chains,
// attribute a % share of the change to each, render a DATA-GROUNDED human
// explanation, build a replay timeline (scrubber), and detect life-cycle
// milestones (birth → growth → viral → peak → decline → death → resurgence).
//
// PRINCIPLES (binding):
//   * PURE & DETERMINISTIC — callers inject `now`; NO Date.now()/Math.random().
//   * OFFLINE — fixtures + local heuristics; no network, no clocks, no keys.
//   * ZERO runtime deps beyond the @hsi workspace.
//   * NEVER FABRICATE — every statement is tied to a concrete input number; thin
//     data lowers confidence and says so. Outputs are aids for a HUMAN reviewer.
//
// __examples__
//   import { causalDemo } from '@hsi/causal-intelligence';
//   const out = causalDemo();
//   out.narratives.forEach((n) => console.log(n.narrativeId, n.explanation.text));
// =============================================================================

export * from './types';
export * from './events';
export * from './chains';
export * from './attribution';
export * from './explanation';
export * from './replay';
export * from './milestones';
export * from './fixtures';
