import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SCENARIO_TRANSITIONS, validateScenarioTransition } from '../src/scenario';
import type { ScenarioState } from '../src/types';

const ALL: ScenarioState[] = ['EMERGING', 'ACTIVE', 'MONITORING', 'CONFIRMED', 'INVALIDATED', 'ARCHIVED'];

// Exhaustively verify the scenario transition matrix.
for (const from of ALL) {
  const allowed = SCENARIO_TRANSITIONS[from];
  for (const to of ALL) {
    const expected = from !== to && allowed.includes(to);
    test(`${from} -> ${to} is ${expected ? 'valid' : 'invalid'}`, () => {
      assert.equal(validateScenarioTransition(from, to).valid, expected);
    });
  }
}

test('self-transitions are always invalid', () => {
  for (const s of ALL) assert.equal(validateScenarioTransition(s, s).valid, false);
});

test('every verdict carries a reason', () => {
  for (const from of ALL) for (const to of ALL) assert.ok(validateScenarioTransition(from, to).reason.length > 0);
});

test('every state can reach ARCHIVED (directly or via a path)', () => {
  for (const start of ALL) {
    const seen = new Set<ScenarioState>([start]);
    const queue: ScenarioState[] = [start];
    while (queue.length) {
      const s = queue.shift()!;
      for (const n of SCENARIO_TRANSITIONS[s]) if (!seen.has(n)) { seen.add(n); queue.push(n); }
    }
    assert.ok(seen.has('ARCHIVED'), `${start} cannot reach ARCHIVED`);
  }
});

test('INVALIDATED is near-terminal (archive only)', () => {
  assert.deepEqual(SCENARIO_TRANSITIONS.INVALIDATED, ['ARCHIVED']);
});
