import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_PUBLISH_THRESHOLDS,
  PublishReviewError,
  canPublish,
  publicationAuditTrail,
  publishReview,
} from '../src/governance';
import { transitionPublication } from '../src/states';
import { FIXTURE_NOW, seedPublication } from '../src/fixtures';
import type { Publication } from '../src/types';

const NOW = FIXTURE_NOW;

function approved(overrides: Partial<Publication> = {}): Publication {
  let p = seedPublication();
  for (const to of ['UNDER_REVIEW', 'APPROVED'] as const) {
    const res = transitionPublication(p, to, { now: NOW });
    if (res.ok) p = res.publication;
  }
  return { ...p, ...overrides };
}

test('approved publication with good metrics can publish', () => {
  const r = canPublish(approved());
  assert.equal(r.canPublish, true);
  assert.equal(r.blockers.length, 0);
  assert.equal(r.checks.length, 5);
});

test('draft cannot publish (not approved)', () => {
  const r = canPublish(seedPublication());
  assert.equal(r.canPublish, false);
  assert.ok(r.blockers.length >= 1);
});

test('low trust blocks publishing', () => {
  const r = canPublish(approved({ trustScore: 40 }));
  assert.equal(r.canPublish, false);
  assert.ok(r.checks.find((c) => c.label === 'trust-threshold')?.ok === false);
});

test('insufficient evidence blocks publishing', () => {
  const r = canPublish(approved({ evidenceCount: 1 }));
  assert.equal(r.canPublish, false);
  assert.ok(r.checks.find((c) => c.label === 'evidence-threshold')?.ok === false);
});

test('insufficient sources blocks publishing', () => {
  const r = canPublish(approved({ sourceCount: 0 }));
  assert.equal(r.canPublish, false);
});

test('uncleared governance blocks publishing', () => {
  const r = canPublish(approved({ governanceStatus: 'pending' }));
  assert.equal(r.canPublish, false);
});

test('custom thresholds change the verdict', () => {
  const p = approved({ trustScore: 50 });
  assert.equal(canPublish(p).canPublish, false);
  assert.equal(canPublish(p, { minTrust: 40, minEvidence: 3, minSources: 2 }).canPublish, true);
});

test('default thresholds are sane', () => {
  assert.ok(DEFAULT_PUBLISH_THRESHOLDS.minTrust > 0);
  assert.ok(DEFAULT_PUBLISH_THRESHOLDS.minEvidence > 0);
});

test('publishReview requires a reviewer', () => {
  assert.throws(
    () => publishReview(approved(), { decision: 'approved', reviewer: '', reason: 'ok' }, { now: NOW }),
    PublishReviewError,
  );
});

test('publishReview requires a reason', () => {
  assert.throws(
    () => publishReview(approved(), { decision: 'approved', reviewer: 'alice', reason: '  ' }, { now: NOW }),
    PublishReviewError,
  );
});

test('publishReview captures the gate snapshot', () => {
  const r = publishReview(approved(), { decision: 'approved', reviewer: 'alice', reason: 'verified' }, { now: NOW });
  assert.equal(r.decision, 'approved');
  assert.equal(r.reviewer, 'alice');
  assert.equal(r.gate.canPublish, true);
  assert.equal(r.at, NOW);
});

test('publishReview does not mutate the publication', () => {
  const p = approved();
  publishReview(p, { decision: 'approved', reviewer: 'alice', reason: 'ok' }, { now: NOW });
  assert.equal(p.state, 'APPROVED');
});

test('publicationAuditTrail renders all events', () => {
  const trail = publicationAuditTrail(approved());
  assert.ok(trail.length >= 3);
  assert.ok(trail.every((l) => /→/.test(l)));
});

test('summary explains the verdict', () => {
  assert.match(canPublish(approved()).summary, /Eligible/);
  assert.match(canPublish(seedPublication()).summary, /Not eligible/);
});
