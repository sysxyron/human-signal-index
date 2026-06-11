// =============================================================================
// @hsi/trust-history — public entry point (WorldForge/HSI Phase 17).
//
// TRUST HISTORY + TREND + DRIFT + PROVENANCE. Tracks how a Phase-16 trust score
// EVOLVES over time: append-only snapshots, trend classification (improving /
// stable / degrading / volatile), drift detection (collapse / degradation /
// instability / over- / under-confidence), and full provenance ("why should I
// trust this, and how did it change?").
//
// PRINCIPLES (binding):
//   * PURE & DETERMINISTIC — callers inject `now`; NO Date.now()/Math.random().
//   * OFFLINE — fixtures + local heuristics; no network, no clocks, no keys.
//   * APPEND-ONLY — history is never overwritten.
//   * EXPLAINABLE + AUDITABLE + REPRODUCIBLE — never opaque, never auto-correct
//     trust (drift only RECOMMENDS recalibration for a human reviewer).
//
// __examples__
//   import { trustHistoryDemo } from '@hsi/trust-history';
//   const out = trustHistoryDemo();
//   console.log(out.trend.degrading.trend); // 'degrading'
// =============================================================================

export * from './types';
export * from './history';
export * from './trend';
export * from './drift';
export * from './provenance';
export * from './fixtures';
