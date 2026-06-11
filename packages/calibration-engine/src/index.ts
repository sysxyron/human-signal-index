// =============================================================================
// @hsi/calibration-engine — public entry point (WorldForge/HSI Phase 16).
//
// CONFIDENCE CALIBRATION + RELIABILITY ANALYSIS + BRIER SCORING + DRIFT
// DETECTION + TRUST SCORING. Answers "what does 82% confidence actually mean?"
// and "how trustworthy is this?" — grounding every answer in observed outcomes.
//
// PRINCIPLES (binding):
//   * PURE & DETERMINISTIC — callers inject `now`/seed; NO Date.now()/Math.random().
//   * OFFLINE — fixtures + local heuristics; no network, no clocks, no keys.
//   * ZERO runtime deps beyond the @hsi workspace.
//   * EXPLAINABLE + AUDITABLE + REPRODUCIBLE — never opaque, never force a score,
//     never claim certainty, never auto-act (drift only RECOMMENDS recalibration).
//
// __examples__
//   import { calibrationDemo, confidenceMeaning } from '@hsi/calibration-engine';
//   const out = calibrationDemo();
//   console.log(out.meaning82.sentence);
// =============================================================================

export * from './types';
export * from './calibration';
export * from './reliability';
export * from './brier';
export * from './drift';
export * from './trust';
export * from './fixtures';
