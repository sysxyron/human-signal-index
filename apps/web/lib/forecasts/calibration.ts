// =============================================================================
// HSI Phase 67 — Calibration + performance metrics (PURE, computed, no fabrication).
//
// Calibration compares STATED confidence against ACTUAL accuracy per confidence
// band (the calibration curve). Performance rolls up accuracy / precision /
// resolution / calibration / trend accuracy. All deterministic from evaluated
// forecasts; empty inputs → 0 (never a fabricated score). PURE.
// =============================================================================

import type { CalibrationBucket, PerformanceMetrics, ForecastStatus, EvaluationResult, PredictionType } from './types';

export interface EvalRecord {
  status: ForecastStatus;
  result: EvaluationResult | null;
  confidence: number | null;
  brier: number | null;
  predictionType: PredictionType;
}

function r2(n: number): number { return Math.round(n * 100) / 100; }
function pct(n: number, d: number): number { return d <= 0 ? 0 : Math.round((n / d) * 100); }

/** Confidence band label for a 0–1 confidence. */
export function confidenceBand(c: number): string {
  const i = Math.max(0, Math.min(9, Math.floor(c * 10)));
  return `${(i / 10).toFixed(1)}–${((i + 1) / 10).toFixed(1)}`;
}

/** Numeric credit for a result toward "accuracy": correct=1, partial=0.5, else 0. */
function credit(result: EvaluationResult | null): number {
  return result === 'correct' ? 1 : result === 'partial' ? 0.5 : 0;
}

/** Calibration curve: per band, avg stated confidence vs actual accuracy. */
export function buildCalibrationCurve(records: EvalRecord[]): CalibrationBucket[] {
  const evaluated = records.filter((r) => r.confidence != null && (r.result === 'correct' || r.result === 'incorrect' || r.result === 'partial'));
  const byBand = new Map<string, { conf: number[]; credit: number[] }>();
  for (const r of evaluated) {
    const band = confidenceBand(r.confidence!);
    const e = byBand.get(band) ?? { conf: [], credit: [] };
    e.conf.push(r.confidence!);
    e.credit.push(credit(r.result));
    byBand.set(band, e);
  }
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : 0);
  return Array.from(byBand.entries())
    .map(([bucket, e]) => ({ bucket, predictedConfidence: r2(avg(e.conf)), actualAccuracy: r2(avg(e.credit)), count: e.conf.length }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket));
}

/** 1 − mean |predicted − actual| over non-empty bands. 1.0 = perfectly calibrated. */
export function calibrationScore(buckets: CalibrationBucket[]): number {
  if (buckets.length === 0) return 0;
  const dev = buckets.reduce((sum, b) => sum + Math.abs(b.predictedConfidence - b.actualAccuracy), 0) / buckets.length;
  return r2(Math.max(0, 1 - dev));
}

/** Over/under-confidence: positive = overconfident (stated > actual). */
export function confidenceBias(buckets: CalibrationBucket[]): number {
  if (buckets.length === 0) return 0;
  return r2(buckets.reduce((s, b) => s + (b.predictedConfidence - b.actualAccuracy), 0) / buckets.length);
}

export function performanceMetrics(records: EvalRecord[]): PerformanceMetrics {
  const total = records.length;
  const resolved = records.filter((r) => r.status === 'resolved').length;
  const expired = records.filter((r) => r.status === 'expired').length;
  const correct = records.filter((r) => r.result === 'correct').length;
  const incorrect = records.filter((r) => r.result === 'incorrect').length;
  const briers = records.map((r) => r.brier).filter((n): n is number => typeof n === 'number');
  const meanBrier = briers.length ? briers.reduce((a, x) => a + x, 0) / briers.length : null;
  const buckets = buildCalibrationCurve(records);

  const trend = records.filter((r) => r.predictionType === 'trend' && (r.result === 'correct' || r.result === 'incorrect' || r.result === 'partial'));
  const trendCorrect = trend.filter((r) => r.result === 'correct').length;

  return {
    total,
    resolved,
    expired,
    accuracy: pct(correct, resolved),
    precision: pct(correct, correct + incorrect),
    resolutionRate: pct(resolved, total),
    expirationRate: pct(expired, total),
    confidenceQuality: meanBrier == null ? 0 : Math.round((1 - meanBrier) * 100),
    calibrationScore: Math.round(calibrationScore(buckets) * 100),
    volume: total,
    trendAccuracy: pct(trendCorrect, trend.length),
  };
}
