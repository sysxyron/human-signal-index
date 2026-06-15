import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  AWARD_RULES, ruleFor, resolveAwards, idempotencyKey,
  XP_RANKS, xpRankFor, nextXpRank, DEFAULT_REJECTION_PENALTY,
} from '../src/awards';

test('every event has a rule; rule.event matches its key', () => {
  for (const [k, rule] of Object.entries(AWARD_RULES)) assert.equal(rule.event, k);
  assert.equal(ruleFor('SIGNAL_SUBMITTED')?.lines[0].xp, 'signal_submitted');
});

test('signal submitted awards the actor signal_submitted XP', () => {
  const d = resolveAwards('SIGNAL_SUBMITTED', { actorId: 'u1' });
  assert.ok(d.ok);
  if (d.ok) {
    assert.equal(d.lines.length, 1);
    assert.equal(d.lines[0].recipientId, 'u1');
    assert.equal(d.lines[0].xp, 'signal_submitted');
  }
});

test('signal accepted: author gets signal_accepted, reviewer gets review_completed', () => {
  const d = resolveAwards('SIGNAL_ACCEPTED', { actorId: 'reviewer', subjectId: 'author' });
  assert.ok(d.ok);
  if (d.ok) {
    const byUser = Object.fromEntries(d.lines.map((l) => [l.recipientId, l.xp]));
    assert.equal(byUser.author, 'signal_accepted');
    assert.equal(byUser.reviewer, 'review_completed');
    assert.equal(d.affects, 'accepted');
    assert.equal(d.affectsSubjectId, 'author');
  }
});

// ---- ANTI-GAMING ----------------------------------------------------------
test('self-acceptance is rejected (actor === subject)', () => {
  const d = resolveAwards('SIGNAL_ACCEPTED', { actorId: 'u1', subjectId: 'u1' });
  assert.equal(d.ok, false);
});

test('accept with no subject is rejected (distinct required)', () => {
  const d = resolveAwards('SIGNAL_ACCEPTED', { actorId: 'u1' });
  assert.equal(d.ok, false);
});

test('reject feeds the rejected counter and rewards only the reviewer', () => {
  const d = resolveAwards('SIGNAL_REJECTED', { actorId: 'reviewer', subjectId: 'author' });
  assert.ok(d.ok);
  if (d.ok) {
    assert.equal(d.affects, 'rejected');
    assert.equal(d.lines.length, 1);
    assert.equal(d.lines[0].recipientId, 'reviewer');
  }
});

test('award requires an actor', () => {
  assert.equal(resolveAwards('SIGNAL_SUBMITTED', { actorId: '' }).ok, false);
});

test('events with no lines still resolve ok (audit only)', () => {
  const d = resolveAwards('INVESTIGATION_ACTIVE', { actorId: 'u1' });
  assert.ok(d.ok);
  if (d.ok) assert.equal(d.lines.length, 0);
});

test('report published gives curator XP + credit', () => {
  const d = resolveAwards('REPORT_PUBLISHED', { actorId: 'curator' });
  assert.ok(d.ok);
  if (d.ok) {
    const curator = d.lines.find((l) => l.recipientId === 'curator');
    assert.equal(curator?.xp, 'publication_prepared');
    assert.equal(curator?.credit, 'investigation_approved');
  }
});

// ---- IDEMPOTENCY ----------------------------------------------------------
test('idempotencyKey is deterministic + distinguishes recipient/slot', () => {
  const a = idempotencyKey({ event: 'SIGNAL_ACCEPTED', refKind: 'signal', refId: 's1', recipientId: 'u1', slot: 'xp' });
  const b = idempotencyKey({ event: 'SIGNAL_ACCEPTED', refKind: 'signal', refId: 's1', recipientId: 'u1', slot: 'xp' });
  const c = idempotencyKey({ event: 'SIGNAL_ACCEPTED', refKind: 'signal', refId: 's1', recipientId: 'u2', slot: 'xp' });
  assert.equal(a, b);
  assert.notEqual(a, c);
});

// ---- XP RANK ladder -------------------------------------------------------
test('xp rank ladder ascends Observer → Legend', () => {
  assert.deepEqual(XP_RANKS.map((r) => r.name), ['Observer', 'Analyst', 'Investigator', 'Specialist', 'Expert', 'Master', 'Legend']);
  for (let i = 1; i < XP_RANKS.length; i++) assert.ok(XP_RANKS[i].minXp > XP_RANKS[i - 1].minXp);
});

test('xpRankFor maps totals to ranks', () => {
  assert.equal(xpRankFor(0).name, 'Observer');
  assert.equal(xpRankFor(249).name, 'Observer');
  assert.equal(xpRankFor(250).name, 'Analyst');
  assert.equal(xpRankFor(20000).name, 'Legend');
  assert.equal(xpRankFor(999999).name, 'Legend');
});

test('nextXpRank reports XP to next, null at top', () => {
  const n = nextXpRank(0);
  assert.equal(n?.rank.name, 'Analyst');
  assert.equal(n?.xpToNext, 250);
  assert.equal(nextXpRank(20000), null);
});

test('rejection penalty constant is positive', () => {
  assert.ok(DEFAULT_REJECTION_PENALTY > 0);
});
