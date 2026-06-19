import { test } from 'node:test';
import assert from 'node:assert/strict';

import { brierScore, evaluatePrediction } from './evaluation';
import { confidenceBand, buildCalibrationCurve, calibrationScore, performanceMetrics, type EvalRecord } from './calibration';
import { FORECAST_STATUSES, PREDICTION_TYPES, isForecastStatus, isPredictionType } from './types';

// ---- vocabulary ------------------------------------------------------------

test('5 statuses, 7 prediction types', () => {
  assert.equal(FORECAST_STATUSES.length, 5);
  assert.equal(PREDICTION_TYPES.length, 7);
  assert.ok(isForecastStatus('resolved'));
  assert.ok(!isForecastStatus('done'));
  assert.ok(isPredictionType('probability'));
  assert.ok(!isPredictionType('guess'));
});

// ---- evaluation (deterministic) --------------------------------------------

test('brierScore', () => {
  assert.equal(brierScore(1, 1), 0);
  assert.equal(brierScore(0, 1), 1);
  assert.equal(brierScore(0.5, 1), 0.25);
});

test('evaluatePrediction: unresolved when no outcome', () => {
  assert.equal(evaluatePrediction('binary', { outcome: 'yes' }, null).result, 'unresolved');
  assert.equal(evaluatePrediction('binary', { outcome: 'yes' }, {}).result, 'unresolved');
});

test('evaluatePrediction: binary + event', () => {
  assert.equal(evaluatePrediction('binary', { outcome: 'yes' }, { outcome: 'yes' }).result, 'correct');
  assert.equal(evaluatePrediction('binary', { outcome: 'yes' }, { outcome: 'no' }).result, 'incorrect');
  assert.equal(evaluatePrediction('event', { willOccur: true }, { occurred: true }).result, 'correct');
  assert.equal(evaluatePrediction('event', { willOccur: true }, { occurred: false }).result, 'incorrect');
});

test('evaluatePrediction: probability uses brier + threshold', () => {
  const hit = evaluatePrediction('probability', { probability: 0.8 }, { outcome: 'yes' });
  assert.equal(hit.result, 'correct');
  assert.ok((hit.score ?? 0) > 0.9); // 1 - 0.04
  const miss = evaluatePrediction('probability', { probability: 0.8 }, { outcome: 'no' });
  assert.equal(miss.result, 'incorrect');
});

test('evaluatePrediction: range correct / partial / incorrect', () => {
  assert.equal(evaluatePrediction('range', { min: 10, max: 20 }, { value: 15 }).result, 'correct');
  assert.equal(evaluatePrediction('range', { min: 10, max: 20 }, { value: 21 }).result, 'partial'); // within 10%
  assert.equal(evaluatePrediction('range', { min: 10, max: 20 }, { value: 40 }).result, 'incorrect');
});

test('evaluatePrediction: multi-outcome / narrative / trend by option match', () => {
  assert.equal(evaluatePrediction('multi-outcome', { option: 'A' }, { option: 'A' }).result, 'correct');
  assert.equal(evaluatePrediction('narrative', { direction: 'growing' }, { direction: 'declining' }).result, 'incorrect');
  assert.equal(evaluatePrediction('trend', { direction: 'up' }, { direction: 'up' }).result, 'correct');
});

// ---- calibration -----------------------------------------------------------

test('confidenceBand buckets', () => {
  assert.equal(confidenceBand(0.05), '0.0–0.1');
  assert.equal(confidenceBand(0.75), '0.7–0.8');
  assert.equal(confidenceBand(1), '0.9–1.0');
});

function rec(over: Partial<EvalRecord>): EvalRecord {
  return { status: 'resolved', result: 'correct', confidence: 0.8, brier: 0.04, predictionType: 'probability', ...over };
}

test('buildCalibrationCurve groups by band; calibrationScore rewards alignment', () => {
  const records = [
    rec({ confidence: 0.85, result: 'correct' }),
    rec({ confidence: 0.82, result: 'correct' }),
    rec({ confidence: 0.81, result: 'incorrect' }),
  ];
  const buckets = buildCalibrationCurve(records);
  assert.equal(buckets.length, 1);
  assert.equal(buckets[0].bucket, '0.8–0.9');
  assert.equal(buckets[0].count, 3);
  assert.ok(Math.abs(buckets[0].actualAccuracy - 0.67) < 0.02); // 2/3 correct
  const score = calibrationScore(buckets);
  assert.ok(score >= 0 && score <= 1);
});

test('calibrationScore empty → 0 (no fabrication)', () => {
  assert.equal(calibrationScore([]), 0);
});

// ---- performance -----------------------------------------------------------

test('performanceMetrics computes accuracy / resolution / calibration', () => {
  const records: EvalRecord[] = [
    rec({ status: 'resolved', result: 'correct', confidence: 0.9, brier: 0.01 }),
    rec({ status: 'resolved', result: 'incorrect', confidence: 0.8, brier: 0.64 }),
    rec({ status: 'expired', result: 'expired', confidence: 0.5, brier: null }),
    rec({ status: 'active', result: null, confidence: 0.6, brier: null }),
  ];
  const p = performanceMetrics(records);
  assert.equal(p.total, 4);
  assert.equal(p.resolved, 2);
  assert.equal(p.expired, 1);
  assert.equal(p.accuracy, 50);       // 1 correct of 2 resolved
  assert.equal(p.precision, 50);      // 1 / (1+1)
  assert.equal(p.resolutionRate, 50); // 2 / 4
  assert.equal(p.expirationRate, 25); // 1 / 4
  assert.ok(p.calibrationScore >= 0 && p.calibrationScore <= 100);
});

test('performanceMetrics empty → all zero (no fabrication)', () => {
  const p = performanceMetrics([]);
  assert.equal(p.accuracy, 0);
  assert.equal(p.calibrationScore, 0);
  assert.equal(p.volume, 0);
});
