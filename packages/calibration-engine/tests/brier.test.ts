import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BRIER_EXCELLENT,
  BRIER_FAIR,
  BRIER_GOOD,
  brierByKind,
  computeBrierScore,
} from '../src/brier';
import { DEMO_PREDICTIONS } from '../src/fixtures';

function pairs(confidence: number, success: number, n: number) {
  return Array.from({ length: n }, () => ({ confidence, success }));
}

test('empty input -> score 0, insufficient_data', () => {
  const r = computeBrierScore([]);
  assert.equal(r.score, 0);
  assert.equal(r.sampleCount, 0);
  assert.equal(r.calibrationQuality, 'insufficient_data');
});

test('all-correct confident -> low score', () => {
  const r = computeBrierScore(pairs(1, 1, 10));
  assert.equal(r.score, 0);
  assert.equal(r.calibrationQuality, 'excellent');
});

test('all-wrong confident -> score ~ 1', () => {
  const r = computeBrierScore(pairs(1, 0, 10));
  assert.equal(r.score, 1);
  assert.equal(r.calibrationQuality, 'poor');
});

test('50/50 confidence on mixed outcomes -> ~0.25', () => {
  const half = [...pairs(0.5, 1, 5), ...pairs(0.5, 0, 5)];
  const r = computeBrierScore(half);
  assert.ok(Math.abs(r.score - 0.25) < 1e-9);
});

test('score equals mean squared error', () => {
  const data = [
    { confidence: 0.9, success: 1 },
    { confidence: 0.2, success: 0 },
    { confidence: 0.6, success: 1 },
    { confidence: 0.4, success: 0 },
    { confidence: 0.5, success: 1 },
  ];
  const manual =
    data.reduce((a, d) => a + (d.confidence - d.success) ** 2, 0) / data.length;
  const r = computeBrierScore(data);
  assert.ok(Math.abs(r.score - manual) < 1e-4);
});

test('quality excellent below 0.10', () => {
  const r = computeBrierScore(pairs(0.95, 1, 10));
  assert.ok(r.score < BRIER_EXCELLENT);
  assert.equal(r.calibrationQuality, 'excellent');
});

test('quality good in [0.10, 0.18)', () => {
  // score = 0.16
  const r = computeBrierScore(pairs(0.6, 1, 10));
  assert.ok(r.score >= BRIER_EXCELLENT && r.score < BRIER_GOOD, `score=${r.score}`);
  assert.equal(r.calibrationQuality, 'good');
});

test('quality fair in [0.18, 0.25)', () => {
  // score = 0.2025
  const r = computeBrierScore(pairs(0.55, 1, 10));
  assert.ok(r.score >= BRIER_GOOD && r.score < BRIER_FAIR, `score=${r.score}`);
  assert.equal(r.calibrationQuality, 'fair');
});

test('quality poor at or above 0.25', () => {
  const r = computeBrierScore(pairs(0.5, 0, 10));
  assert.ok(r.score >= BRIER_FAIR);
  assert.equal(r.calibrationQuality, 'poor');
});

test('insufficient_data below 5 samples even when perfect', () => {
  const r = computeBrierScore(pairs(1, 1, 4));
  assert.equal(r.score, 0);
  assert.equal(r.calibrationQuality, 'insufficient_data');
});

test('exactly 5 samples is enough for a verdict', () => {
  const r = computeBrierScore(pairs(1, 1, 5));
  assert.equal(r.calibrationQuality, 'excellent');
});

test('interpretation mentions the score', () => {
  const r = computeBrierScore(pairs(1, 1, 10));
  assert.match(r.interpretation, /Brier score/);
});

test('interpretation withholds verdict when insufficient', () => {
  const r = computeBrierScore(pairs(1, 1, 3));
  assert.match(r.interpretation, /withheld/);
});

test('success normalised from /100 score', () => {
  const r = computeBrierScore(pairs(0.8, 80, 10));
  assert.equal(r.score, 0); // 0.8 vs 0.8
});

test('decomposition present when >=5 samples', () => {
  const data = [...pairs(0.9, 1, 5), ...pairs(0.3, 0, 5)];
  const r = computeBrierScore(data);
  assert.ok(r.decomposition);
});

test('decomposition absent when <5 samples', () => {
  const r = computeBrierScore(pairs(0.9, 1, 4));
  assert.equal(r.decomposition, undefined);
});

test('Murphy identity: score ~ reliability - resolution + uncertainty', () => {
  const data = [
    ...pairs(0.9, 1, 8),
    ...pairs(0.9, 0, 2),
    ...pairs(0.3, 1, 3),
    ...pairs(0.3, 0, 7),
  ];
  const r = computeBrierScore(data);
  assert.ok(r.decomposition);
  const d = r.decomposition!;
  const recomposed = d.reliability - d.resolution + d.uncertainty;
  assert.ok(Math.abs(recomposed - r.score) < 1e-3, `recomposed=${recomposed} score=${r.score}`);
});

test('decomposition components are non-negative', () => {
  const data = [...pairs(0.9, 1, 5), ...pairs(0.3, 0, 5)];
  const r = computeBrierScore(data);
  const d = r.decomposition!;
  assert.ok(d.reliability >= 0);
  assert.ok(d.resolution >= 0);
  assert.ok(d.uncertainty >= 0);
});

test('brierByKind has all four kinds', () => {
  const r = brierByKind(DEMO_PREDICTIONS);
  assert.deepEqual(Object.keys(r).sort(), [
    'forecast',
    'intervention',
    'narrative',
    'recommendation',
  ]);
});

test('brierByKind sample counts partition the input', () => {
  const r = brierByKind(DEMO_PREDICTIONS);
  const total =
    r.recommendation.sampleCount +
    r.forecast.sampleCount +
    r.intervention.sampleCount +
    r.narrative.sampleCount;
  assert.equal(total, DEMO_PREDICTIONS.length);
});

test('brierByKind narrative score matches direct computation', () => {
  const r = brierByKind(DEMO_PREDICTIONS);
  const direct = computeBrierScore(
    DEMO_PREDICTIONS.filter((p) => p.kind === 'narrative').map((p) => ({
      confidence: p.confidence,
      success: p.success,
    })),
  );
  assert.equal(r.narrative.score, direct.score);
});

test('score is bounded in [0,1]', () => {
  const r = computeBrierScore(DEMO_PREDICTIONS.map((p) => ({ confidence: p.confidence, success: p.success })));
  assert.ok(r.score >= 0 && r.score <= 1);
});

test('deterministic across runs', () => {
  const data = DEMO_PREDICTIONS.map((p) => ({ confidence: p.confidence, success: p.success }));
  assert.deepEqual(computeBrierScore(data), computeBrierScore(data));
});
