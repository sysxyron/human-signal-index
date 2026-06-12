import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeForecastReliability,
  generateForecast,
  scoreForecastConfidence,
  updateForecast,
} from '../src/forecast';
import { FIXTURE_NOW } from '../src/fixtures';
import type { ForecastSignal } from '../src/types';

const NOW = FIXTURE_NOW;

function sig(strength: number, direction: number, id = 's'): ForecastSignal {
  return { id, label: id, strength, direction };
}

test('all-supporting strong signals approach high confidence', () => {
  const sigs = Array.from({ length: 6 }, (_, i) => sig(1, 1, `s${i}`));
  assert.ok(scoreForecastConfidence(sigs) > 0.9);
});

test('all-contradicting strong signals approach low confidence', () => {
  const sigs = Array.from({ length: 6 }, (_, i) => sig(1, -1, `s${i}`));
  assert.ok(scoreForecastConfidence(sigs) < 0.1);
});

test('mixed signals net out', () => {
  const sigs = [sig(1, 1, 'a'), sig(1, -1, 'b')];
  assert.ok(Math.abs(scoreForecastConfidence(sigs) - 0.5) < 0.01);
});

test('neutral-direction signals do not move confidence', () => {
  const sigs = [sig(1, 0, 'a'), sig(1, 0, 'b')];
  assert.ok(Math.abs(scoreForecastConfidence(sigs) - 0.5) < 0.01);
});

test('stronger supporting signal beats weaker contradicting', () => {
  const sigs = [sig(0.9, 1, 'a'), sig(0.3, -1, 'b')];
  assert.ok(scoreForecastConfidence(sigs) > 0.5);
});

test('coverage scales: 4 signals at full coverage', () => {
  const four = Array.from({ length: 4 }, (_, i) => sig(1, 1, `s${i}`));
  const eight = Array.from({ length: 8 }, (_, i) => sig(1, 1, `s${i}`));
  // Both at/above full coverage → similar high confidence.
  assert.ok(Math.abs(scoreForecastConfidence(four) - scoreForecastConfidence(eight)) < 0.01);
});

test('low-strength signals reduce coverage → pulled to neutral', () => {
  const weak = [sig(0.1, 1, 'a')];
  assert.ok(scoreForecastConfidence(weak) < 0.6 && scoreForecastConfidence(weak) > 0.5);
});

test('reliability rises monotonically with sample count', () => {
  let prev = 0;
  for (const n of [0, 2, 5, 10, 20]) {
    const r = computeForecastReliability({ historicalAccuracy: 0.9, historicalSampleCount: n });
    assert.ok(r >= prev);
    prev = r;
  }
});

test('reliability below 0.5 for poor accuracy with samples', () => {
  assert.ok(computeForecastReliability({ historicalAccuracy: 0.2, historicalSampleCount: 10 }) < 0.5);
});

test('reliability bounded [0,1]', () => {
  assert.ok(computeForecastReliability({ historicalAccuracy: 1, historicalSampleCount: 100 }) <= 1);
  assert.ok(computeForecastReliability({ historicalAccuracy: 0, historicalSampleCount: 100 }) >= 0);
});

test('generateForecast clamps signal strengths', () => {
  const f = generateForecast({ id: 'f', prediction: 'p', signals: [sig(2, 1), sig(-0.5, 1, 'b')] }, { now: NOW });
  assert.ok(f.supportingSignals.every((s) => s.strength >= 0 && s.strength <= 1));
});

test('generateForecast normalises directions to -1/0/+1', () => {
  const f = generateForecast({ id: 'f', prediction: 'p', signals: [{ id: 's', label: 'a', strength: 0.5, direction: 5 }] }, { now: NOW });
  assert.equal(f.supportingSignals[0].direction, 1);
});

test('updateForecast preserving signals keeps confidence', () => {
  const f = generateForecast({ id: 'f', prediction: 'p', signals: [sig(0.8, 1)] }, { now: NOW });
  const u = updateForecast(f, { prediction: 'p2' }, { now: NOW });
  assert.equal(u.confidence, f.confidence);
  assert.equal(u.prediction, 'p2');
});

test('updateForecast status change', () => {
  const f = generateForecast({ id: 'f', prediction: 'p', signals: [sig(0.8, 1)] }, { now: NOW });
  const u = updateForecast(f, { status: 'monitoring' }, { now: NOW });
  assert.equal(u.status, 'monitoring');
});

test('confidence symmetric around neutral for mirrored signals', () => {
  const up = scoreForecastConfidence([sig(0.7, 1, 'a'), sig(0.7, 1, 'b')]);
  const down = scoreForecastConfidence([sig(0.7, -1, 'a'), sig(0.7, -1, 'b')]);
  assert.ok(Math.abs((up - 0.5) - (0.5 - down)) < 1e-9);
});

test('empty + single deterministic', () => {
  assert.equal(scoreForecastConfidence([]), 0.5);
  assert.equal(scoreForecastConfidence([sig(0.5, 1)]), scoreForecastConfidence([sig(0.5, 1)]));
});

test('generateForecast confidence in [0,1] across random-ish inputs', () => {
  for (const s of [0.1, 0.5, 0.9, 1]) {
    for (const d of [-1, 0, 1]) {
      const f = generateForecast({ id: 'f', prediction: 'p', signals: [sig(s, d)] }, { now: NOW });
      assert.ok(f.confidence >= 0 && f.confidence <= 1);
    }
  }
});

test('version starts at 1 and increments', () => {
  let f = generateForecast({ id: 'f', prediction: 'p', signals: [sig(0.8, 1)] }, { now: NOW });
  assert.equal(f.version, 1);
  f = updateForecast(f, { status: 'monitoring' }, { now: NOW });
  assert.equal(f.version, 2);
  f = updateForecast(f, { status: 'confirmed' }, { now: NOW });
  assert.equal(f.version, 3);
});

test('reliability neutral when accuracy absent even with samples', () => {
  assert.equal(computeForecastReliability({ historicalSampleCount: 50 }), 0.5);
});

test('confidence with many weak supporting signals', () => {
  const sigs = Array.from({ length: 10 }, (_, i) => sig(0.5, 1, `s${i}`));
  const c = scoreForecastConfidence(sigs);
  assert.ok(c > 0.7); // total strength 5 ≥ coverage floor.
});
