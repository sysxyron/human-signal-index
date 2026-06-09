// =============================================================================
// @hsi/counterfactual-engine — forecast validation + confidence calibration.
//
// backtestForecasts scores PAST forecasts against what ACTUALLY happened next
// (derived from the real next snapshot vs the prior snapshot). computeForecast-
// Accuracy summarises fraction-correct + a calibration score. calibrateConfidence
// buckets predictions into low/medium/high bands, measures empirical accuracy per
// band, and derives a corrective adjustment that pulls OVERCONFIDENT bands DOWN
// (e.g. "stated 90% but only 55% correct" → calibrate(0.9) < 0.9). The goal is to
// REDUCE overconfidence so downstream confidence is honest. Deterministic.
// =============================================================================

import type {
  NarrativeForecast,
  NarrativeSnapshot,
} from '@hsi/temporal-intelligence';

import type {
  BacktestRecord,
  Calibration,
  CalibrationBand,
  ConfidenceBand,
  ForecastAccuracy,
} from './types';

// ---- Documented thresholds --------------------------------------------------
/** Stated confidence ≥ this → 'high' band. */
export const HIGH_CONF = 0.66;
/** Stated confidence ≥ this (and < HIGH_CONF) → 'medium' band; else 'low'. */
export const MEDIUM_CONF = 0.4;
/** Signal growth (%) above this between snapshots → "rising"/"emerging". */
export const RISING_GROWTH_PCT = 20;
/** Signal decline (%) below this → "declining". */
export const DECLINING_GROWTH_PCT = -20;

function round(n: number, dp = 4): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function bandFor(conf: number): ConfidenceBand {
  if (conf >= HIGH_CONF) return 'high';
  if (conf >= MEDIUM_CONF) return 'medium';
  return 'low';
}

/**
 * Derive the ACTUAL trajectory state from a prior→after snapshot transition.
 * Grounded purely in observed metric deltas (signals, amplification, staleness).
 */
export function deriveActualState(
  prior: NarrativeSnapshot,
  after: NarrativeSnapshot,
): { state: string; growthPct: number } {
  const growthPct =
    ((after.signalCount - prior.signalCount) / Math.max(1, prior.signalCount)) *
    100;
  const ampDelta = after.amplificationScore - prior.amplificationScore;
  const young = false; // emerging requires age context we don't recompute here.

  let state: string;
  if (after.signalCount === 0 && prior.signalCount > 0) {
    state = 'dead';
  } else if (growthPct >= RISING_GROWTH_PCT || ampDelta > 10) {
    state = young ? 'emerging' : 'rising';
  } else if (growthPct <= DECLINING_GROWTH_PCT || ampDelta < -10) {
    state = 'declining';
  } else {
    state = 'stable';
  }
  return { state, growthPct: round(growthPct, 2) };
}

/**
 * Backtest historical forecasts. For each entry, compare the forecast's
 * predicted state/probability against the actual state derived from the next
 * snapshot, and compute a Brier-style errorScore.
 *
 * Brier here: outcome o = 1 if predicted state was correct else 0; the forecast
 * "probability" is the stated probability for the predicted state, so
 * errorScore = (probability − o)^2 ∈ [0,1]. A confident-but-wrong forecast scores
 * near 1; a confident-and-right one near 0.
 */
export function backtestForecasts(
  history: {
    forecast: NarrativeForecast;
    actualSnapshotAfter: NarrativeSnapshot;
    priorSnapshot: NarrativeSnapshot;
  }[],
  _now: string,
): BacktestRecord[] {
  void _now;
  return history.map((h) => {
    const { state: actualState } = deriveActualState(
      h.priorSnapshot,
      h.actualSnapshotAfter,
    );
    const predictedState = h.forecast.forecastType;
    const predictedProbability = clamp01(h.forecast.probability);
    const correct = predictedState === actualState ? 1 : 0;
    // actualProbability = empirical outcome for the predicted class (0 or 1).
    const actualProbability = correct;
    const errorScore = round(
      Math.pow(predictedProbability - correct, 2),
      4,
    );
    return {
      narrativeId: h.forecast.narrativeId,
      forecastId: h.forecast.id,
      predictedState,
      predictedProbability: round(predictedProbability, 4),
      actualState,
      actualProbability,
      errorScore,
    };
  });
}

/**
 * Summarise accuracy + calibration over a set of backtest records.
 *   accuracyScore   = fraction of records whose predicted state was correct.
 *   calibrationScore = 1 − |meanStatedConfidence − accuracy| (1 = perfect).
 */
export function computeForecastAccuracy(
  records: BacktestRecord[],
  narrativeId: string,
  forecastWindow: string,
): ForecastAccuracy {
  const n = records.length;
  if (n === 0) {
    return {
      narrativeId,
      forecastWindow,
      predictionCount: 0,
      accuracyScore: 0,
      calibrationScore: 0,
    };
  }
  const correct = records.filter(
    (r) => r.predictedState === r.actualState,
  ).length;
  const accuracyScore = round(correct / n, 4);
  const meanConfidence =
    records.reduce((a, r) => a + r.predictedProbability, 0) / n;
  const calibrationScore = round(
    clamp01(1 - Math.abs(meanConfidence - accuracyScore)),
    4,
  );
  return {
    narrativeId,
    forecastWindow,
    predictionCount: n,
    accuracyScore,
    calibrationScore,
  };
}

/**
 * Build a calibration model from backtest records. Buckets predictions by their
 * stated-confidence band, computes empirical accuracy per band, and derives a
 * multiplicative adjustment that pulls OVERCONFIDENT bands DOWN:
 *   adjustment = min(1, empiricalAccuracy / statedConfidence)
 * so an overconfident band (stated > accuracy) gets adjustment < 1, while an
 * under-confident band keeps adjustment 1 (we never inflate confidence).
 *
 * overconfidenceIndex = mean over populated bands of max(0, stated − empirical).
 * calibrate(raw) returns raw * adjustmentForBand(raw), clamped, plus the band.
 */
export function calibrateConfidence(records: BacktestRecord[]): Calibration {
  const BANDS: ConfidenceBand[] = ['low', 'medium', 'high'];
  const grouped: Record<ConfidenceBand, BacktestRecord[]> = {
    low: [],
    medium: [],
    high: [],
  };
  for (const r of records) {
    grouped[bandFor(r.predictedProbability)].push(r);
  }

  // Representative stated confidence per band when empty (band midpoint-ish).
  const fallbackStated: Record<ConfidenceBand, number> = {
    low: 0.3,
    medium: 0.5,
    high: 0.8,
  };

  const bands: CalibrationBand[] = BANDS.map((band) => {
    const grp = grouped[band];
    if (grp.length === 0) {
      return {
        band,
        statedConfidence: fallbackStated[band],
        // No evidence: assume calibrated (no adjustment) to avoid fabricating.
        empiricalAccuracy: fallbackStated[band],
        adjustment: 1,
      };
    }
    const statedConfidence = round(
      grp.reduce((a, r) => a + r.predictedProbability, 0) / grp.length,
      4,
    );
    const empiricalAccuracy = round(
      grp.filter((r) => r.predictedState === r.actualState).length / grp.length,
      4,
    );
    const adjustment =
      statedConfidence > 0
        ? round(Math.min(1, empiricalAccuracy / statedConfidence), 4)
        : 1;
    return { band, statedConfidence, empiricalAccuracy, adjustment };
  });

  const populated = bands.filter((b) => {
    const grp = grouped[b.band];
    return grp.length > 0;
  });
  const overconfidenceIndex =
    populated.length > 0
      ? round(
          populated.reduce(
            (a, b) => a + Math.max(0, b.statedConfidence - b.empiricalAccuracy),
            0,
          ) / populated.length,
          4,
        )
      : 0;

  const adjByBand: Record<ConfidenceBand, number> = {
    low: bands.find((b) => b.band === 'low')!.adjustment,
    medium: bands.find((b) => b.band === 'medium')!.adjustment,
    high: bands.find((b) => b.band === 'high')!.adjustment,
  };

  const calibrate = (raw: number): { calibrated: number; band: ConfidenceBand } => {
    const r = clamp01(raw);
    const band = bandFor(r);
    const adj = adjByBand[band];
    const calibrated = round(clamp01(r * adj), 4);
    return { calibrated, band };
  };

  return { bands, overconfidenceIndex, calibrate };
}
