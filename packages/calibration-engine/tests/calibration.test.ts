import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BIN_EDGES,
  DEFAULT_BINS,
  binIndex,
  calibrate,
  confidenceMeaning,
} from '../src/calibration';
import { WELL_CALIBRATED, OVERCONFIDENT, FIXTURE_NOW } from '../src/fixtures';
import type { Prediction } from '../src/types';

const NOW = FIXTURE_NOW;

function p(
  id: string,
  confidence: number,
  success: number,
  kind: Prediction['kind'] = 'forecast',
): Prediction {
  return { id, kind, confidence, success, at: NOW };
}

test('BIN_EDGES has DEFAULT_BINS+1 entries spanning 0..1', () => {
  assert.equal(BIN_EDGES.length, DEFAULT_BINS + 1);
  assert.equal(BIN_EDGES[0], 0);
  assert.equal(BIN_EDGES[BIN_EDGES.length - 1], 1);
});

test('BIN_EDGES is monotonically increasing', () => {
  for (let i = 1; i < BIN_EDGES.length; i++) {
    assert.ok(BIN_EDGES[i] > BIN_EDGES[i - 1]);
  }
});

test('binIndex lower boundary 0 -> bin 0', () => {
  assert.equal(binIndex(0), 0);
});

test('binIndex 0.05 -> bin 0', () => {
  assert.equal(binIndex(0.05), 0);
});

test('binIndex 0.1 -> bin 1 (lower-edge inclusive)', () => {
  assert.equal(binIndex(0.1), 1);
});

test('binIndex 0.19 -> bin 1', () => {
  assert.equal(binIndex(0.19), 1);
});

test('binIndex 0.2 -> bin 2', () => {
  assert.equal(binIndex(0.2), 2);
});

test('binIndex 0.7 -> bin 7', () => {
  assert.equal(binIndex(0.7), 7);
});

test('binIndex 0.82 -> bin 8', () => {
  assert.equal(binIndex(0.82), 8);
});

test('binIndex 0.9 -> bin 9', () => {
  assert.equal(binIndex(0.9), 9);
});

test('binIndex 1.0 -> top bin (inclusive)', () => {
  assert.equal(binIndex(1.0), DEFAULT_BINS - 1);
});

test('binIndex clamps negative to 0', () => {
  assert.equal(binIndex(-0.5), 0);
});

test('binIndex clamps >1 to top bin', () => {
  assert.equal(binIndex(5), DEFAULT_BINS - 1);
});

test('binIndex respects custom bin count', () => {
  assert.equal(binIndex(0.5, 4), 2);
  assert.equal(binIndex(0.99, 4), 3);
});

test('calibrate returns DEFAULT_BINS bins by default', () => {
  const c = calibrate(WELL_CALIBRATED, { now: NOW });
  assert.equal(c.bins.length, DEFAULT_BINS);
});

test('calibrate respects custom bin count', () => {
  const c = calibrate(WELL_CALIBRATED, { now: NOW, bins: 5 });
  assert.equal(c.bins.length, 5);
});

test('calibrate bin counts sum to sample count', () => {
  const c = calibrate(WELL_CALIBRATED, { now: NOW });
  const sum = c.bins.reduce((a, b) => a + b.count, 0);
  assert.equal(sum, WELL_CALIBRATED.length);
  assert.equal(c.sampleCount, WELL_CALIBRATED.length);
});

test('calibrate sets generatedAt from injected now', () => {
  const c = calibrate(WELL_CALIBRATED, { now: NOW });
  assert.equal(c.generatedAt, NOW);
});

test('calibrate empty input -> zeroed metrics', () => {
  const c = calibrate([], { now: NOW });
  assert.equal(c.sampleCount, 0);
  assert.equal(c.expectedCalibrationError, 0);
  assert.equal(c.maxCalibrationError, 0);
  assert.equal(c.overconfidenceIndex, 0);
});

test('perfectly calibrated input -> ECE ~ 0', () => {
  const preds: Prediction[] = [];
  // bin at 0.7: 7 of 10 succeed; bin at 0.3: 3 of 10 succeed.
  for (let i = 0; i < 10; i++) preds.push(p(`a${i}`, 0.7, i < 7 ? 1 : 0));
  for (let i = 0; i < 10; i++) preds.push(p(`b${i}`, 0.3, i < 3 ? 1 : 0));
  const c = calibrate(preds, { now: NOW });
  assert.ok(c.expectedCalibrationError < 0.02, `ECE=${c.expectedCalibrationError}`);
});

test('perfectly calibrated input -> overconfidenceIndex ~ 0', () => {
  const preds: Prediction[] = [];
  for (let i = 0; i < 10; i++) preds.push(p(`a${i}`, 0.7, i < 7 ? 1 : 0));
  for (let i = 0; i < 10; i++) preds.push(p(`b${i}`, 0.3, i < 3 ? 1 : 0));
  const c = calibrate(preds, { now: NOW });
  assert.ok(Math.abs(c.overconfidenceIndex) < 0.02);
});

test('overconfident input -> positive overconfidenceIndex', () => {
  const c = calibrate(OVERCONFIDENT, { now: NOW });
  assert.ok(c.overconfidenceIndex > 0.2, `oc=${c.overconfidenceIndex}`);
});

test('underconfident input -> negative overconfidenceIndex', () => {
  const preds: Prediction[] = [];
  for (let i = 0; i < 20; i++) preds.push(p(`u${i}`, 0.3, i < 14 ? 1 : 0));
  const c = calibrate(preds, { now: NOW });
  assert.ok(c.overconfidenceIndex < -0.2, `oc=${c.overconfidenceIndex}`);
});

test('calibrationError equals |meanConfidence - observedSuccess| per bin', () => {
  const c = calibrate(OVERCONFIDENT, { now: NOW });
  for (const b of c.bins) {
    if (b.count === 0) continue;
    const expected = Math.abs(b.meanConfidence - b.observedSuccess);
    assert.ok(Math.abs(b.calibrationError - expected) < 1e-9);
  }
});

test('MCE >= ECE', () => {
  const c = calibrate(OVERCONFIDENT, { now: NOW });
  assert.ok(c.maxCalibrationError >= c.expectedCalibrationError);
});

test('MCE equals the max populated-bin error', () => {
  const c = calibrate(OVERCONFIDENT, { now: NOW });
  const populated = c.bins.filter((b) => b.count > 0);
  const max = Math.max(...populated.map((b) => b.calibrationError));
  assert.ok(Math.abs(c.maxCalibrationError - max) < 1e-9);
});

test('observed success is normalised from a /100 score', () => {
  const c = calibrate([p('x', 0.8, 80)], { now: NOW });
  const bin = c.bins[binIndex(0.8)];
  assert.equal(bin.observedSuccess, 0.8);
});

test('fractional success in 0..1 is used directly', () => {
  const c = calibrate([p('x', 0.8, 0.6)], { now: NOW });
  const bin = c.bins[binIndex(0.8)];
  assert.equal(bin.observedSuccess, 0.6);
});

test('bin labels render as percentage ranges', () => {
  const c = calibrate(WELL_CALIBRATED, { now: NOW });
  assert.equal(c.bins[7].label, '70–80%');
  assert.equal(c.bins[8].label, '80–90%');
});

test('confidenceMeaning produces the historical-success sentence', () => {
  const c = calibrate(WELL_CALIBRATED, { now: NOW });
  const m = confidenceMeaning(c, 0.7);
  assert.match(
    m.sentence,
    /confidence predictions have historically succeeded .* of the time across \d+ observations\./,
  );
});

test('confidenceMeaning uses the bin containing the confidence', () => {
  const c = calibrate(WELL_CALIBRATED, { now: NOW });
  const m = confidenceMeaning(c, 0.7);
  // bin 7 holds the wc70 cohort (20 preds, 70% success).
  assert.equal(m.sampleCount, c.bins[7].count);
  assert.equal(m.historicalSuccess, c.bins[7].observedSuccess);
});

test('confidenceMeaning 0.7 reports 70% historical success', () => {
  const c = calibrate(WELL_CALIBRATED, { now: NOW });
  const m = confidenceMeaning(c, 0.7);
  assert.equal(m.historicalSuccess, 0.7);
  assert.match(m.sentence, /70%/);
});

test('confidenceMeaning statedConfidence echoes the input', () => {
  const c = calibrate(WELL_CALIBRATED, { now: NOW });
  const m = confidenceMeaning(c, 0.82);
  assert.equal(m.statedConfidence, 0.82);
});

test('confidenceMeaning on an empty bin admits no grounding', () => {
  const c = calibrate(WELL_CALIBRATED, { now: NOW });
  const m = confidenceMeaning(c, 0.05); // bin 0 empty in this fixture
  assert.equal(m.sampleCount, 0);
  assert.match(m.sentence, /no historical observations/);
});

test('calibrate is deterministic (same inputs -> identical output)', () => {
  const a = calibrate(WELL_CALIBRATED, { now: NOW });
  const b = calibrate(WELL_CALIBRATED, { now: NOW });
  assert.deepEqual(a, b);
});

test('overconfidenceIndex matches manual mean(conf - success)', () => {
  const preds = [p('a', 0.9, 0), p('b', 0.8, 1), p('c', 0.5, 0.5)];
  const c = calibrate(preds, { now: NOW });
  const manual = (0.9 - 0 + (0.8 - 1) + (0.5 - 0.5)) / 3;
  assert.ok(Math.abs(c.overconfidenceIndex - manual) < 1e-4);
});
