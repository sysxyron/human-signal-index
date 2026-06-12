import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ExecutiveGovernanceError,
  approveExecutiveDecision,
  archiveExecutiveDecision,
  queueExecutiveReview,
  rejectExecutiveDecision,
} from '../src/governance';
import type { StrategicPriority } from '../src/types';

const NOW = '2026-06-09T12:00:00.000Z';

function priority(o: Partial<StrategicPriority> = {}): StrategicPriority {
  return {
    id: 'pri-1', kind: 'risk', title: 'Trust collapse', score: 82, urgency: 0.9, impact: 0.9,
    confidenceWeight: 0.6, evidenceWeight: 0.6, rank: 1, attentionLevel: 'urgent',
    recommendation: 'Review', explanation: ['x'], limitations: ['advisory'], ...o,
  };
}

test('queue maps urgent → CRITICAL severity', () => {
  const q = queueExecutiveReview(priority({ attentionLevel: 'urgent' }), { now: NOW, id: 'rev-1' });
  assert.equal(q.severity, 'CRITICAL');
  assert.equal(q.status, 'queued');
  assert.equal(q.priorityId, 'pri-1');
  assert.equal(q.queuedAt, NOW);
});

test('queue maps attention levels to severities', () => {
  assert.equal(queueExecutiveReview(priority({ attentionLevel: 'elevated' }), { now: NOW, id: 'r' }).severity, 'HIGH');
  assert.equal(queueExecutiveReview(priority({ attentionLevel: 'notable' }), { now: NOW, id: 'r' }).severity, 'MEDIUM');
  assert.equal(queueExecutiveReview(priority({ attentionLevel: 'routine' }), { now: NOW, id: 'r' }).severity, 'LOW');
});

const review = queueExecutiveReview(priority(), { now: NOW, id: 'rev-1' });

test('approve requires reviewer', () => {
  assert.throws(() => approveExecutiveDecision(review, { reviewer: '', reason: 'ok' }, { now: NOW }), ExecutiveGovernanceError);
  assert.throws(() => approveExecutiveDecision(review, { reviewer: '   ', reason: 'ok' }, { now: NOW }), ExecutiveGovernanceError);
});

test('approve requires reason', () => {
  assert.throws(() => approveExecutiveDecision(review, { reviewer: 'alice', reason: '' }, { now: NOW }), ExecutiveGovernanceError);
  assert.throws(() => approveExecutiveDecision(review, { reviewer: 'alice', reason: '  ' }, { now: NOW }), ExecutiveGovernanceError);
});

test('approve records a reversible decision with audit trail', () => {
  const d = approveExecutiveDecision(review, { reviewer: 'alice', reason: 'Confirmed' }, { now: NOW });
  assert.equal(d.decision, 'approved');
  assert.equal(d.reviewer, 'alice');
  assert.equal(d.reason, 'Confirmed');
  assert.equal(d.reversible, true);
  assert.equal(d.previousStatus, 'queued');
  assert.ok(d.auditTrail.length >= 3);
  assert.ok(d.auditTrail.some((l) => /APPROVED by alice/.test(l)));
  assert.ok(d.auditTrail.some((l) => /reversible/.test(l)));
  assert.equal(d.at, NOW);
});

test('reject records a rejected decision', () => {
  const d = rejectExecutiveDecision(review, { reviewer: 'bob', reason: 'Not actionable' }, { now: NOW });
  assert.equal(d.decision, 'rejected');
  assert.ok(d.auditTrail.some((l) => /REJECTED by bob/.test(l)));
});

test('archive records an archived decision', () => {
  const d = archiveExecutiveDecision(review, { reviewer: 'carol', reason: 'Superseded' }, { now: NOW });
  assert.equal(d.decision, 'archived');
});

test('reviewer + reason are trimmed', () => {
  const d = approveExecutiveDecision(review, { reviewer: '  alice  ', reason: '  ok  ' }, { now: NOW });
  assert.equal(d.reviewer, 'alice');
  assert.equal(d.reason, 'ok');
});

test('all decisions preserve previous status (reversible)', () => {
  for (const fn of [approveExecutiveDecision, rejectExecutiveDecision, archiveExecutiveDecision]) {
    const d = fn(review, { reviewer: 'r', reason: 'x' }, { now: NOW });
    assert.equal(d.previousStatus, 'queued');
    assert.equal(d.reversible, true);
  }
});

test('decisions are deterministic', () => {
  assert.deepEqual(
    approveExecutiveDecision(review, { reviewer: 'a', reason: 'b' }, { now: NOW }),
    approveExecutiveDecision(review, { reviewer: 'a', reason: 'b' }, { now: NOW }),
  );
});

test('no auto-governance: every decision names a human reviewer', () => {
  const d = approveExecutiveDecision(review, { reviewer: 'human-1', reason: 'verified' }, { now: NOW });
  assert.notEqual(d.reviewer, 'system');
  assert.ok(d.reviewer.length > 0);
});
