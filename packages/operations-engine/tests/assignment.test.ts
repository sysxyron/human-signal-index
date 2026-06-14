import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  AssignmentError,
  assignCase,
  getAssignments,
  ownershipChain,
  reassignCase,
  trackAssignmentHistory,
  unassignCase,
} from '../src/assignment';
import type { Assignment } from '../src/types';

const NOW = '2026-06-13T12:00:00.000Z';

test('assignCase produces assignment + history', () => {
  const r = assignCase({ caseId: 'c1', role: 'owner', assignee: 'alice', assigner: 'lead', reason: 'own it' }, { now: NOW });
  assert.equal(r.assignment.assignee, 'alice');
  assert.equal(r.assignment.role, 'owner');
  assert.equal(r.assignment.assignedAt, NOW);
  assert.equal(r.history.action, 'assigned');
  assert.equal(r.history.from, null);
  assert.equal(r.history.to, 'alice');
});

test('assignCase trims + carries notes', () => {
  const r = assignCase({ caseId: 'c1', role: 'owner', assignee: ' alice ', assigner: 'lead', reason: 'r', notes: ' note ' }, { now: NOW });
  assert.equal(r.assignment.assignee, 'alice');
  assert.equal(r.assignment.notes, 'note');
});

test('assignCase requires assignee/assigner/reason', () => {
  assert.throws(() => assignCase({ caseId: 'c1', role: 'owner', assignee: '', assigner: 'l', reason: 'r' }, { now: NOW }), AssignmentError);
  assert.throws(() => assignCase({ caseId: 'c1', role: 'owner', assignee: 'a', assigner: '', reason: 'r' }, { now: NOW }), AssignmentError);
  assert.throws(() => assignCase({ caseId: 'c1', role: 'owner', assignee: 'a', assigner: 'l', reason: '' }, { now: NOW }), AssignmentError);
});

test('reassignCase records from/to', () => {
  const a = assignCase({ caseId: 'c1', role: 'owner', assignee: 'alice', assigner: 'lead', reason: 'r' }, { now: NOW }).assignment;
  const r = reassignCase(a, { assignee: 'bob', assigner: 'lead', reason: 'balance' }, { now: NOW });
  assert.equal(r.assignment.assignee, 'bob');
  assert.equal(r.assignment.reassignedAt, NOW);
  assert.equal(r.history.action, 'reassigned');
  assert.equal(r.history.from, 'alice');
  assert.equal(r.history.to, 'bob');
});

test('reassign to same person is rejected', () => {
  const a = assignCase({ caseId: 'c1', role: 'owner', assignee: 'alice', assigner: 'lead', reason: 'r' }, { now: NOW }).assignment;
  assert.throws(() => reassignCase(a, { assignee: 'alice', assigner: 'lead', reason: 'r' }, { now: NOW }), AssignmentError);
});

test('unassignCase records to=null', () => {
  const a = assignCase({ caseId: 'c1', role: 'owner', assignee: 'alice', assigner: 'lead', reason: 'r' }, { now: NOW }).assignment;
  const h = unassignCase(a, { assigner: 'lead', reason: 'done' }, { now: NOW });
  assert.equal(h.action, 'unassigned');
  assert.equal(h.from, 'alice');
  assert.equal(h.to, null);
});

test('unassign requires assigner + reason', () => {
  const a = assignCase({ caseId: 'c1', role: 'owner', assignee: 'alice', assigner: 'lead', reason: 'r' }, { now: NOW }).assignment;
  assert.throws(() => unassignCase(a, { assigner: '', reason: 'r' }, { now: NOW }), AssignmentError);
});

const ASSIGNMENTS: Assignment[] = [
  { caseId: 'c1', role: 'owner', assignee: 'alice', assigner: 'lead', assignedAt: '2026-06-01T00:00:00.000Z', reason: 'r' },
  { caseId: 'c1', role: 'owner', assignee: 'bob', assigner: 'lead', assignedAt: '2026-06-05T00:00:00.000Z', reason: 'r' },
  { caseId: 'c1', role: 'reviewer', assignee: 'carol', assigner: 'lead', assignedAt: '2026-06-02T00:00:00.000Z', reason: 'r' },
  { caseId: 'c2', role: 'owner', assignee: 'dave', assigner: 'lead', assignedAt: '2026-06-03T00:00:00.000Z', reason: 'r' },
];

test('getAssignments returns latest per role for a case', () => {
  const active = getAssignments(ASSIGNMENTS, 'c1');
  const owner = active.find((a) => a.role === 'owner');
  assert.equal(owner?.assignee, 'bob'); // latest
  assert.equal(active.length, 2); // owner + reviewer
});

test('ownershipChain derives the accountability chain', () => {
  const chain = ownershipChain(ASSIGNMENTS, 'c1');
  assert.equal(chain.owner, 'bob');
  assert.equal(chain.reviewer, 'carol');
  assert.equal(chain.approver, null);
  assert.equal(chain.escalationContact, null);
});

test('trackAssignmentHistory orders by time + filters', () => {
  const history = [
    { caseId: 'c1', role: 'owner' as const, action: 'assigned' as const, from: null, to: 'alice', actor: 'lead', reason: 'r', at: '2026-06-01T00:00:00.000Z' },
    { caseId: 'c1', role: 'owner' as const, action: 'reassigned' as const, from: 'alice', to: 'bob', actor: 'lead', reason: 'r', at: '2026-06-05T00:00:00.000Z' },
    { caseId: 'c2', role: 'owner' as const, action: 'assigned' as const, from: null, to: 'dave', actor: 'lead', reason: 'r', at: '2026-06-03T00:00:00.000Z' },
  ];
  const c1 = trackAssignmentHistory(history, 'c1');
  assert.equal(c1.length, 2);
  assert.equal(c1[0].action, 'assigned');
  assert.equal(c1[1].action, 'reassigned');
});

test('empty chain when no assignments', () => {
  const chain = ownershipChain([], 'cX');
  assert.deepEqual(chain, { caseId: 'cX', owner: null, reviewer: null, approver: null, escalationContact: null });
});

test('deterministic', () => {
  const i = { caseId: 'c1', role: 'owner' as const, assignee: 'a', assigner: 'l', reason: 'r' };
  assert.deepEqual(assignCase(i, { now: NOW }), assignCase(i, { now: NOW }));
});
