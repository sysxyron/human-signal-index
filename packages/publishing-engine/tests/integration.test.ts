import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  archivePublication,
  canPublish,
  createPublication,
  isPubliclyVisible,
  publicationAuditTrail,
  publishPublication,
  publishReview,
  retractPublication,
  transitionPublication,
  unpublishPublication,
  updatePublication,
} from '../src';
import { FIXTURE_NOW, seedPublication } from '../src/fixtures';
import type { Publication } from '../src/types';

const NOW = FIXTURE_NOW;

function drive(pub: Publication, states: Publication['state'][]): Publication {
  let p = pub;
  for (const to of states) {
    const res = transitionPublication(p, to, { now: NOW });
    if (res.ok) p = res.publication;
  }
  return p;
}

test('end-to-end: draft → review → approve → publish → archive', () => {
  let p = seedPublication();
  p = drive(p, ['UNDER_REVIEW', 'APPROVED']);
  assert.equal(canPublish(p).canPublish, true);
  const pub = publishPublication(p, { now: NOW });
  assert.ok(pub.ok);
  if (pub.ok) {
    p = pub.publication;
    assert.equal(p.state, 'PUBLISHED');
    const arch = archivePublication(p, { now: NOW });
    assert.ok(arch.ok);
    if (arch.ok) assert.equal(arch.publication.state, 'ARCHIVED');
  }
});

test('end-to-end: publish gate blocks a thin publication', () => {
  let p = createPublication({ id: 'p', slug: 's', title: 't', summary: 'm', trustScore: 30, evidenceCount: 1, sourceCount: 0 }, { now: NOW });
  p = drive(p, ['UNDER_REVIEW', 'APPROVED']);
  const gate = canPublish(p);
  assert.equal(gate.canPublish, false);
  assert.ok(gate.blockers.length >= 2);
});

test('end-to-end: rejected review sends back to draft', () => {
  let p = drive(seedPublication(), ['UNDER_REVIEW']);
  const review = publishReview(p, { decision: 'rejected', reviewer: 'alice', reason: 'needs more evidence' }, { now: NOW });
  assert.equal(review.decision, 'rejected');
  const back = transitionPublication(p, 'DRAFT', { now: NOW });
  assert.ok(back.ok);
  if (back.ok) assert.equal(back.publication.state, 'DRAFT');
});

test('end-to-end: unpublish → edit → re-review → republish', () => {
  let p = drive(seedPublication(), ['UNDER_REVIEW', 'APPROVED', 'PUBLISHED']);
  const un = unpublishPublication(p, { now: NOW });
  assert.ok(un.ok);
  if (un.ok) {
    p = un.publication;
    const edit = updatePublication(p, { summary: 'Revised summary' }, { now: NOW });
    assert.ok(edit.ok);
    if (edit.ok) {
      p = edit.publication;
      assert.equal(p.summary, 'Revised summary');
      const re = drive(p, ['APPROVED', 'PUBLISHED']);
      assert.equal(re.state, 'PUBLISHED');
    }
  }
});

test('end-to-end: retraction keeps the report visible', () => {
  const p = drive(seedPublication(), ['UNDER_REVIEW', 'APPROVED', 'PUBLISHED']);
  const { publication } = retractPublication(p, { reason: 'data_quality_issue', detail: 'Bad input data.', retractedBy: 'alice' }, { now: NOW });
  assert.equal(publication.state, 'RETRACTED');
  assert.equal(isPubliclyVisible(publication.state), true);
});

test('audit trail spans the whole lifecycle', () => {
  const p = drive(seedPublication(), ['UNDER_REVIEW', 'APPROVED', 'PUBLISHED']);
  const trail = publicationAuditTrail(p);
  assert.ok(trail.length >= 4);
  assert.ok(trail.some((l) => /PUBLISHED/.test(l)));
});

test('published publication exposes publishedAt', () => {
  const p = drive(seedPublication(), ['UNDER_REVIEW', 'APPROVED', 'PUBLISHED']);
  assert.equal(p.publishedAt, NOW);
});

test('cannot edit once published', () => {
  const p = drive(seedPublication(), ['UNDER_REVIEW', 'APPROVED', 'PUBLISHED']);
  assert.equal(updatePublication(p, { title: 'x' }, { now: NOW }).ok, false);
});

test('cannot skip review (draft → approved invalid)', () => {
  assert.equal(transitionPublication(seedPublication(), 'APPROVED', { now: NOW }).ok, false);
});

test('archived can be revived to draft', () => {
  const p = drive(seedPublication(), ['ARCHIVED']);
  const back = transitionPublication(p, 'DRAFT', { now: NOW });
  assert.ok(back.ok);
});

test('approved can be retracted directly', () => {
  const p = drive(seedPublication(), ['UNDER_REVIEW', 'APPROVED']);
  const { publication } = retractPublication(p, { reason: 'governance_decision', detail: 'Pulled by governance.', retractedBy: 'gov' }, { now: NOW });
  assert.equal(publication.state, 'RETRACTED');
});

test('gate snapshot captured in review reflects eligibility', () => {
  const p = drive(seedPublication(), ['UNDER_REVIEW', 'APPROVED']);
  const review = publishReview(p, { decision: 'approved', reviewer: 'alice', reason: 'ok' }, { now: NOW });
  assert.equal(review.gate.canPublish, true);
  assert.equal(review.gate.checks.length, 5);
});

test('deterministic end-to-end', () => {
  const build = () => drive(seedPublication(), ['UNDER_REVIEW', 'APPROVED', 'PUBLISHED']);
  assert.deepEqual(build(), build());
});

test('transition history grows monotonically', () => {
  let p = seedPublication();
  const counts: number[] = [p.events.length];
  for (const to of ['UNDER_REVIEW', 'APPROVED', 'PUBLISHED'] as const) {
    const res = transitionPublication(p, to, { now: NOW });
    if (res.ok) { p = res.publication; counts.push(p.events.length); }
  }
  for (let i = 1; i < counts.length; i++) assert.ok(counts[i] > counts[i - 1]);
});

test('publishing requires APPROVED first (gate independent of state check)', () => {
  // A DRAFT with great metrics still cannot publish (not approved).
  const p = createPublication({ id: 'p', slug: 's', title: 't', summary: 'm', trustScore: 90, evidenceCount: 10, sourceCount: 5 }, { now: NOW });
  assert.equal(canPublish(p).canPublish, false);
});
