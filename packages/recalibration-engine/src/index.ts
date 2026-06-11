// =============================================================================
// @hsi/recalibration-engine — public entry point (WorldForge/HSI Phase 17).
//
// RECALIBRATION RECOMMENDATION + GOVERNANCE WORKFLOW. Recommends a confidence
// recalibration (a PROPOSAL) when trust drifts or calibration error crosses a
// threshold, then routes it through human governance (review → approve / reject)
// with a full audit trail, the previous state preserved, and full reversibility.
//
// PRINCIPLES (binding):
//   * PURE & DETERMINISTIC — callers inject `now`; NO Date.now()/Math.random().
//   * OFFLINE — fixtures + local heuristics; no network, no clocks, no keys.
//   * PROPOSAL ONLY — recommendations never mutate trust/confidence; only an
//     explicit human approval produces a new state (previous state preserved).
//   * EXPLAINABLE + AUDITABLE + REVERSIBLE.
//
// __examples__
//   import { recalibrationDemo } from '@hsi/recalibration-engine';
//   const out = recalibrationDemo();
//   console.log(out.approval.status); // 'approved'
// =============================================================================

export * from './types';
export * from './propose';
export * from './governance';
export * from './fixtures';
