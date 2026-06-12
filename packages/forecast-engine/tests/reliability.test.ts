import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeForecastAccuracy,
  computeForecastBrierScore,
  computeForecastCalibration,
  computeForecastDrift,
} from '../src/reliability';
import { DEMO_OUTCOMES, FIXTURE_NOW, forecastDemo } from '../src/fixtures';
import type { ForecastOutcome } from '../src/types';

function o(confidence: number, success: number): ForecastOutcome {
  return { forecastId: 'x', confidence, success };
}

test('accuracy: all-success → rate 1', () => {
  const a = computeForecastAccuracy([o(0.9, 1), o(0.8, 1)]);
  assert.equal(a.successRate, 1);
  assert.equal(a.failureRate, 0);
});

test('accuracy: empty → zeros', () => {
  const a = computeForecastAccuracy([]);
  assert.equal(a.sampleCount, 0);
});

test('accuracy: half success', () => {
  const a = computeForecastAccuracy([o(0.9, 1), o(0.2, 0)]);
  assert.equal(a.successRate, 0.5);
  assert.equal(a.failureRate, 0.5);
});

test('accuracy rates sum to 1', () => {
  const a = computeForecastAccuracy(DEMO_OUTCOMES);
  assert.ok(Math.abs(a.successRate + a.failureRate - 1) < 1e-9);
});

test('calibration has 5 bins + bounded ECE', () => {
  const c = computeForecastCalibration(DEMO_OUTCOMES);
  assert.equal(c.bins.length, 5);
  assert.ok(c.ece >= 0 && c.ece <= 1);
  assert.equal(c.sampleCount, DEMO_OUTCOMES.length);
});

test('perfectly calibrated → ECE 0', () => {
  // In the 40–60% bin, confidence 0.5 with half success → meanConf == observed.
  const c = computeForecastCalibration([o(0.5, 1), o(0.5, 0)]);
  assert.ok(c.ece < 1e-6);
});

test('bins count to sample size', () => {
  const c = computeForecastCalibration(DEMO_OUTCOMES);
  assert.equal(c.bins.reduce((a, b) => a + b.count, 0), DEMO_OUTCOMES.length);
});

test('Brier: perfect forecasts → 0', () => {
  const b = computeForecastBrierScore([o(1, 1), o(0, 0)]);
  assert.equal(b.score, 0);
  assert.match(b.interpretation, /Excellent/);
});

test('Brier: worst forecasts → 1', () => {
  const b = computeForecastBrierScore([o(1, 0), o(0, 1)]);
  assert.equal(b.score, 1);
  assert.match(b.interpretation, /Poor/);
});

test('Brier: empty → undefined interpretation', () => {
  const b = computeForecastBrierScore([]);
  assert.equal(b.sampleCount, 0);
  assert.match(b.interpretation, /undefined/);
});

test('Brier bounded [0,1]', () => {
  const b = computeForecastBrierScore(DEMO_OUTCOMES);
  assert.ok(b.score >= 0 && b.score <= 1);
});

test('forecast drift = current ECE − prior ECE', () => {
  const prior = computeForecastCalibration([o(0.9, 1), o(0.1, 0)]);
  const worse = computeForecastCalibration([o(0.9, 0), o(0.1, 1)]);
  assert.ok(computeForecastDrift(prior, worse) > 0);
});

test('demo reliability metrics are sane', () => {
  const out = forecastDemo();
  assert.ok(out.accuracy.sampleCount === DEMO_OUTCOMES.length);
  assert.ok(out.calibration.ece >= 0);
  assert.ok(out.brier.score >= 0);
});

test('deterministic reliability', () => {
  assert.deepEqual(computeForecastCalibration(DEMO_OUTCOMES), computeForecastCalibration(DEMO_OUTCOMES));
});

test('confidence 0/1 land in extreme bins', () => {
  const c = computeForecastCalibration([o(0, 0), o(1, 1)]);
  assert.equal(c.bins[0].count, 1);
  assert.equal(c.bins[4].count, 1);
});

test('forecastDemo runs end to end', () => {
  const out = forecastDemo();
  assert.equal(out.now, FIXTURE_NOW);
  assert.ok(out.forecast.confidence > 0.5);
  assert.equal(out.failure.failed, false);
});
