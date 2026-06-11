// =============================================================================
// @hsi/calibration-engine — Brier scoring.
//
// Brier score = mean((confidence − success)^2) ∈ [0,1], lower is better. It
// jointly penalises miscalibration AND lack of resolution. We map it to a
// quality band and, when feasible, provide the Murphy 3-component decomposition:
//   score = reliability − resolution + uncertainty.
//
// THRESHOLDS (documented):
//   excellent < 0.10 ≤ good < 0.18 ≤ fair < 0.25 ≤ poor.
//   sampleCount < 5 → insufficient_data (score still reported, NEVER forced).
// =============================================================================

import { binIndex, DEFAULT_BINS } from './calibration';
import type { BrierResult, Prediction } from './types';

const MIN_SAMPLES = 5;
export const BRIER_EXCELLENT = 0.1;
export const BRIER_GOOD = 0.18;
export const BRIER_FAIR = 0.25;

function round(n: number, dp = 4): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function normSuccess(success: number): number {
  if (Number.isNaN(success)) return 0;
  if (success > 1) return clamp01(success / 100);
  return clamp01(success);
}

function qualityOf(
  score: number,
  n: number,
): BrierResult['calibrationQuality'] {
  if (n < MIN_SAMPLES) return 'insufficient_data';
  if (score < BRIER_EXCELLENT) return 'excellent';
  if (score < BRIER_GOOD) return 'good';
  if (score < BRIER_FAIR) return 'fair';
  return 'poor';
}

/**
 * Murphy decomposition of the Brier score over `bins` confidence buckets.
 *   reliability  = Σ (n_k/N)(conf_k − obs_k)^2     (lower = better calibrated)
 *   resolution   = Σ (n_k/N)(obs_k − base)^2       (higher = more discriminating)
 *   uncertainty  = base(1 − base)                  (irreducible, base = mean success)
 * Returns undefined when there are too few samples for a meaningful split.
 */
function decompose(
  preds: { confidence: number; success: number }[],
  bins: number,
): BrierResult['decomposition'] | undefined {
  const n = preds.length;
  if (n < MIN_SAMPLES) return undefined;
  const base = preds.reduce((a, p) => a + normSuccess(p.success), 0) / n;

  const buckets: { conf: number[]; succ: number[] }[] = [];
  for (let i = 0; i < bins; i++) buckets.push({ conf: [], succ: [] });
  for (const p of preds) {
    const idx = binIndex(p.confidence, bins);
    buckets[idx].conf.push(clamp01(p.confidence));
    buckets[idx].succ.push(normSuccess(p.success));
  }

  let reliability = 0;
  let resolution = 0;
  for (const b of buckets) {
    const k = b.conf.length;
    if (k === 0) continue;
    const confK = b.conf.reduce((a, x) => a + x, 0) / k;
    const obsK = b.succ.reduce((a, x) => a + x, 0) / k;
    reliability += (k / n) * Math.pow(confK - obsK, 2);
    resolution += (k / n) * Math.pow(obsK - base, 2);
  }
  const uncertainty = base * (1 - base);

  return {
    reliability: round(reliability),
    resolution: round(resolution),
    uncertainty: round(uncertainty),
  };
}

/**
 * Compute the Brier score over a set of (confidence, success) pairs.
 * Observed success is normalised (a >1 value is treated as a /100 score).
 * NEVER forces a verdict: when n < 5, quality is `insufficient_data` but the
 * raw score is still reported honestly.
 */
export function computeBrierScore(
  predictions: { confidence: number; success: number }[],
  opts?: { bins?: number },
): BrierResult {
  const n = predictions.length;
  if (n === 0) {
    return {
      score: 0,
      sampleCount: 0,
      interpretation:
        'No predictions supplied — Brier score is undefined; no calibration claim can be made.',
      calibrationQuality: 'insufficient_data',
    };
  }

  const score = round(
    predictions.reduce(
      (a, p) => a + Math.pow(clamp01(p.confidence) - normSuccess(p.success), 2),
      0,
    ) / n,
  );

  const quality = qualityOf(score, n);
  const decomposition = decompose(predictions, opts?.bins ?? DEFAULT_BINS);

  const interpretation =
    quality === 'insufficient_data'
      ? `Brier score ${score} over only ${n} prediction(s) — below the ${MIN_SAMPLES}-sample floor, so the quality verdict is withheld.`
      : `Brier score ${score} over ${n} predictions → ${quality} calibration ` +
        `(0 = perfect, 0.25 = a coin flip, 1 = always confidently wrong).`;

  return {
    score,
    sampleCount: n,
    interpretation,
    calibrationQuality: quality,
    ...(decomposition ? { decomposition } : {}),
  };
}

/** Brier score per prediction kind. */
export function brierByKind(
  predictions: Prediction[],
  opts?: { bins?: number },
): Record<Prediction['kind'], BrierResult> {
  const kinds: Prediction['kind'][] = [
    'recommendation',
    'forecast',
    'intervention',
    'narrative',
  ];
  const out = {} as Record<Prediction['kind'], BrierResult>;
  for (const kind of kinds) {
    const subset = predictions
      .filter((p) => p.kind === kind)
      .map((p) => ({ confidence: p.confidence, success: p.success }));
    out[kind] = computeBrierScore(subset, opts);
  }
  return out;
}
