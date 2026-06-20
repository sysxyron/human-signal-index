// =============================================================================
// HSI Phase 72 — Trust geography aggregation (PURE). Aggregates EXISTING source
// trust scores (hsin_source_trust, 0–100) by geography. No synthetic scoring —
// only real values are counted; absence is NOT OBSERVED (avg null). No I/O.
// =============================================================================

import type { TrustAggregate } from './types';

/** Aggregate real trust scores. Nulls are skipped (NOT OBSERVED). Bands:
 *  high ≥ 70, medium 40–69, low < 40 (matching the Phase 16 trust model). */
export function aggregateTrust(scores: Array<number | null | undefined>): TrustAggregate {
  const real = scores.filter((s): s is number => typeof s === 'number' && Number.isFinite(s));
  if (real.length === 0) return { observed: 0, avg: null, high: 0, medium: 0, low: 0 };
  let high = 0, medium = 0, low = 0, sum = 0;
  for (const s of real) { sum += s; if (s >= 70) high++; else if (s >= 40) medium++; else low++; }
  return { observed: real.length, avg: Math.round((sum / real.length) * 10) / 10, high, medium, low };
}
