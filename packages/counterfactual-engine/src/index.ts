// =============================================================================
// @hsi/counterfactual-engine — public entry point (WorldForge/HSI Phase 12).
//
// GROUNDED counterfactual reasoning + forecast validation/calibration. Answers
// "what would have happened if X never happened?" by replaying a narrative's
// ACTUAL signal history with one intervention applied and re-propagating the
// downstream effects with deterministic heuristics. Also backtests past
// forecasts and calibrates stated confidence against empirical accuracy.
//
// This is NOT a fantasy simulator: every output is tied to real input data and
// carries a confidence, a reasoning trail, and explicit LIMITATIONS. It NEVER
// claims certainty and NEVER hallucinates.
//
// PRINCIPLES (binding):
//   * PURE & DETERMINISTIC — callers inject `now`; NO Date.now()/Math.random().
//   * OFFLINE — fixtures + local heuristics; no network, no clocks, no keys.
//   * ZERO runtime deps beyond the @hsi workspace.
//
// __examples__
//   import { counterfactualDemo } from '@hsi/counterfactual-engine';
//   const out = counterfactualDemo();
//   out.counterfactuals.forEach((c) => console.log(c.scenarioName, c.summary));
// =============================================================================

export * from './types';
export * from './simulation';
export * from './counterfactual';
export * from './interventions';
export * from './validation';
export * from './worldforge';
export * from './fixtures';
