import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  RecalibrationDecisionError,
  approveProposal,
  rejectProposal,
  reverseDecision,
  reviewRecalibrationProposal,
} from '../src/governance';
import { proposeRecalibration } from '../src/propose';
import { FIXTURE_NOW } from '../src/fixtures';
import type { RecalibrationProposal } from '../src/types';

const NOW = FIXTURE_NOW;

function proposal(overrides: Partial<RecalibrationProposal> = {}): RecalibrationProposal {
  return {
    ...proposeRecalibration(
      {
        id: 'p1',
        entityType: 'forecast',
        entityId: 'fc1',
        trigger: 'overconfidence',
        currentConfidence: 0.72,
        recommendedConfidence: 0.48,
        currentTrust: 72,
        recommendedTrust: 48,
      },
      { now: NOW },
    ),
    ...overrides,
  };
}

// ---- review -----------------------------------------------------------------

test('review marks a well-formed proposal valid', () => {
  const r = reviewRecalibrationProposal(proposal(), { now: NOW });
  assert.equal(r.valid, true);
});

test('review never decides (no status field)', () => {
  const r = reviewRecalibrationProposal(proposal(), { now: NOW });
  assert.equal('status' in r, false);
});

test('review computes signed delta', () => {
  const r = reviewRecalibrationProposal(proposal(), { now: NOW });
  assert.ok(r.confidenceDelta < 0);
});

test('review flags a non-pending proposal', () => {
  const r = reviewRecalibrationProposal(proposal({ status: 'approved' }), { now: NOW });
  const check = r.checks.find((c) => c.label === 'status-pending');
  assert.equal(check?.ok, false);
  assert.equal(r.valid, false);
});

test('review flags a zero-magnitude change', () => {
  const p = proposeRecalibration(
    { id: 'p', entityType: 'source', entityId: 's', trigger: 'manual', currentConfidence: 0.5, recommendedConfidence: 0.5 },
    { now: NOW },
  );
  const r = reviewRecalibrationProposal(p, { now: NOW });
  assert.equal(r.checks.find((c) => c.label === 'non-trivial-change')?.ok, false);
});

test('review checks all five dimensions', () => {
  const r = reviewRecalibrationProposal(proposal(), { now: NOW });
  assert.equal(r.checks.length, 5);
});

test('review reviewedAt uses injected now', () => {
  assert.equal(reviewRecalibrationProposal(proposal(), { now: NOW }).reviewedAt, NOW);
});

// ---- approve ----------------------------------------------------------------

test('approve sets approved status', () => {
  const d = approveProposal(proposal(), { decidedBy: 'alice', reason: 'verified' }, { now: NOW });
  assert.equal(d.status, 'approved');
});

test('approve newState equals recommended', () => {
  const d = approveProposal(proposal(), { decidedBy: 'alice', reason: 'verified' }, { now: NOW });
  assert.equal(d.newState.confidence, 0.48);
  assert.equal(d.newState.trust, 48);
});

test('approve preserves the previous state', () => {
  const d = approveProposal(proposal(), { decidedBy: 'alice', reason: 'verified' }, { now: NOW });
  assert.equal(d.previousState.confidence, 0.72);
  assert.equal(d.previousState.trust, 72);
});

test('approve is reversible', () => {
  const d = approveProposal(proposal(), { decidedBy: 'alice', reason: 'verified' }, { now: NOW });
  assert.equal(d.reversible, true);
});

test('approve writes an audit trail with the decider + reason', () => {
  const d = approveProposal(proposal(), { decidedBy: 'alice', reason: 'verified' }, { now: NOW });
  const joined = d.auditTrail.join('\n');
  assert.match(joined, /APPROVED by alice/);
  assert.match(joined, /verified/);
});

test('approve records decidedBy and decidedAt', () => {
  const d = approveProposal(proposal(), { decidedBy: 'alice', reason: 'verified' }, { now: NOW });
  assert.equal(d.decidedBy, 'alice');
  assert.equal(d.decidedAt, NOW);
});

test('approve rejects a blank reason', () => {
  assert.throws(
    () => approveProposal(proposal(), { decidedBy: 'alice', reason: '   ' }, { now: NOW }),
    RecalibrationDecisionError,
  );
});

test('approve rejects a blank reviewer', () => {
  assert.throws(
    () => approveProposal(proposal(), { decidedBy: '', reason: 'ok' }, { now: NOW }),
    RecalibrationDecisionError,
  );
});

test('approve trims whitespace', () => {
  const d = approveProposal(proposal(), { decidedBy: '  alice  ', reason: '  ok  ' }, { now: NOW });
  assert.equal(d.decidedBy, 'alice');
  assert.equal(d.reason, 'ok');
});

// ---- reject -----------------------------------------------------------------

test('reject sets rejected status', () => {
  const d = rejectProposal(proposal(), { decidedBy: 'bob', reason: 'not enough data' }, { now: NOW });
  assert.equal(d.status, 'rejected');
});

test('reject leaves state unchanged (new == previous)', () => {
  const d = rejectProposal(proposal(), { decidedBy: 'bob', reason: 'not enough data' }, { now: NOW });
  assert.deepEqual(d.newState, d.previousState);
  assert.equal(d.newState.confidence, 0.72);
});

test('reject writes an audit trail', () => {
  const d = rejectProposal(proposal(), { decidedBy: 'bob', reason: 'not enough data' }, { now: NOW });
  assert.match(d.auditTrail.join('\n'), /REJECTED by bob/);
});

test('reject rejects a blank reason', () => {
  assert.throws(
    () => rejectProposal(proposal(), { decidedBy: 'bob', reason: '' }, { now: NOW }),
    RecalibrationDecisionError,
  );
});

test('reject is reversible flag true (no-op reversal)', () => {
  const d = rejectProposal(proposal(), { decidedBy: 'bob', reason: 'x' }, { now: NOW });
  assert.equal(d.reversible, true);
});

// ---- reverse ----------------------------------------------------------------

test('reverseDecision restores the prior state', () => {
  const approved = approveProposal(proposal(), { decidedBy: 'alice', reason: 'verified' }, { now: NOW });
  const reversed = reverseDecision(approved, { decidedBy: 'alice', reason: 'rollback' }, { now: NOW });
  assert.equal(reversed.newState.confidence, approved.previousState.confidence);
  assert.equal(reversed.previousState.confidence, approved.newState.confidence);
});

test('reverseDecision appends to the audit trail', () => {
  const approved = approveProposal(proposal(), { decidedBy: 'alice', reason: 'verified' }, { now: NOW });
  const reversed = reverseDecision(approved, { decidedBy: 'alice', reason: 'rollback' }, { now: NOW });
  assert.ok(reversed.auditTrail.length > approved.auditTrail.length);
  assert.match(reversed.auditTrail.join('\n'), /REVERSED by alice/);
});

test('reverseDecision requires a reason', () => {
  const approved = approveProposal(proposal(), { decidedBy: 'alice', reason: 'verified' }, { now: NOW });
  assert.throws(
    () => reverseDecision(approved, { decidedBy: 'alice', reason: '' }, { now: NOW }),
    RecalibrationDecisionError,
  );
});

test('approve does not mutate the proposal', () => {
  const p = proposal();
  approveProposal(p, { decidedBy: 'alice', reason: 'verified' }, { now: NOW });
  assert.equal(p.status, 'pending');
});

test('deterministic decisions', () => {
  assert.deepEqual(
    approveProposal(proposal(), { decidedBy: 'alice', reason: 'verified' }, { now: NOW }),
    approveProposal(proposal(), { decidedBy: 'alice', reason: 'verified' }, { now: NOW }),
  );
});
