// =============================================================================
// @hsi/forecast-engine — the FORECAST RELIABILITY layer.
//
// computeForecastAccuracy (success/failure rates), computeForecastCalibration
// (reliability-diagram bins + Expected Calibration Error), and
// computeForecastBrierScore (mean squared error of confidence vs outcome). All
// pure + deterministic, grounding "how reliable are our forecasts?" in observed
// outcomes — never opaque.
// =============================================================================

import { clamp01, round } from './forecast';
import type {
  CalibrationBin,
  ForecastAccuracy,
  ForecastBrier,
  ForecastCalibration,
  ForecastOutcome,
} from './types';

/** Treat a forecast outcome as a success when its observed success ≥ this. */
export const SUCCESS_THRESHOLD = 0.5;

/** Compute success/failure rates over a set of forecast outcomes. */
export function computeForecastAccuracy(outcomes: ForecastOutcome[]): ForecastAccuracy {
  const n = outcomes.length;
  if (n === 0) return { successRate: 0, failureRate: 0, sampleCount: 0 };
  const successes = outcomes.filter((o) => clamp01(o.success) >= SUCCESS_THRESHOLD).length;
  const successRate = round(successes / n);
  return { successRate, failureRate: round(1 - successRate), sampleCount: n };
}

/**
 * Compute forecast calibration: bin outcomes by predicted confidence (5 bins),
 * compare mean predicted confidence to observed success per bin, and roll up the
 * count-weighted Expected Calibration Error (ECE). Lower ECE = better calibrated.
 */
export function computeForecastCalibration(outcomes: ForecastOutcome[]): ForecastCalibration {
  const edges = [0, 0.2, 0.4, 0.6, 0.8, 1.0001];
  const bins: CalibrationBin[] = [];
  let eceWeighted = 0;
  const n = outcomes.length;

  for (let i = 0; i < edges.length - 1; i++) {
    const lower = edges[i];
    const upper = i === edges.length - 2 ? 1 : edges[i + 1];
    const inBin = outcomes.filter((o) => {
      const c = clamp01(o.confidence);
      return c >= edges[i] && c < edges[i + 1];
    });
    const count = inBin.length;
    const meanConfidence = count > 0 ? inBin.reduce((a, o) => a + clamp01(o.confidence), 0) / count : 0;
    const observedSuccess = count > 0 ? inBin.reduce((a, o) => a + clamp01(o.success), 0) / count : 0;
    const error = Math.abs(meanConfidence - observedSuccess);
    if (count > 0 && n > 0) eceWeighted += (count / n) * error;
    bins.push({
      label: `${Math.round(lower * 100)}–${Math.round(upper * 100)}%`,
      lower,
      upper,
      count,
      meanConfidence: round(meanConfidence),
      observedSuccess: round(observedSuccess),
      error: round(error),
    });
  }
  return { ece: round(eceWeighted), bins, sampleCount: n };
}

/** Compute the Brier score (mean squared error of confidence vs outcome). */
export function computeForecastBrierScore(outcomes: ForecastOutcome[]): ForecastBrier {
  const n = outcomes.length;
  if (n === 0) return { score: 0, sampleCount: 0, interpretation: 'No outcomes yet — Brier score undefined.' };
  const sumSq = outcomes.reduce((a, o) => {
    const c = clamp01(o.confidence);
    const s = clamp01(o.success);
    return a + (c - s) * (c - s);
  }, 0);
  const score = round(sumSq / n);
  const interpretation =
    score <= 0.1 ? 'Excellent — forecasts track outcomes very closely.'
      : score <= 0.2 ? 'Good — forecasts are well aligned with outcomes.'
        : score <= 0.3 ? 'Fair — noticeable miscalibration.'
          : 'Poor — forecasts diverge substantially from outcomes.';
  return { score, sampleCount: n, interpretation };
}

/**
 * Forecast DRIFT: the change in ECE between a prior and current calibration.
 * Positive = calibration got worse. Advisory only.
 */
export function computeForecastDrift(prior: ForecastCalibration, current: ForecastCalibration): number {
  return round(current.ece - prior.ece);
}
