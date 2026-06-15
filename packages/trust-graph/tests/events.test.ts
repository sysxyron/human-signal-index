import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TRUST_EVENT_WEIGHTS, isSelfValidation, filterSelfValidation, countSelfValidation } from '../src/events';
import type { ValidationEvent } from '../src/types';

test('all eight trust event types are weighted', () => {
  const keys = Object.keys(TRUST_EVENT_WEIGHTS);
  assert.equal(keys.length, 8);
  assert.ok(TRUST_EVENT_WEIGHTS.SIGNAL_ACCEPTED > 0);
  assert.ok(TRUST_EVENT_WEIGHTS.INVESTIGATION_ABANDONED < 0);
});

// ---- ANTI-GAMING ----------------------------------------------------------
test('self-validation is detected (actor === subject on a validation event)', () => {
  assert.equal(isSelfValidation({ type: 'SIGNAL_ACCEPTED', actorId: 'u1', subjectId: 'u1' }), true);
  assert.equal(isSelfValidation({ type: 'PUBLICATION_APPROVED', actorId: 'u1', subjectId: 'u1' }), true);
});

test('legitimate validation by another contributor is NOT self-validation', () => {
  assert.equal(isSelfValidation({ type: 'SIGNAL_ACCEPTED', actorId: 'reviewer', subjectId: 'author' }), false);
});

test('non-validation events are never flagged', () => {
  assert.equal(isSelfValidation({ type: 'INVESTIGATION_COMPLETED', actorId: 'u1', subjectId: 'u1' }), false);
});

test('filterSelfValidation removes circular boosting; counts it', () => {
  const events: ValidationEvent[] = [
    { type: 'SIGNAL_ACCEPTED', actorId: 'u1', subjectId: 'u1' }, // self → dropped
    { type: 'SIGNAL_ACCEPTED', actorId: 'reviewer', subjectId: 'u1' }, // valid → kept
    { type: 'PUBLICATION_APPROVED', actorId: 'u2', subjectId: 'u2' }, // self → dropped
  ];
  const kept = filterSelfValidation(events);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].actorId, 'reviewer');
  assert.equal(countSelfValidation(events), 2);
});
