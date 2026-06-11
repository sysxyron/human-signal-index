import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  proposalFromCalibrationError,
  proposalFromDriftEvent,
  proposeRecalibration,
  severityForMagnitude,
} from '../src/propose';
import { detectTrustDrift } from '@hsi/trust-history';
import { DEMO_SERIES } from '@hsi/trust-history';
import { FIXTURE_NOW } from '../src/fixtures';
import type { RecalibrationProposalInput } from '../src/types';

const NOW = FIXTURE_NOW;

function input(overrides: Partial<RecalibrationProposalInput> = {}): RecalibrationProposalInput {
  return {
    id: 'p1',
    entityType: 'forecast',
    entityId: 'fc1',
    trigger: 'overconfidence',
    currentConfidence: 0.72,
    recommendedConfidence: 0.48,
    ...overrides,
  };
}

test('proposeRecalibration sets pending status', () => {
  assert.equal(proposeRecalibration(input(), { now: NOW }).status, 'pending');
});

test('downward direction when recommended < current', () => {
  assert.equal(proposeRecalibration(input(), { now: NOW }).direction, 'downward');
});

test('upward direction when recommended > current', () => {
  const p = proposeRecalibration(
    input({ currentConfidence: 0.4, recommendedConfidence: 0.7 }),
    { now: NOW },
  );
  assert.equal(p.direction, 'upward');
});

test('none direction when equal', () => {
  const p = proposeRecalibration(
    input({ currentConfidence: 0.5, recommendedConfidence: 0.5 }),
    { now: NOW },
  );
  assert.equal(p.direction, 'none');
});

test('magnitude is the absolute delta', () => {
  const p = proposeRecalibration(input(), { now: NOW });
  assert.ok(Math.abs(p.magnitude - 0.24) < 1e-9);
});

test('confidence clamped to [0,1]', () => {
  const p = proposeRecalibration(
    input({ currentConfidence: 1.5, recommendedConfidence: -0.5 }),
    { now: NOW },
  );
  assert.equal(p.currentConfidence, 1);
  assert.equal(p.recommendedConfidence, 0);
});

test('createdAt uses injected now', () => {
  assert.equal(proposeRecalibration(input(), { now: NOW }).createdAt, NOW);
});

test('default reason supplied when omitted', () => {
  const p = proposeRecalibration(input({ reason: undefined }), { now: NOW });
  assert.ok(p.reason.length > 0);
});

test('custom reason carried through', () => {
  const p = proposeRecalibration(input({ reason: 'manual note' }), { now: NOW });
  assert.equal(p.reason, 'manual note');
});

test('default evidence generated when omitted', () => {
  const p = proposeRecalibration(input(), { now: NOW });
  assert.ok(p.supportingEvidence.length > 0);
});

test('trust context carried when provided', () => {
  const p = proposeRecalibration(input({ currentTrust: 72, recommendedTrust: 48 }), {
    now: NOW,
  });
  assert.equal(p.currentTrust, 72);
  assert.equal(p.recommendedTrust, 48);
});

test('trust context omitted when absent', () => {
  const p = proposeRecalibration(input(), { now: NOW });
  assert.equal(p.currentTrust, undefined);
});

test('severityForMagnitude buckets', () => {
  assert.equal(severityForMagnitude(0.05), 'LOW');
  assert.equal(severityForMagnitude(0.15), 'MEDIUM');
  assert.equal(severityForMagnitude(0.25), 'HIGH');
  assert.equal(severityForMagnitude(0.35), 'CRITICAL');
});

test('severity reflects magnitude', () => {
  assert.equal(proposeRecalibration(input(), { now: NOW }).severity, 'HIGH');
});

test('deterministic across runs', () => {
  assert.deepEqual(
    proposeRecalibration(input(), { now: NOW }),
    proposeRecalibration(input(), { now: NOW }),
  );
});

// ---- proposalFromDriftEvent -------------------------------------------------

test('proposalFromDriftEvent returns null for stable', () => {
  const stable = detectTrustDrift(DEMO_SERIES.stable, { now: NOW });
  assert.equal(
    proposalFromDriftEvent(stable, { id: 'x', currentConfidence: 0.6 }, { now: NOW }),
    null,
  );
});

test('proposalFromDriftEvent recommends downward for overconfidence', () => {
  const drift = detectTrustDrift(DEMO_SERIES.overconfident, { now: NOW });
  const p = proposalFromDriftEvent(drift, { id: 'x', currentConfidence: 0.8 }, { now: NOW });
  assert.ok(p);
  assert.equal(p!.direction, 'downward');
});

test('proposalFromDriftEvent recommends upward for underconfidence', () => {
  const drift = detectTrustDrift(DEMO_SERIES.underconfident, { now: NOW });
  const p = proposalFromDriftEvent(drift, { id: 'x', currentConfidence: 0.4 }, { now: NOW });
  assert.ok(p);
  assert.equal(p!.direction, 'upward');
});

test('proposalFromDriftEvent carries drift evidence', () => {
  const drift = detectTrustDrift(DEMO_SERIES.collapsing, { now: NOW });
  const p = proposalFromDriftEvent(drift, { id: 'x', currentConfidence: 0.8 }, { now: NOW });
  assert.ok(p!.supportingEvidence.length >= drift.evidence.length);
});

test('proposalFromDriftEvent honours an explicit target', () => {
  const drift = detectTrustDrift(DEMO_SERIES.degrading, { now: NOW });
  const p = proposalFromDriftEvent(
    drift,
    { id: 'x', currentConfidence: 0.8, recommendedConfidence: 0.55 },
    { now: NOW },
  );
  assert.equal(p!.recommendedConfidence, 0.55);
});

test('collapse maps to trust_collapse trigger', () => {
  const drift = detectTrustDrift(DEMO_SERIES.collapsing, { now: NOW });
  const p = proposalFromDriftEvent(drift, { id: 'x', currentConfidence: 0.8 }, { now: NOW });
  assert.equal(p!.trigger, 'trust_collapse');
});

// ---- proposalFromCalibrationError -------------------------------------------

test('proposalFromCalibrationError returns null within tolerance', () => {
  assert.equal(
    proposalFromCalibrationError(
      { id: 'x', entityType: 'source', entityId: 's', currentConfidence: 0.8, ece: 0.05 },
      { now: NOW },
    ),
    null,
  );
});

test('proposalFromCalibrationError proposes downward beyond threshold', () => {
  const p = proposalFromCalibrationError(
    { id: 'x', entityType: 'source', entityId: 's', currentConfidence: 0.8, ece: 0.22, threshold: 0.1 },
    { now: NOW },
  );
  assert.ok(p);
  assert.equal(p!.direction, 'downward');
  assert.equal(p!.trigger, 'calibration_error');
});

test('proposalFromCalibrationError lowers by the overshoot', () => {
  const p = proposalFromCalibrationError(
    { id: 'x', entityType: 'source', entityId: 's', currentConfidence: 0.8, ece: 0.2, threshold: 0.1 },
    { now: NOW },
  );
  // overshoot 0.1 -> 0.8 - 0.1 = 0.7
  assert.ok(Math.abs(p!.recommendedConfidence - 0.7) < 1e-9);
});
