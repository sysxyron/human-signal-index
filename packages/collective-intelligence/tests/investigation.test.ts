import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  INVESTIGATION_PIPELINE,
  INVESTIGATION_TRANSITIONS,
  advanceInvestigation,
  createInvestigation,
  investigationProgress,
  transitionInvestigation,
  updateInvestigation,
  validateInvestigationTransition,
} from '../src/investigation';
import { FIXTURE_NOW } from '../src/fixtures';
import type { Investigation, InvestigationState } from '../src/types';

const NOW = FIXTURE_NOW;

function inv(state: InvestigationState = 'DRAFT'): Investigation {
  return { ...createInvestigation({ id: 'i', slug: 's', title: 't', question: 'q', createdBy: 'u' }, { now: NOW }), state };
}

test('pipeline has six states', () => {
  assert.equal(INVESTIGATION_PIPELINE.length, 6);
  assert.equal(INVESTIGATION_PIPELINE[0], 'DRAFT');
  assert.equal(INVESTIGATION_PIPELINE[5], 'ARCHIVED');
});

test('createInvestigation starts DRAFT with a genesis event', () => {
  const i = createInvestigation({ id: 'i', slug: 's', title: 't', question: 'q', createdBy: 'u' }, { now: NOW });
  assert.equal(i.state, 'DRAFT');
  assert.equal(i.events.length, 1);
  assert.equal(i.createdBy, 'u');
});

test('valid transitions', () => {
  assert.equal(validateInvestigationTransition('DRAFT', 'ACTIVE').valid, true);
  assert.equal(validateInvestigationTransition('ACTIVE', 'UNDER_REVIEW').valid, true);
  assert.equal(validateInvestigationTransition('CONSENSUS_FORMING', 'PUBLISHED').valid, true);
});

test('invalid transitions rejected', () => {
  assert.equal(validateInvestigationTransition('DRAFT', 'PUBLISHED').valid, false);
  assert.equal(validateInvestigationTransition('ACTIVE', 'ACTIVE').valid, false);
});

test('back-edges exist for revision', () => {
  assert.equal(validateInvestigationTransition('UNDER_REVIEW', 'ACTIVE').valid, true);
  assert.equal(validateInvestigationTransition('CONSENSUS_FORMING', 'UNDER_REVIEW').valid, true);
});

test('transition appends an audited event', () => {
  const res = transitionInvestigation(inv('DRAFT'), 'ACTIVE', { now: NOW, actor: 'alice', reason: 'go' });
  assert.ok(res.ok);
  if (res.ok) {
    assert.equal(res.investigation.state, 'ACTIVE');
    assert.equal(res.event.actor, 'alice');
    assert.equal(res.investigation.events.length, 2);
  }
});

test('invalid transition returns ok:false, never throws', () => {
  const res = transitionInvestigation(inv('DRAFT'), 'PUBLISHED', { now: NOW });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error, 'INVALID_TRANSITION');
});

test('transition does not mutate input', () => {
  const i = inv('DRAFT');
  transitionInvestigation(i, 'ACTIVE', { now: NOW });
  assert.equal(i.state, 'DRAFT');
});

test('advance walks the pipeline', () => {
  const res = advanceInvestigation(inv('ACTIVE'), { now: NOW });
  assert.ok(res.ok);
  if (res.ok) assert.equal(res.investigation.state, 'UNDER_REVIEW');
});

test('advance on ARCHIVED returns ok:false', () => {
  assert.equal(advanceInvestigation(inv('ARCHIVED'), { now: NOW }).ok, false);
});

test('full advance reaches ARCHIVED', () => {
  let i = createInvestigation({ id: 'i', slug: 's', title: 't', question: 'q', createdBy: 'u' }, { now: NOW });
  for (let n = 0; n < 10; n++) {
    const res = advanceInvestigation(i, { now: NOW });
    if (!res.ok) break;
    i = res.investigation;
  }
  assert.equal(i.state, 'ARCHIVED');
});

test('updateInvestigation edits a DRAFT', () => {
  const res = updateInvestigation(inv('DRAFT'), { title: 'New', question: 'Q2' }, { now: NOW });
  assert.ok(res.ok);
  if (res.ok) {
    assert.equal(res.investigation.title, 'New');
    assert.equal(res.investigation.question, 'Q2');
  }
});

test('updateInvestigation refuses a published edit', () => {
  const res = updateInvestigation(inv('PUBLISHED'), { title: 'x' }, { now: NOW });
  assert.equal(res.ok, false);
});

test('ARCHIVED can be revived to ACTIVE', () => {
  assert.equal(validateInvestigationTransition('ARCHIVED', 'ACTIVE').valid, true);
});

test('investigationProgress increases', () => {
  assert.equal(investigationProgress('DRAFT'), 0);
  assert.ok(investigationProgress('PUBLISHED') > investigationProgress('ACTIVE'));
  assert.equal(investigationProgress('ARCHIVED'), 1);
});

test('every state has a defined transition list', () => {
  for (const s of INVESTIGATION_PIPELINE) assert.ok(Array.isArray(INVESTIGATION_TRANSITIONS[s]));
});

test('deterministic transitions', () => {
  assert.deepEqual(
    transitionInvestigation(inv('DRAFT'), 'ACTIVE', { now: NOW }),
    transitionInvestigation(inv('DRAFT'), 'ACTIVE', { now: NOW }),
  );
});
