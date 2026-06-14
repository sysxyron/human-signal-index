import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ESCALATION_ORDER,
  EscalationError,
  deEscalate,
  escalate,
  escalationHistory,
  escalationNotifications,
  escalationRank,
} from '../src/escalation';

const NOW = '2026-06-13T12:00:00.000Z';

test('order is LOW<MEDIUM<HIGH<CRITICAL', () => {
  assert.deepEqual(ESCALATION_ORDER, ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
  assert.ok(escalationRank('CRITICAL') > escalationRank('LOW'));
});

test('escalate raises level + records history', () => {
  const r = escalate('LOW', 'HIGH', { caseId: 'c1', actor: 'bob', reason: 'fast' }, { now: NOW });
  assert.equal(r.escalation.level, 'HIGH');
  assert.equal(r.escalation.active, true);
  assert.equal(r.history.action, 'escalated');
  assert.equal(r.history.from, 'LOW');
  assert.equal(r.history.to, 'HIGH');
});

test('escalate from null (no prior level)', () => {
  const r = escalate(null, 'MEDIUM', { caseId: 'c1', actor: 'a', reason: 'r' }, { now: NOW });
  assert.equal(r.escalation.level, 'MEDIUM');
  assert.equal(r.history.from, null);
});

test('escalate must raise', () => {
  assert.throws(() => escalate('HIGH', 'LOW', { caseId: 'c1', actor: 'a', reason: 'r' }, { now: NOW }), EscalationError);
  assert.throws(() => escalate('HIGH', 'HIGH', { caseId: 'c1', actor: 'a', reason: 'r' }, { now: NOW }), EscalationError);
});

test('escalate requires actor + reason', () => {
  assert.throws(() => escalate('LOW', 'HIGH', { caseId: 'c1', actor: '', reason: 'r' }, { now: NOW }), EscalationError);
  assert.throws(() => escalate('LOW', 'HIGH', { caseId: 'c1', actor: 'a', reason: '' }, { now: NOW }), EscalationError);
});

test('deEscalate lowers level', () => {
  const r = deEscalate('CRITICAL', 'MEDIUM', { caseId: 'c1', actor: 'a', reason: 'calmed' }, { now: NOW });
  assert.equal(r.escalation.level, 'MEDIUM');
  assert.equal(r.escalation.active, true);
  assert.equal(r.history.action, 'de-escalated');
});

test('deEscalate to null clears (inactive)', () => {
  const r = deEscalate('HIGH', null, { caseId: 'c1', actor: 'a', reason: 'resolved' }, { now: NOW });
  assert.equal(r.escalation.active, false);
  assert.equal(r.history.to, null);
});

test('deEscalate must lower', () => {
  assert.throws(() => deEscalate('LOW', 'HIGH', { caseId: 'c1', actor: 'a', reason: 'r' }, { now: NOW }), EscalationError);
});

test('history ordered by time + filtered', () => {
  const h = [
    { caseId: 'c1', action: 'escalated' as const, from: 'LOW' as const, to: 'HIGH' as const, actor: 'a', reason: 'r', at: '2026-06-01T00:00:00.000Z' },
    { caseId: 'c1', action: 'de-escalated' as const, from: 'HIGH' as const, to: 'LOW' as const, actor: 'a', reason: 'r', at: '2026-06-02T00:00:00.000Z' },
    { caseId: 'c2', action: 'escalated' as const, from: null, to: 'MEDIUM' as const, actor: 'a', reason: 'r', at: '2026-06-01T00:00:00.000Z' },
  ];
  const c1 = escalationHistory(h, 'c1');
  assert.equal(c1.length, 2);
  assert.equal(c1[0].action, 'escalated');
});

test('notifications are advisory-only (never act)', () => {
  const r = escalate('LOW', 'HIGH', { caseId: 'c1', actor: 'a', reason: 'r' }, { now: NOW });
  const notes = escalationNotifications(r.escalation, ['lead', 'admin']);
  assert.equal(notes.length, 2);
  for (const n of notes) {
    assert.equal(n.advisory, true);
    assert.match(n.message, /escalated to HIGH/);
  }
});

test('deterministic', () => {
  assert.deepEqual(
    escalate('LOW', 'CRITICAL', { caseId: 'c1', actor: 'a', reason: 'r' }, { now: NOW }),
    escalate('LOW', 'CRITICAL', { caseId: 'c1', actor: 'a', reason: 'r' }, { now: NOW }),
  );
});
