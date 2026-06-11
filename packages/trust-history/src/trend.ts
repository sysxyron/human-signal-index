// =============================================================================
// @hsi/trust-history — trust TREND classification.
//
// Classifies a trust-history series as improving / stable / degrading / volatile
// from its per-step changes. ADVISORY + EXPLAINABLE: the slope and volatility
// are reported with the numbers + thresholds that produced them. NEVER acts.
//
// CLASSIFICATION (priority order, thresholds documented):
//   volatile  : step-change volatility (stddev of deltas) > VOLATILITY_THRESHOLD
//   improving : mean per-step change >  +SLOPE_THRESHOLD
//   degrading : mean per-step change <  −SLOPE_THRESHOLD
//   stable    : none of the above (slope within ±threshold, low volatility).
//
// A series shorter than MIN_TREND_SAMPLES is classified `stable` with an explicit
// "insufficient history" limitation — never a confident verdict on 1–2 points.
// =============================================================================

import type { TrustSnapshot, TrustTrend, TrustTrendResult } from './types';
import { round } from './history';

/** Minimum snapshots before a non-trivial trend is asserted. */
export const MIN_TREND_SAMPLES = 3;
/** |mean per-step change| above which the series is trending (trust points). */
export const SLOPE_THRESHOLD = 1.5;
/** Step-change stddev above which the series is volatile (trust points). */
export const VOLATILITY_THRESHOLD = 8;

function mean(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, n) => a + n, 0) / nums.length;
}

function stddev(nums: number[]): number {
  if (nums.length === 0) return 0;
  const m = mean(nums);
  const variance = mean(nums.map((n) => (n - m) * (n - m)));
  return Math.sqrt(variance);
}

/** The per-step changes (deltas) between consecutive scores. */
function stepDeltas(scores: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < scores.length; i++) out.push(scores[i] - scores[i - 1]);
  return out;
}

/**
 * Classify how a trust series is trending. `history` is taken in chronological
 * order (oldest → newest); pass a window via getTrustHistory(limit) for a
 * recency-weighted view. Inputs are NOT mutated.
 */
export function computeTrustTrend(
  history: TrustSnapshot[],
  opts?: {
    slopeThreshold?: number;
    volatilityThreshold?: number;
    minSamples?: number;
  },
): TrustTrendResult {
  const slopeThreshold = opts?.slopeThreshold ?? SLOPE_THRESHOLD;
  const volatilityThreshold = opts?.volatilityThreshold ?? VOLATILITY_THRESHOLD;
  const minSamples = opts?.minSamples ?? MIN_TREND_SAMPLES;

  const scores = history.map((s) => s.trustScore);
  const sampleCount = scores.length;
  const first = sampleCount > 0 ? scores[0] : 0;
  const last = sampleCount > 0 ? scores[sampleCount - 1] : 0;
  const delta = round(last - first);
  const deltas = stepDeltas(scores);
  const slope = round(mean(deltas));
  const volatility = round(stddev(deltas));
  const avg = round(mean(scores));

  const limitations: string[] = [];
  let trend: TrustTrend = 'stable';
  let explanation: string;

  if (sampleCount < minSamples) {
    limitations.push(
      `History of ${sampleCount} snapshot(s) is below the ${minSamples}-point floor for a confident trend; reported as stable.`,
    );
    explanation =
      `Only ${sampleCount} snapshot(s) available (need ${minSamples}); ` +
      `net change ${delta} points. Trend held at stable pending more history.`;
  } else if (volatility > volatilityThreshold) {
    trend = 'volatile';
    explanation =
      `Step-change volatility ${volatility} > ${volatilityThreshold} points ` +
      `(net change ${delta}, mean step ${slope}). Trust is swinging — unstable, not a clean direction.`;
  } else if (slope > slopeThreshold) {
    trend = 'improving';
    explanation =
      `Mean per-step change ${slope} > +${slopeThreshold} points over ${sampleCount} snapshots ` +
      `(net +${delta}). Trust is improving with low volatility (${volatility}).`;
  } else if (slope < -slopeThreshold) {
    trend = 'degrading';
    explanation =
      `Mean per-step change ${slope} < −${slopeThreshold} points over ${sampleCount} snapshots ` +
      `(net ${delta}). Trust is degrading with low volatility (${volatility}).`;
  } else {
    trend = 'stable';
    explanation =
      `Mean per-step change ${slope} within ±${slopeThreshold} and volatility ${volatility} ` +
      `within ${volatilityThreshold} points. Trust is holding steady (net ${delta}).`;
  }

  limitations.push(
    'Trend is advisory and based only on the supplied snapshot series; it does not predict future trust.',
  );

  return {
    trend,
    delta,
    slope,
    mean: avg,
    volatility,
    sampleCount,
    first: round(first),
    last: round(last),
    explanation,
    limitations,
  };
}

/** Map a trend to an advisory severity for triage (degrading/volatile escalate). */
export function trendSeverity(
  result: TrustTrendResult,
): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  if (result.trend === 'improving' || result.trend === 'stable') return 'LOW';
  // degrading / volatile escalate by how far they moved.
  const move = result.trend === 'degrading' ? Math.abs(result.delta) : result.volatility;
  if (move >= 25) return 'CRITICAL';
  if (move >= 15) return 'HIGH';
  if (move >= 8) return 'MEDIUM';
  return 'LOW';
}
