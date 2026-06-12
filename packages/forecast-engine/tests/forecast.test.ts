import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildForecastExplanation,
  computeForecastReliability,
  detectForecastFailure,
  expireForecast,
  generateForecast,
  isExpired,
  scoreForecastConfidence,
  updateForecast,
} from '../src/forecast';
import { DEMO_FORECAST_INPUT, FIXTURE_NOW } from '../src/fixtures';
import type { ForecastInput, ForecastSignal } from '../src/types';

const NOW = FIXTURE_NOW;

function input(o: Partial<ForecastInput> = {}): ForecastInput {
  return { id: 'f', prediction: 'p', signals: [{ id: 's', label: 'L', strength: 0.8, direction: 1 }], ...o };
}

test('scoreForecastConfidence: supporting signals → above 0.5', () => {
  const sigs: ForecastSignal[] = [{ id: '1', label: 'a', strength: 0.9, direction: 1 }, { id: '2', label: 'b', strength: 0.8, direction: 1 }];
  assert.ok(scoreForecastConfidence(sigs) > 0.5);
});

test('scoreForecastConfidence: contradicting signals → below 0.5', () => {
  const sigs: ForecastSignal[] = [{ id: '1', label: 'a', strength: 0.9, direction: -1 }, { id: '2', label: 'b', strength: 0.8, direction: -1 }];
  assert.ok(scoreForecastConfidence(sigs) < 0.5);
});

test('scoreForecastConfidence: no signals → neutral 0.5', () => {
  assert.equal(scoreForecastConfidence([]), 0.5);
});

test('scoreForecastConfidence: coverage pulls thin evidence toward neutral', () => {
  const one: ForecastSignal[] = [{ id: '1', label: 'a', strength: 0.5, direction: 1 }];
  const many: ForecastSignal[] = Array.from({ length: 4 }, (_, i) => ({ id: `${i}`, label: 'a', strength: 1, direction: 1 }));
  assert.ok(scoreForecastConfidence(many) > scoreForecastConfidence(one));
});

test('confidence bounded [0,1]', () => {
  const c = scoreForecastConfidence([{ id: '1', label: 'a', strength: 1, direction: 1 }]);
  assert.ok(c >= 0 && c <= 1);
});

test('computeForecastReliability blends accuracy + sample', () => {
  const lo = computeForecastReliability({ historicalAccuracy: 0.9, historicalSampleCount: 1 });
  const hi = computeForecastReliability({ historicalAccuracy: 0.9, historicalSampleCount: 10 });
  assert.ok(hi > lo);
});

test('reliability neutral with no history', () => {
  assert.equal(computeForecastReliability({}), 0.5);
});

test('generateForecast builds a hypothesis with all fields', () => {
  const f = generateForecast(DEMO_FORECAST_INPUT, { now: NOW });
  assert.equal(f.forecastId, 'fc-1');
  assert.equal(f.status, 'active');
  assert.ok(f.confidence > 0.5);
  assert.ok(f.assumptions.length > 0);
  assert.ok(f.invalidationCriteria.length > 0);
  assert.ok(f.limitations.length > 0);
  assert.equal(f.version, 1);
});

test('generateForecast always carries a hypothesis limitation', () => {
  const f = generateForecast(input(), { now: NOW });
  assert.ok(f.limitations.some((l) => /HYPOTHESIS|not a prediction of certainty/i.test(l)));
});

test('missing assumptions/invalidation get explicit placeholders', () => {
  const f = generateForecast(input(), { now: NOW });
  assert.ok(f.assumptions.some((a) => /No explicit assumptions/.test(a)));
  assert.ok(f.invalidationCriteria.some((c) => /No explicit invalidation/.test(c)));
});

test('updateForecast bumps version + rescoring on new signals', () => {
  const f = generateForecast(input(), { now: NOW });
  const u = updateForecast(f, { signals: [{ id: 's', label: 'L', strength: 0.9, direction: -1 }] }, { now: NOW });
  assert.equal(u.version, 2);
  assert.ok(u.confidence < f.confidence);
});

test('expireForecast sets status expired', () => {
  const f = generateForecast(input(), { now: NOW });
  const e = expireForecast(f, { now: NOW });
  assert.equal(e.status, 'expired');
});

test('isExpired true past expiry', () => {
  const f = generateForecast(input({ expiresAt: '2026-01-01T00:00:00.000Z' }), { now: NOW });
  assert.equal(isExpired(f, NOW), true);
});

test('isExpired false before expiry', () => {
  const f = generateForecast(input({ expiresAt: '2030-01-01T00:00:00.000Z' }), { now: NOW });
  assert.equal(isExpired(f, NOW), false);
});

test('detectForecastFailure triggers on invalidation criteria match', () => {
  const f = generateForecast(input({ invalidationCriteria: ['Primary source removed'] }), { now: NOW });
  const r = detectForecastFailure(f, { observations: ['the primary source was removed today'] }, { now: NOW });
  assert.equal(r.failed, true);
  assert.ok(r.triggered.length >= 1);
});

test('detectForecastFailure triggers on low observed success', () => {
  const f = generateForecast(input(), { now: NOW });
  const r = detectForecastFailure(f, { observations: [], observedSuccess: 0.1 }, { now: NOW });
  assert.equal(r.failed, true);
});

test('detectForecastFailure: no trigger → still stands', () => {
  const f = generateForecast(input({ invalidationCriteria: ['Source removed'] }), { now: NOW });
  const r = detectForecastFailure(f, { observations: ['everything nominal'], observedSuccess: 0.8 }, { now: NOW });
  assert.equal(r.failed, false);
});

test('placeholder invalidation never triggers', () => {
  const f = generateForecast(input(), { now: NOW }); // gets the placeholder criterion.
  const r = detectForecastFailure(f, { observations: ['no explicit anything'] }, { now: NOW });
  assert.equal(r.failed, false);
});

test('buildForecastExplanation enumerates factors', () => {
  const f = generateForecast(DEMO_FORECAST_INPUT, { now: NOW });
  const e = buildForecastExplanation(f, { now: NOW });
  assert.equal(e.factors.length, DEMO_FORECAST_INPUT.signals.length);
  assert.ok(e.summary.includes('hypothesis'));
  assert.ok(e.assumptions.length > 0);
});

test('explanation factors sorted by |contribution|', () => {
  const f = generateForecast(DEMO_FORECAST_INPUT, { now: NOW });
  const e = buildForecastExplanation(f, { now: NOW });
  for (let i = 1; i < e.factors.length; i++) {
    assert.ok(Math.abs(e.factors[i - 1].contribution) >= Math.abs(e.factors[i].contribution));
  }
});

test('inputs not mutated', () => {
  const before = JSON.stringify(DEMO_FORECAST_INPUT);
  generateForecast(DEMO_FORECAST_INPUT, { now: NOW });
  assert.equal(JSON.stringify(DEMO_FORECAST_INPUT), before);
});

test('deterministic generation', () => {
  assert.deepEqual(generateForecast(DEMO_FORECAST_INPUT, { now: NOW }), generateForecast(DEMO_FORECAST_INPUT, { now: NOW }));
});
