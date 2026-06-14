import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ALLOWED_TRANSITIONS,
  LIFECYCLE_ORDER,
  buildTimeline,
  canTransition,
  isTerminal,
  lifecycleProgress,
  nextStates,
  transition,
} from '../src/lifecycle';
import type { LifecycleTransition } from '../src/types';

const NOW = '2026-06-13T12:00:00.000Z';

test('canonical order is 8 states', () => {
  assert.equal(LIFECYCLE_ORDER.length, 8);
  assert.equal(LIFECYCLE_ORDER[0], 'SUBMITTED');
  assert.equal(LIFECYCLE_ORDER[7], 'ARCHIVED');
});

test('forward step is allowed for each stage', () => {
  for (let i = 0; i < LIFECYCLE_ORDER.length - 1; i++) {
    assert.ok(canTransition(LIFECYCLE_ORDER[i], LIFECYCLE_ORDER[i + 1]), `${LIFECYCLE_ORDER[i]}→${LIFECYCLE_ORDER[i + 1]}`);
  }
});

test('ARCHIVED is terminal', () => {
  assert.equal(isTerminal('ARCHIVED'), true);
  assert.deepEqual(ALLOWED_TRANSITIONS.ARCHIVED, []);
});

test('non-terminal states are not terminal', () => {
  for (const s of LIFECYCLE_ORDER.slice(0, 7)) assert.equal(isTerminal(s), false);
});

test('skipping a stage is not allowed', () => {
  assert.equal(canTransition('SUBMITTED', 'RESEARCH'), false);
  assert.equal(canTransition('TRIAGE', 'REVIEW'), false);
});

test('one-step rework back is allowed', () => {
  assert.equal(canTransition('RESEARCH', 'TRIAGE'), true);
  assert.equal(canTransition('REVIEW', 'EVIDENCE_COLLECTION'), true);
});

test('most stages can be archived', () => {
  for (const s of ['SUBMITTED', 'TRIAGE', 'RESEARCH', 'EVIDENCE_COLLECTION', 'REVIEW', 'PUBLICATION_REVIEW', 'PUBLISHED'] as const) {
    assert.ok(canTransition(s, 'ARCHIVED'), s);
  }
});

test('transition requires actor', () => {
  const r = transition('SUBMITTED', 'TRIAGE', { actor: '', reason: 'go' }, { now: NOW });
  assert.equal(r.ok, false);
});

test('transition requires reason', () => {
  const r = transition('SUBMITTED', 'TRIAGE', { actor: 'a', reason: '  ' }, { now: NOW });
  assert.equal(r.ok, false);
});

test('valid transition records an auditable event', () => {
  const r = transition('SUBMITTED', 'TRIAGE', { actor: 'alice', reason: 'Triage it' }, { now: NOW });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.state, 'TRIAGE');
    assert.deepEqual(r.transition, { from: 'SUBMITTED', to: 'TRIAGE', actor: 'alice', reason: 'Triage it', at: NOW });
  }
});

test('illegal transition is rejected with a reason', () => {
  const r = transition('SUBMITTED', 'PUBLISHED', { actor: 'a', reason: 'r' }, { now: NOW });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /not allowed/);
});

test('self-transition rejected', () => {
  const r = transition('REVIEW', 'REVIEW', { actor: 'a', reason: 'r' }, { now: NOW });
  assert.equal(r.ok, false);
});

test('transition out of ARCHIVED rejected', () => {
  const r = transition('ARCHIVED', 'PUBLISHED', { actor: 'a', reason: 'r' }, { now: NOW });
  assert.equal(r.ok, false);
});

test('nextStates returns the allowed set', () => {
  assert.deepEqual(nextStates('PUBLISHED'), ['ARCHIVED']);
  assert.ok(nextStates('REVIEW').includes('PUBLICATION_REVIEW'));
});

test('progress increases along the order', () => {
  assert.equal(lifecycleProgress('SUBMITTED'), 0);
  assert.equal(lifecycleProgress('ARCHIVED'), 1);
  assert.ok(lifecycleProgress('REVIEW') > lifecycleProgress('TRIAGE'));
});

test('buildTimeline orders + computes durations', () => {
  const transitions: LifecycleTransition[] = [
    { from: 'SUBMITTED', to: 'TRIAGE', actor: 'a', reason: 'x', at: '2026-06-01T00:00:00.000Z' },
    { from: 'TRIAGE', to: 'RESEARCH', actor: 'b', reason: 'y', at: '2026-06-02T00:00:00.000Z' },
  ];
  const tl = buildTimeline(transitions);
  assert.equal(tl[0].state, 'SUBMITTED');
  assert.equal(tl[1].state, 'TRIAGE');
  assert.equal(tl[2].state, 'RESEARCH');
  // Without a seed creation time, SUBMITTED shares the first transition's time
  // (duration 0); TRIAGE spans one day until the RESEARCH transition.
  assert.equal(tl[0].durationMs, 0);
  assert.equal(tl[1].durationMs, 24 * 3600 * 1000);
});

test('buildTimeline with seed + no transitions', () => {
  const tl = buildTimeline([], { state: 'SUBMITTED', at: NOW });
  assert.equal(tl.length, 1);
  assert.equal(tl[0].state, 'SUBMITTED');
});

test('buildTimeline empty + no seed → empty', () => {
  assert.deepEqual(buildTimeline([]), []);
});

test('transition is deterministic', () => {
  assert.deepEqual(
    transition('RESEARCH', 'EVIDENCE_COLLECTION', { actor: 'a', reason: 'r' }, { now: NOW }),
    transition('RESEARCH', 'EVIDENCE_COLLECTION', { actor: 'a', reason: 'r' }, { now: NOW }),
  );
});
