import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  LIFECYCLE_ORDER,
  ALLOWED_TRANSITIONS,
  canTransition,
  transition,
} from '../src/lifecycle';
import { ESCALATION_ORDER, escalate, deEscalate, escalationRank } from '../src/escalation';
import * as engine from '../src/index';
import type { LifecycleState, EscalationLevel } from '../src/types';

const NOW = '2026-06-13T12:00:00.000Z';

// ---- full transition matrix (8x8 = 64 cases) ------------------------------
for (const from of LIFECYCLE_ORDER) {
  for (const to of LIFECYCLE_ORDER) {
    const allowed = ALLOWED_TRANSITIONS[from].includes(to);
    test(`transition ${from} → ${to} ${allowed ? 'allowed' : 'blocked'}`, () => {
      assert.equal(canTransition(from, to), allowed);
      const r = transition(from as LifecycleState, to as LifecycleState, { actor: 'a', reason: 'r' }, { now: NOW });
      assert.equal(r.ok, allowed);
    });
  }
}

// ---- escalation rank matrix ------------------------------------------------
for (let i = 0; i < ESCALATION_ORDER.length; i++) {
  for (let j = 0; j < ESCALATION_ORDER.length; j++) {
    const a = ESCALATION_ORDER[i];
    const b = ESCALATION_ORDER[j];
    test(`escalate ${a} → ${b} ${i < j ? 'ok' : 'rejected'}`, () => {
      if (i < j) {
        const r = escalate(a as EscalationLevel, b as EscalationLevel, { caseId: 'c', actor: 'x', reason: 'r' }, { now: NOW });
        assert.equal(r.escalation.level, b);
      } else {
        assert.throws(() => escalate(a as EscalationLevel, b as EscalationLevel, { caseId: 'c', actor: 'x', reason: 'r' }, { now: NOW }));
      }
    });
    test(`de-escalate ${a} → ${b} ${i > j ? 'ok' : 'rejected'}`, () => {
      if (i > j) {
        const r = deEscalate(a as EscalationLevel, b as EscalationLevel, { caseId: 'c', actor: 'x', reason: 'r' }, { now: NOW });
        assert.equal(r.escalation.level, b);
      } else {
        assert.throws(() => deEscalate(a as EscalationLevel, b as EscalationLevel, { caseId: 'c', actor: 'x', reason: 'r' }, { now: NOW }));
      }
    });
  }
}

test('escalationRank is monotonic', () => {
  for (let i = 1; i < ESCALATION_ORDER.length; i++) {
    assert.ok(escalationRank(ESCALATION_ORDER[i]) > escalationRank(ESCALATION_ORDER[i - 1]));
  }
});

test('public index re-exports the full surface', () => {
  for (const fn of ['assignCase', 'reassignCase', 'unassignCase', 'transition', 'escalate', 'computeWorkload', 'forecastCapacity', 'detectOpsAlerts', 'operationsDemo']) {
    assert.equal(typeof (engine as Record<string, unknown>)[fn], 'function');
  }
});
