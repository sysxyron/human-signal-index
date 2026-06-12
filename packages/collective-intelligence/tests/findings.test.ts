import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  attachEvidence,
  calculateDiscussionMetrics,
  endorseFinding,
  resolveChallenge,
  submitAlternativeNarrative,
  submitChallenge,
  submitFinding,
  withdrawEndorsement,
} from '../src/findings';
import { FIXTURE_NOW } from '../src/fixtures';
import type { Endorsement, Finding } from '../src/types';

const NOW = FIXTURE_NOW;

function finding(): Finding {
  return submitFinding({ id: 'f1', investigationId: 'i', contributorId: 'c', position: 'P', summary: 's', confidence: 0.7, evidenceRefs: ['e1'] }, { now: NOW });
}

test('submitFinding attributes + clamps confidence', () => {
  const f = submitFinding({ id: 'f', investigationId: 'i', contributorId: 'c', position: 'P', summary: 's', confidence: 2 }, { now: NOW });
  assert.equal(f.confidence, 1);
  assert.equal(f.contributorId, 'c');
  assert.equal(f.endorsements, 0);
});

test('submitChallenge starts open', () => {
  const c = submitChallenge({ id: 'c', investigationId: 'i', targetFindingId: 'f1', contributorId: 'x', reason: 'r' }, { now: NOW });
  assert.equal(c.status, 'open');
});

test('resolveChallenge records who + when', () => {
  const c = submitChallenge({ id: 'c', investigationId: 'i', targetFindingId: 'f1', contributorId: 'x', reason: 'r' }, { now: NOW });
  const r = resolveChallenge(c, 'upheld', { now: NOW, resolvedBy: 'judge' });
  assert.equal(r.status, 'upheld');
  assert.equal(r.resolvedBy, 'judge');
  assert.equal(r.resolvedAt, NOW);
});

test('submitAlternativeNarrative carries a position', () => {
  const a = submitAlternativeNarrative({ id: 'a', investigationId: 'i', contributorId: 'c', title: 't', summary: 's', position: 'Alt' }, { now: NOW });
  assert.equal(a.position, 'Alt');
});

test('attachEvidence appends without duplicating', () => {
  let f = finding();
  f = attachEvidence(f, 'e2', { now: NOW });
  assert.deepEqual(f.evidenceRefs, ['e1', 'e2']);
  f = attachEvidence(f, 'e2', { now: NOW });
  assert.deepEqual(f.evidenceRefs, ['e1', 'e2']);
});

test('endorseFinding increments + is idempotent per contributor', () => {
  let f = finding();
  let endorsements: Endorsement[] = [];
  const e1 = endorseFinding(f, endorsements, 'x', 'en1', { now: NOW });
  f = e1.finding; endorsements = e1.endorsements;
  assert.equal(f.endorsements, 1);
  const e2 = endorseFinding(f, endorsements, 'x', 'en2', { now: NOW });
  f = e2.finding; endorsements = e2.endorsements;
  assert.equal(f.endorsements, 1); // same contributor, no double count.
});

test('two contributors → two endorsements', () => {
  let f = finding();
  let endorsements: Endorsement[] = [];
  let r = endorseFinding(f, endorsements, 'x', 'en1', { now: NOW });
  f = r.finding; endorsements = r.endorsements;
  r = endorseFinding(f, endorsements, 'y', 'en2', { now: NOW });
  f = r.finding; endorsements = r.endorsements;
  assert.equal(f.endorsements, 2);
});

test('withdrawEndorsement decrements + flags (never deletes)', () => {
  let f = finding();
  let endorsements: Endorsement[] = [];
  let r = endorseFinding(f, endorsements, 'x', 'en1', { now: NOW });
  f = r.finding; endorsements = r.endorsements;
  const w = withdrawEndorsement(f, endorsements, 'x', { now: NOW });
  f = w.finding; endorsements = w.endorsements;
  assert.equal(f.endorsements, 0);
  assert.equal(endorsements.length, 1); // record kept.
  assert.equal(endorsements[0].withdrawn, true);
});

test('re-endorse after withdraw reactivates', () => {
  let f = finding();
  let endorsements: Endorsement[] = [];
  let r = endorseFinding(f, endorsements, 'x', 'en1', { now: NOW });
  f = r.finding; endorsements = r.endorsements;
  const w = withdrawEndorsement(f, endorsements, 'x', { now: NOW });
  f = w.finding; endorsements = w.endorsements;
  const re = endorseFinding(f, endorsements, 'x', 'en2', { now: NOW });
  f = re.finding; endorsements = re.endorsements;
  assert.equal(f.endorsements, 1);
  assert.equal(endorsements.length, 1); // reused the prior record.
});

test('calculateDiscussionMetrics summarises', () => {
  const findings = [finding(), submitFinding({ id: 'f2', investigationId: 'i', contributorId: 'd', position: 'Q', summary: 's' }, { now: NOW })];
  const challenges = [submitChallenge({ id: 'c1', investigationId: 'i', targetFindingId: 'f1', contributorId: 'e', reason: 'r' }, { now: NOW })];
  const alternatives = [submitAlternativeNarrative({ id: 'a1', investigationId: 'i', contributorId: 'f', title: 't', summary: 's', position: 'Alt' }, { now: NOW })];
  const m = calculateDiscussionMetrics({ findings, challenges, alternatives, endorsements: [] });
  assert.equal(m.findingCount, 2);
  assert.equal(m.challengeCount, 1);
  assert.equal(m.openChallengeCount, 1);
  assert.equal(m.alternativeCount, 1);
  assert.ok(m.contributorCount >= 4);
  assert.ok(m.contentiousness > 0 && m.contentiousness <= 1);
  assert.ok(m.activityScore >= 0 && m.activityScore <= 1);
});

test('metrics: zero findings → zero contentiousness', () => {
  const m = calculateDiscussionMetrics({ findings: [], challenges: [], alternatives: [], endorsements: [] });
  assert.equal(m.contentiousness, 0);
  assert.equal(m.findingCount, 0);
});

test('withdrawn endorsements excluded from metrics count', () => {
  let f = finding();
  let endorsements: Endorsement[] = [];
  let r = endorseFinding(f, endorsements, 'x', 'en1', { now: NOW });
  endorsements = r.endorsements; f = r.finding;
  const w = withdrawEndorsement(f, endorsements, 'x', { now: NOW });
  endorsements = w.endorsements;
  const m = calculateDiscussionMetrics({ findings: [f], challenges: [], alternatives: [], endorsements });
  assert.equal(m.endorsementCount, 0);
});

test('deterministic finding submission', () => {
  assert.deepEqual(finding(), finding());
});
