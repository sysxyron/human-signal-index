import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  challengeEvidence,
  createEvidenceClaim,
  reviewEvidence,
  scoreEvidenceStrength,
  supportEvidence,
} from '../src/evidence';
import {
  computeContributionQuality,
  computeContributorAccuracy,
  computeContributorScore,
  computeContributorTrust,
  computeReviewReliability,
} from '../src/reputation';
import { FIXTURE_NOW } from '../src/fixtures';
import type { ContributorInput, EvidenceClaim } from '../src/types';

const NOW = FIXTURE_NOW;

function claim(): EvidenceClaim {
  return createEvidenceClaim({ id: 'e', investigationId: 'i', contributorId: 'c', claim: 'x', sourceRef: 'src', sourceQuality: 0.8 }, { now: NOW });
}

// ---- evidence ---------------------------------------------------------------

test('createEvidenceClaim clamps source quality', () => {
  const c = createEvidenceClaim({ id: 'e', investigationId: 'i', contributorId: 'c', claim: 'x', sourceRef: 's', sourceQuality: 2 }, { now: NOW });
  assert.equal(c.sourceQuality, 1);
});

test('supportEvidence + challengeEvidence adjust tallies', () => {
  let c = claim();
  c = supportEvidence(c, { now: NOW });
  c = supportEvidence(c, { now: NOW });
  c = challengeEvidence(c, { now: NOW });
  assert.equal(c.supportCount, 2);
  assert.equal(c.challengeCount, 1);
});

test('reviewEvidence records the decision + a review', () => {
  const r = reviewEvidence(claim(), { id: 'r', reviewerId: 'rev', decision: 'approved', reason: 'ok' }, { now: NOW });
  assert.equal(r.claim.reviewsApproved, 1);
  assert.equal(r.review.decision, 'approved');
});

test('evidence strength is explainable + in [0,1]', () => {
  const s = scoreEvidenceStrength(claim());
  assert.ok(s.strength >= 0 && s.strength <= 1);
  assert.ok(s.explanation.length > 0);
  assert.ok(s.limitations.length > 0);
});

test('more support raises strength; more challenges lower it', () => {
  let supported = claim();
  supported = supportEvidence(supported, { now: NOW });
  supported = supportEvidence(supported, { now: NOW });
  let challenged = claim();
  challenged = challengeEvidence(challenged, { now: NOW });
  challenged = challengeEvidence(challenged, { now: NOW });
  assert.ok(scoreEvidenceStrength(supported).strength > scoreEvidenceStrength(challenged).strength);
});

test('approved reviews raise strength', () => {
  const approved = reviewEvidence(claim(), { id: 'r', reviewerId: 'x', decision: 'approved', reason: 'ok' }, { now: NOW }).claim;
  const rejected = reviewEvidence(claim(), { id: 'r', reviewerId: 'x', decision: 'rejected', reason: 'no' }, { now: NOW }).claim;
  assert.ok(scoreEvidenceStrength(approved).strength > scoreEvidenceStrength(rejected).strength);
});

test('no debate yet → neutral limitations', () => {
  const s = scoreEvidenceStrength(claim());
  assert.ok(s.limitations.some((l) => /No support or challenges/.test(l)));
  assert.ok(s.limitations.some((l) => /No reviews/.test(l)));
});

// ---- reputation -------------------------------------------------------------

function input(overrides: Partial<ContributorInput> = {}): ContributorInput {
  return { contributorId: 'c', findingsAligned: 8, findingsMisaligned: 2, reviewsConfirmed: 4, reviewsOverturned: 1, evidenceQuality: 0.8, baseTrust: 80, contributionCount: 12, ...overrides };
}

test('accuracy is consensus alignment', () => {
  assert.ok(computeContributorAccuracy(input()) > 0.5);
});

test('accuracy neutral with no findings', () => {
  assert.equal(computeContributorAccuracy({ contributorId: 'c' }), 0.5);
});

test('review reliability reflects confirmed vs overturned', () => {
  assert.ok(computeReviewReliability(input()) > 0.5);
  assert.ok(computeReviewReliability(input({ reviewsConfirmed: 0, reviewsOverturned: 5 })) < 0.5);
});

test('contribution quality blends challenge accuracy + evidence quality', () => {
  const q = computeContributionQuality(input({ challengesUpheld: 4, challengesRejected: 0 }));
  assert.ok(q > 0.5);
});

test('contributor trust in [0,100]', () => {
  const t = computeContributorTrust(input());
  assert.ok(t >= 0 && t <= 100);
});

test('thin sample pulls trust toward neutral', () => {
  const big = computeContributorTrust(input({ contributionCount: 12 }));
  const small = computeContributorTrust(input({ contributionCount: 1 }));
  assert.ok(Math.abs(small - 50) < Math.abs(big - 50));
});

test('contributor score is explainable', () => {
  const s = computeContributorScore(input());
  assert.ok(s.explanation.length >= 3);
  assert.ok(s.limitations.length >= 1);
  assert.ok(s.overall >= 0 && s.overall <= 100);
});

test('score exposes all five components', () => {
  const s = computeContributorScore(input());
  for (const k of ['accuracy', 'trust', 'reviewQuality', 'consensusAlignment', 'evidenceQuality'] as const) {
    assert.ok(typeof s[k] === 'number');
  }
});

test('missing evidence quality adds a limitation', () => {
  const s = computeContributorScore(input({ evidenceQuality: undefined }));
  assert.ok(s.limitations.some((l) => /evidence-quality/.test(l)));
});

test('thin sample adds a floor limitation', () => {
  const s = computeContributorScore(input({ contributionCount: 2 }));
  assert.ok(s.limitations.some((l) => /floor/.test(l)));
});

test('deterministic scoring', () => {
  assert.deepEqual(computeContributorScore(input()), computeContributorScore(input()));
});
