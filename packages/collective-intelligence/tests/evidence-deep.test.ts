import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  challengeEvidence,
  createEvidenceClaim,
  reviewEvidence,
  scoreEvidenceStrength,
  supportEvidence,
} from '../src/evidence';
import { FIXTURE_NOW } from '../src/fixtures';
import type { EvidenceClaim } from '../src/types';

const NOW = FIXTURE_NOW;

function claim(sourceQuality = 0.7): EvidenceClaim {
  return createEvidenceClaim({ id: 'e', investigationId: 'i', contributorId: 'c', claim: 'x', sourceRef: 's', sourceQuality }, { now: NOW });
}

test('strength rises monotonically with support', () => {
  let c = claim();
  const s0 = scoreEvidenceStrength(c).strength;
  c = supportEvidence(c, { now: NOW });
  const s1 = scoreEvidenceStrength(c).strength;
  c = supportEvidence(c, { now: NOW });
  const s2 = scoreEvidenceStrength(c).strength;
  assert.ok(s1 >= s0 && s2 >= s1);
});

test('strength falls with challenges', () => {
  let c = claim();
  const s0 = scoreEvidenceStrength(c).strength;
  c = challengeEvidence(c, { now: NOW });
  c = challengeEvidence(c, { now: NOW });
  assert.ok(scoreEvidenceStrength(c).strength < s0);
});

test('higher source quality → higher base strength', () => {
  assert.ok(scoreEvidenceStrength(claim(0.9)).strength > scoreEvidenceStrength(claim(0.2)).strength);
});

test('balanced support+challenge keeps a neutral-ish contest factor', () => {
  let c = claim();
  c = supportEvidence(c, { now: NOW });
  c = challengeEvidence(c, { now: NOW });
  const s = scoreEvidenceStrength(c);
  assert.ok(s.supportCount === 1 && s.challengeCount === 1);
});

test('approved reviews accumulate', () => {
  let c = claim();
  c = reviewEvidence(c, { id: 'r1', reviewerId: 'a', decision: 'approved', reason: 'ok' }, { now: NOW }).claim;
  c = reviewEvidence(c, { id: 'r2', reviewerId: 'b', decision: 'approved', reason: 'ok' }, { now: NOW }).claim;
  assert.equal(c.reviewsApproved, 2);
});

test('rejected reviews accumulate separately', () => {
  let c = claim();
  c = reviewEvidence(c, { id: 'r1', reviewerId: 'a', decision: 'rejected', reason: 'no' }, { now: NOW }).claim;
  assert.equal(c.reviewsRejected, 1);
  assert.equal(c.reviewsApproved, 0);
});

test('strength bounded in [0,1]', () => {
  let c = claim(1);
  for (let i = 0; i < 10; i++) c = supportEvidence(c, { now: NOW });
  for (let i = 0; i < 5; i++) c = reviewEvidence(c, { id: `r${i}`, reviewerId: 'a', decision: 'approved', reason: 'ok' }, { now: NOW }).claim;
  const s = scoreEvidenceStrength(c).strength;
  assert.ok(s >= 0 && s <= 1);
});

test('explanation always present', () => {
  assert.ok(scoreEvidenceStrength(claim()).explanation.length >= 2);
});

test('limitations note neutral factors when no debate', () => {
  const s = scoreEvidenceStrength(claim());
  assert.ok(s.limitations.some((l) => /neutral 50%/.test(l)));
});

test('review returns a review record with the decision', () => {
  const r = reviewEvidence(claim(), { id: 'r', reviewerId: 'a', decision: 'approved', reason: 'sound' }, { now: NOW });
  assert.equal(r.review.evidenceClaimId, 'e');
  assert.equal(r.review.reviewerId, 'a');
  assert.equal(r.review.reason, 'sound');
});

test('support/challenge do not mutate the input claim', () => {
  const c = claim();
  supportEvidence(c, { now: NOW });
  challengeEvidence(c, { now: NOW });
  assert.equal(c.supportCount, 0);
  assert.equal(c.challengeCount, 0);
});

test('createEvidenceClaim default source quality is neutral', () => {
  const c = createEvidenceClaim({ id: 'e', investigationId: 'i', contributorId: 'c', claim: 'x', sourceRef: 's' }, { now: NOW });
  assert.equal(c.sourceQuality, 0.5);
});

test('strength is explainable + deterministic', () => {
  const c = claim();
  assert.deepEqual(scoreEvidenceStrength(c), scoreEvidenceStrength(c));
});

test('reviewsApproved raise strength vs reviewsRejected', () => {
  const approved = reviewEvidence(claim(), { id: 'r', reviewerId: 'a', decision: 'approved', reason: 'ok' }, { now: NOW }).claim;
  const rejected = reviewEvidence(claim(), { id: 'r', reviewerId: 'a', decision: 'rejected', reason: 'no' }, { now: NOW }).claim;
  assert.ok(scoreEvidenceStrength(approved).strength > scoreEvidenceStrength(rejected).strength);
});

test('evidenceClaimId carried in the strength result', () => {
  assert.equal(scoreEvidenceStrength(claim()).evidenceClaimId, 'e');
});
