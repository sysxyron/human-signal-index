import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CALIBRATION_OVERSHOOT,
  FIXTURE_NOW,
  FORECAST_OVERSTATED,
  recalibrationDemo,
} from '../src/fixtures';

test('FORECAST_OVERSTATED is a downward overconfidence proposal', () => {
  assert.equal(FORECAST_OVERSTATED.trigger, 'overconfidence');
  assert.equal(FORECAST_OVERSTATED.direction, 'downward');
});

test('CALIBRATION_OVERSHOOT proposal exists', () => {
  assert.ok(CALIBRATION_OVERSHOOT);
  assert.equal(CALIBRATION_OVERSHOOT!.trigger, 'calibration_error');
});

test('recalibrationDemo runs the full chain', () => {
  const out = recalibrationDemo();
  assert.equal(out.now, FIXTURE_NOW);
  assert.ok(out.proposals.length >= 2);
  assert.equal(out.review.valid, true);
  assert.equal(out.approval.status, 'approved');
  assert.equal(out.rejection.status, 'rejected');
});

test('demo approval preserves previous state', () => {
  const out = recalibrationDemo();
  assert.equal(out.approval.previousState.confidence, FORECAST_OVERSTATED.currentConfidence);
});

test('demo rejection leaves state unchanged', () => {
  const out = recalibrationDemo();
  assert.deepEqual(out.rejection.newState, out.rejection.previousState);
});

test('demo fromDrift proposal is downward', () => {
  const out = recalibrationDemo();
  assert.ok(out.fromDrift);
  assert.equal(out.fromDrift!.direction, 'downward');
});

test('recalibrationDemo is deterministic', () => {
  assert.deepEqual(recalibrationDemo(), recalibrationDemo());
});
