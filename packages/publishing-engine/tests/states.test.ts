import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PUBLICATION_TRANSITIONS,
  archivePublication,
  createPublication,
  isPubliclyVisible,
  publishPublication,
  transitionPublication,
  unpublishPublication,
  updatePublication,
  validatePublicationTransition,
} from '../src/states';
import { FIXTURE_NOW, seedPublication } from '../src/fixtures';
import type { Publication, PublicationState } from '../src/types';

const NOW = FIXTURE_NOW;

function at(state: PublicationState): Publication {
  return { ...seedPublication(), state };
}

test('createPublication starts in DRAFT with a genesis event', () => {
  const p = createPublication({ id: 'p', slug: 's', title: 't', summary: 'm' }, { now: NOW });
  assert.equal(p.state, 'DRAFT');
  assert.equal(p.events.length, 1);
  assert.equal(p.reviewStatus, 'pending');
});

test('createPublication clamps trust + confidence', () => {
  const p = createPublication({ id: 'p', slug: 's', title: 't', summary: 'm', trustScore: 150, confidence: 2 }, { now: NOW });
  assert.equal(p.trustScore, 100);
  assert.equal(p.confidence, 1);
});

test('valid lifecycle transitions', () => {
  assert.equal(validatePublicationTransition('DRAFT', 'UNDER_REVIEW').valid, true);
  assert.equal(validatePublicationTransition('UNDER_REVIEW', 'APPROVED').valid, true);
  assert.equal(validatePublicationTransition('APPROVED', 'PUBLISHED').valid, true);
  assert.equal(validatePublicationTransition('PUBLISHED', 'ARCHIVED').valid, true);
});

test('invalid transitions rejected', () => {
  assert.equal(validatePublicationTransition('DRAFT', 'PUBLISHED').valid, false);
  assert.equal(validatePublicationTransition('PUBLISHED', 'PUBLISHED').valid, false);
});

test('RETRACTED is terminal', () => {
  assert.deepEqual(PUBLICATION_TRANSITIONS.RETRACTED, []);
});

test('transition appends an audited event', () => {
  const res = transitionPublication(at('DRAFT'), 'UNDER_REVIEW', { now: NOW, actor: 'alice', reason: 'go' });
  assert.ok(res.ok);
  if (res.ok) {
    assert.equal(res.publication.state, 'UNDER_REVIEW');
    assert.equal(res.event.actor, 'alice');
    assert.equal(res.publication.reviewStatus, 'in_review');
  }
});

test('invalid transition returns ok:false, never throws', () => {
  const res = transitionPublication(at('DRAFT'), 'PUBLISHED', { now: NOW });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error, 'INVALID_TRANSITION');
});

test('transition does not mutate input', () => {
  const p = at('DRAFT');
  transitionPublication(p, 'UNDER_REVIEW', { now: NOW });
  assert.equal(p.state, 'DRAFT');
});

test('publishing stamps publishedAt + sets statuses', () => {
  const res = publishPublication(at('APPROVED'), { now: NOW });
  assert.ok(res.ok);
  if (res.ok) {
    assert.equal(res.publication.state, 'PUBLISHED');
    assert.equal(res.publication.publishedAt, NOW);
    assert.equal(res.publication.governanceStatus, 'cleared');
  }
});

test('publish rejected from DRAFT', () => {
  assert.equal(publishPublication(at('DRAFT'), { now: NOW }).ok, false);
});

test('unpublish moves PUBLISHED to UNDER_REVIEW', () => {
  const res = unpublishPublication(at('PUBLISHED'), { now: NOW });
  assert.ok(res.ok);
  if (res.ok) assert.equal(res.publication.state, 'UNDER_REVIEW');
});

test('archive from PUBLISHED', () => {
  const res = archivePublication(at('PUBLISHED'), { now: NOW });
  assert.ok(res.ok);
  if (res.ok) assert.equal(res.publication.state, 'ARCHIVED');
});

test('updatePublication edits a DRAFT', () => {
  const res = updatePublication(at('DRAFT'), { title: 'New', evidenceCount: 9 }, { now: NOW });
  assert.ok(res.ok);
  if (res.ok) {
    assert.equal(res.publication.title, 'New');
    assert.equal(res.publication.evidenceCount, 9);
  }
});

test('updatePublication refuses a PUBLISHED edit', () => {
  const res = updatePublication(at('PUBLISHED'), { title: 'New' }, { now: NOW });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error, 'NOT_EDITABLE');
});

test('isPubliclyVisible for PUBLISHED + RETRACTED only', () => {
  assert.equal(isPubliclyVisible('PUBLISHED'), true);
  assert.equal(isPubliclyVisible('RETRACTED'), true);
  assert.equal(isPubliclyVisible('DRAFT'), false);
  assert.equal(isPubliclyVisible('APPROVED'), false);
});

test('full lifecycle accumulates history', () => {
  let p = createPublication({ id: 'p', slug: 's', title: 't', summary: 'm' }, { now: NOW });
  for (const to of ['UNDER_REVIEW', 'APPROVED', 'PUBLISHED'] as const) {
    const res = transitionPublication(p, to, { now: NOW });
    if (res.ok) p = res.publication;
  }
  assert.equal(p.state, 'PUBLISHED');
  assert.equal(p.events.length, 4);
});

test('deterministic transitions', () => {
  assert.deepEqual(
    transitionPublication(at('DRAFT'), 'UNDER_REVIEW', { now: NOW }),
    transitionPublication(at('DRAFT'), 'UNDER_REVIEW', { now: NOW }),
  );
});
