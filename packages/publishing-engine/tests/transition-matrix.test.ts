import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PUBLICATION_TRANSITIONS, validatePublicationTransition } from '../src/states';
import type { PublicationState } from '../src/types';

const ALL: PublicationState[] = ['DRAFT', 'UNDER_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED', 'RETRACTED'];

// Exhaustively verify the transition matrix: every allowed pair is valid, every
// disallowed pair is invalid, and self-transitions are always rejected.

for (const from of ALL) {
  const allowed = PUBLICATION_TRANSITIONS[from];
  for (const to of ALL) {
    const expected = from !== to && allowed.includes(to);
    test(`${from} -> ${to} is ${expected ? 'valid' : 'invalid'}`, () => {
      assert.equal(validatePublicationTransition(from, to).valid, expected);
    });
  }
}

test('self-transitions are always invalid', () => {
  for (const s of ALL) assert.equal(validatePublicationTransition(s, s).valid, false);
});

test('RETRACTED has no outgoing transitions', () => {
  assert.equal(PUBLICATION_TRANSITIONS.RETRACTED.length, 0);
  for (const to of ALL) assert.equal(validatePublicationTransition('RETRACTED', to).valid, false);
});

test('every reachable state can be reached from DRAFT in the matrix', () => {
  // BFS over the transition graph from DRAFT.
  const seen = new Set<PublicationState>(['DRAFT']);
  const queue: PublicationState[] = ['DRAFT'];
  while (queue.length) {
    const s = queue.shift()!;
    for (const n of PUBLICATION_TRANSITIONS[s]) {
      if (!seen.has(n)) { seen.add(n); queue.push(n); }
    }
  }
  // All states are reachable from DRAFT.
  for (const s of ALL) assert.ok(seen.has(s), `${s} unreachable`);
});

test('every validity verdict carries a reason', () => {
  for (const from of ALL) {
    for (const to of ALL) {
      assert.ok(validatePublicationTransition(from, to).reason.length > 0);
    }
  }
});
