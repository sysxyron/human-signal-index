import { test } from 'node:test';
import assert from 'node:assert/strict';

import { calibrate } from '../src/calibration';
import {
  computeReliabilityCurve,
  isWellCalibrated,
  reliabilityByKind,
} from '../src/reliability';
import {
  WELL_CALIBRATED,
  OVERCONFIDENT,
  DEMO_PREDICTIONS,
  FIXTURE_NOW,
} from '../src/fixtures';
import type { Prediction } from '../src/types';

const NOW = FIXTURE_NOW;

test('computeReliabilityCurve equals calibrate with no filters', () => {
  const a = computeReliabilityCurve(WELL_CALIBRATED, { now: NOW });
  const b = calibrate(WELL_CALIBRATED, { now: NOW });
  assert.deepEqual(a, b);
});

test('computeReliabilityCurve filters by kind', () => {
  const c = computeReliabilityCurve(DEMO_PREDICTIONS, {
    now: NOW,
    kind: 'narrative',
  });
  const expected = DEMO_PREDICTIONS.filter((p) => p.kind === 'narrative').length;
  assert.equal(c.sampleCount, expected);
});

test('computeReliabilityCurve filters by entityId', () => {
  const id = WELL_CALIBRATED[0].entityId!;
  const c = computeReliabilityCurve(WELL_CALIBRATED, { now: NOW, entityId: id });
  const expected = WELL_CALIBRATED.filter((p) => p.entityId === id).length;
  assert.equal(c.sampleCount, expected);
  assert.ok(expected > 0);
});

test('computeReliabilityCurve combined filters', () => {
  const c = computeReliabilityCurve(DEMO_PREDICTIONS, {
    now: NOW,
    kind: 'forecast',
    entityId: 'wc30-entity',
  });
  const expected = DEMO_PREDICTIONS.filter(
    (p) => p.kind === 'forecast' && p.entityId === 'wc30-entity',
  ).length;
  assert.equal(c.sampleCount, expected);
});

test('computeReliabilityCurve respects bins option', () => {
  const c = computeReliabilityCurve(WELL_CALIBRATED, { now: NOW, bins: 5 });
  assert.equal(c.bins.length, 5);
});

test('reliabilityByKind has all four kinds', () => {
  const r = reliabilityByKind(DEMO_PREDICTIONS, { now: NOW });
  assert.deepEqual(Object.keys(r).sort(), [
    'forecast',
    'intervention',
    'narrative',
    'recommendation',
  ]);
});

test('reliabilityByKind sample counts partition the input', () => {
  const r = reliabilityByKind(DEMO_PREDICTIONS, { now: NOW });
  const total =
    r.recommendation.sampleCount +
    r.forecast.sampleCount +
    r.intervention.sampleCount +
    r.narrative.sampleCount;
  assert.equal(total, DEMO_PREDICTIONS.length);
});

test('reliabilityByKind narrative count matches manual filter', () => {
  const r = reliabilityByKind(DEMO_PREDICTIONS, { now: NOW });
  const manual = DEMO_PREDICTIONS.filter((p) => p.kind === 'narrative').length;
  assert.equal(r.narrative.sampleCount, manual);
});

test('reliabilityByKind each curve has default bins', () => {
  const r = reliabilityByKind(DEMO_PREDICTIONS, { now: NOW });
  for (const k of Object.keys(r) as Prediction['kind'][]) {
    assert.equal(r[k].bins.length, 10);
  }
});

test('isWellCalibrated true for the well-calibrated fixture', () => {
  const c = calibrate(WELL_CALIBRATED, { now: NOW });
  assert.equal(isWellCalibrated(c), true);
});

test('isWellCalibrated false for the overconfident fixture', () => {
  const c = calibrate(OVERCONFIDENT, { now: NOW });
  assert.equal(isWellCalibrated(c), false);
});

test('isWellCalibrated false for an empty curve', () => {
  const c = calibrate([], { now: NOW });
  assert.equal(isWellCalibrated(c), false);
});

test('isWellCalibrated honours a custom tolerance', () => {
  const c = calibrate(OVERCONFIDENT, { now: NOW });
  // With a very loose tolerance even an overconfident curve passes.
  assert.equal(isWellCalibrated(c, 0.9), true);
  // With a very tight tolerance the well-calibrated curve may fail.
  const good = calibrate(WELL_CALIBRATED, { now: NOW });
  assert.equal(isWellCalibrated(good, 0), good.expectedCalibrationError <= 0);
});

test('isWellCalibrated boundary: ECE exactly at tolerance passes', () => {
  const c = calibrate(WELL_CALIBRATED, { now: NOW });
  assert.equal(isWellCalibrated(c, c.expectedCalibrationError), true);
});

test('computeReliabilityCurve is deterministic', () => {
  const a = computeReliabilityCurve(DEMO_PREDICTIONS, { now: NOW, kind: 'forecast' });
  const b = computeReliabilityCurve(DEMO_PREDICTIONS, { now: NOW, kind: 'forecast' });
  assert.deepEqual(a, b);
});

test('filtering does not mutate the input array', () => {
  const copy = DEMO_PREDICTIONS.slice();
  computeReliabilityCurve(DEMO_PREDICTIONS, { now: NOW, kind: 'narrative' });
  assert.deepEqual(DEMO_PREDICTIONS, copy);
});
