import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ExecutiveGovernanceError,
  approveExecutiveDecision,
  archiveExecutiveDecision,
  queueExecutiveReview,
  rejectExecutiveDecision,
} from '../src/governance';
import type { AttentionLevel, ExecutiveDecisionType, PriorityKind, StrategicPriority } from '../src/types';

const NOW = '2026-06-09T12:00:00.000Z';

function priority(o: Partial<StrategicPriority> = {}): StrategicPriority {
  return {
    id: 'pri-1', kind: 'risk', title: 'T', score: 70, urgency: 0.8, impact: 0.8,
    confidenceWeight: 0.6, evidenceWeight: 0.6, rank: 1, attentionLevel: 'elevated',
    recommendation: 'r', explanation: ['e'], limitations: ['advisory'], ...o,
  };
}

const decideFns: Array<[ExecutiveDecisionType, (r: ReturnType<typeof queueExecutiveReview>, i: { reviewer: string; reason: string }, o: { now: string }) => unknown]> = [
  ['approved', approveExecutiveDecision],
  ['rejected', rejectExecutiveDecision],
  ['archived', archiveExecutiveDecision],
];

// ---- every decision kind × every priority kind preserves invariants ---------
const KINDS: PriorityKind[] = ['risk', 'opportunity', 'investigation', 'forecast', 'warning', 'governance', 'consensus', 'trust'];
for (const [decision, fn] of decideFns) {
  for (const kind of KINDS) {
    test(`${decision} on a ${kind} priority is reversible + audited`, () => {
      const review = queueExecutiveReview(priority({ kind }), { now: NOW, id: 'rev' });
      const d = fn(review, { reviewer: 'human', reason: 'because' }, { now: NOW }) as { decision: string; reversible: boolean; auditTrail: string[]; previousStatus: string };
      assert.equal(d.decision, decision);
      assert.equal(d.reversible, true);
      assert.equal(d.previousStatus, 'queued');
      assert.ok(d.auditTrail.length >= 3);
    });
  }
}

// ---- blank reviewer / reason rejected for every decision kind ---------------
for (const [decision, fn] of decideFns) {
  test(`${decision} rejects blank reviewer`, () => {
    const review = queueExecutiveReview(priority(), { now: NOW, id: 'rev' });
    assert.throws(() => fn(review, { reviewer: '  ', reason: 'ok' }, { now: NOW }), ExecutiveGovernanceError);
  });
  test(`${decision} rejects blank reason`, () => {
    const review = queueExecutiveReview(priority(), { now: NOW, id: 'rev' });
    assert.throws(() => fn(review, { reviewer: 'ok', reason: '' }, { now: NOW }), ExecutiveGovernanceError);
  });
}

// ---- severity mapping over all attention levels -----------------------------
const sevByLevel: Array<[AttentionLevel, string]> = [
  ['urgent', 'CRITICAL'], ['elevated', 'HIGH'], ['notable', 'MEDIUM'], ['routine', 'LOW'],
];
for (const [level, severity] of sevByLevel) {
  test(`queue maps ${level} → ${severity}`, () => {
    const review = queueExecutiveReview(priority({ attentionLevel: level }), { now: NOW, id: 'rev' });
    assert.equal(review.severity, severity);
  });
}

// ---- audit trail content ----------------------------------------------------
test('audit trail records the review, the decision, and reversibility', () => {
  const review = queueExecutiveReview(priority({ title: 'Trust collapse' }), { now: NOW, id: 'rev-9' });
  const d = approveExecutiveDecision(review, { reviewer: 'alice', reason: 'verified' }, { now: NOW });
  assert.ok(d.auditTrail[0].includes('rev-9'));
  assert.ok(d.auditTrail[0].includes('Trust collapse'));
  assert.ok(d.auditTrail[1].includes('APPROVED by alice'));
  assert.ok(d.auditTrail[1].includes('verified'));
  assert.ok(d.auditTrail[2].includes('reversible'));
});

test('error carries the governance error name', () => {
  const review = queueExecutiveReview(priority(), { now: NOW, id: 'rev' });
  try {
    approveExecutiveDecision(review, { reviewer: '', reason: '' }, { now: NOW });
    assert.fail('should have thrown');
  } catch (e) {
    assert.ok(e instanceof ExecutiveGovernanceError);
    assert.equal((e as Error).name, 'ExecutiveGovernanceError');
  }
});
