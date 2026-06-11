// =============================================================================
// @hsi/calibration-engine — calibration core.
//
// Buckets predictions into confidence bins and measures, per bin, how often the
// predicted outcome ACTUALLY occurred. This is the heart of "what does 82%
// confidence actually mean?" — it answers with real historical success rates,
// never a fabricated number.
//
// METRICS:
//   * calibrationError(bin) = |meanConfidence − observedSuccess|.
//   * ECE = Σ (count_i / N) · error_i        (count-weighted mean error).
//   * MCE = max over populated bins of error_i.
//   * overconfidenceIndex = mean(confidence − success), signed (+ overconfident).
// =============================================================================

import type {
  CalibrationBin,
  Prediction,
  ReliabilityCurve,
} from './types';

/** Default number of confidence bins (0–100% in 10-point bands). */
export const DEFAULT_BINS = 10;

/** Edges of the default 10-bin layout, 0..1 inclusive (length = DEFAULT_BINS+1). */
export const BIN_EDGES: readonly number[] = Object.freeze([
  0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0,
]);

function round(n: number, dp = 4): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * Normalise an observed success value: accepts 0..1 directly, or a 0..100
 * fractional score which is divided by 100. Anything else is clamped to 0..1.
 */
function normSuccess(success: number): number {
  if (Number.isNaN(success)) return 0;
  if (success > 1) return clamp01(success / 100);
  return clamp01(success);
}

/**
 * Index of the bin containing `confidence`. Lower-edge inclusive, upper-edge
 * exclusive, EXCEPT the final bin which is inclusive of 1.0. Out-of-range inputs
 * are clamped into the first/last bin.
 */
export function binIndex(confidence: number, bins: number = DEFAULT_BINS): number {
  const c = clamp01(confidence);
  if (c >= 1) return bins - 1;
  const idx = Math.floor(c * bins);
  return Math.min(bins - 1, Math.max(0, idx));
}

function pct(n: number): string {
  return `${Math.round(n * 1000) / 10}%`;
}

function binLabel(lower: number, upper: number): string {
  return `${Math.round(lower * 100)}–${Math.round(upper * 100)}%`;
}

/**
 * Build a reliability curve by bucketing predictions into confidence bins and
 * comparing mean stated confidence against mean observed success per bin.
 * Deterministic: depends only on the predictions + injected timing.
 */
export function calibrate(
  predictions: Prediction[],
  opts?: { bins?: number; now?: string },
): ReliabilityCurve {
  const binCount = opts?.bins ?? DEFAULT_BINS;
  const generatedAt = opts?.now ?? predictions[0]?.at ?? '1970-01-01T00:00:00.000Z';

  const buckets: { conf: number[]; succ: number[] }[] = [];
  for (let i = 0; i < binCount; i++) buckets.push({ conf: [], succ: [] });

  for (const p of predictions) {
    const idx = binIndex(p.confidence, binCount);
    buckets[idx].conf.push(clamp01(p.confidence));
    buckets[idx].succ.push(normSuccess(p.success));
  }

  const bins: CalibrationBin[] = buckets.map((b, i) => {
    const lower = i / binCount;
    const upper = (i + 1) / binCount;
    const count = b.conf.length;
    const meanConfidence =
      count > 0 ? round(b.conf.reduce((a, x) => a + x, 0) / count) : 0;
    const observedSuccess =
      count > 0 ? round(b.succ.reduce((a, x) => a + x, 0) / count) : 0;
    const calibrationError =
      count > 0 ? round(Math.abs(meanConfidence - observedSuccess)) : 0;
    return {
      lower: round(lower),
      upper: round(upper),
      label: binLabel(lower, upper),
      count,
      meanConfidence,
      observedSuccess,
      calibrationError,
    };
  });

  const sampleCount = predictions.length;

  // ECE: count-weighted mean of per-bin calibration error.
  const expectedCalibrationError =
    sampleCount > 0
      ? round(
          bins.reduce((a, b) => a + (b.count / sampleCount) * b.calibrationError, 0),
        )
      : 0;

  // MCE: max error over POPULATED bins.
  const populated = bins.filter((b) => b.count > 0);
  const maxCalibrationError =
    populated.length > 0
      ? round(Math.max(...populated.map((b) => b.calibrationError)))
      : 0;

  // overconfidenceIndex: signed mean(confidence − success) over all samples.
  let confSum = 0;
  let succSum = 0;
  for (const p of predictions) {
    confSum += clamp01(p.confidence);
    succSum += normSuccess(p.success);
  }
  const overconfidenceIndex =
    sampleCount > 0 ? round((confSum - succSum) / sampleCount) : 0;

  return {
    bins,
    sampleCount,
    expectedCalibrationError,
    maxCalibrationError,
    overconfidenceIndex,
    generatedAt,
  };
}

/**
 * Translate a stated confidence into its grounded historical meaning using the
 * bin that CONTAINS that confidence. Produces the spec sentence:
 *   "82% confidence predictions have historically succeeded 80.9% of the time
 *    across N observations."
 */
export function confidenceMeaning(
  curve: ReliabilityCurve,
  confidence: number,
): {
  statedConfidence: number;
  historicalSuccess: number;
  sampleCount: number;
  sentence: string;
} {
  const c = clamp01(confidence);
  const binCount = curve.bins.length || DEFAULT_BINS;
  const idx = binIndex(c, binCount);
  const bin = curve.bins[idx];
  const historicalSuccess = bin ? bin.observedSuccess : 0;
  const count = bin ? bin.count : 0;

  const sentence =
    count > 0
      ? `${pct(c)} confidence predictions have historically succeeded ` +
        `${pct(historicalSuccess)} of the time across ${count} observations.`
      : `${pct(c)} confidence predictions have no historical observations yet ` +
        `(0 in the ${bin ? bin.label : 'n/a'} bin) — meaning cannot be grounded.`;

  return {
    statedConfidence: round(c),
    historicalSuccess,
    sampleCount: count,
    sentence,
  };
}
