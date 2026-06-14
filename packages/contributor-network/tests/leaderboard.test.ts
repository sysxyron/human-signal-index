import { test } from 'node:test';
import assert from 'node:assert/strict';

import { contributorScore, rankContributors, teamScore, rankTeams } from '../src/leaderboard';
import type { ContributorStat, TeamStat } from '../src/types';
import { demoContributors, demoTeams } from '../src/fixtures';

const base: ContributorStat = {
  id: 'x', name: 'X', role: 'researcher', xp: 0, acceptedSignals: 0, rejectedSignals: 0,
  evidencePackages: 0, reviewsCompleted: 0, reportsPrepared: 0, reputation: 50,
};

test('quality beats spam: many rejected signals score ~0', () => {
  const spammer = { ...base, acceptedSignals: 2, rejectedSignals: 200 };
  const quality = { ...base, acceptedSignals: 40, rejectedSignals: 2, reputation: 80 };
  assert.ok(contributorScore(quality) > contributorScore(spammer));
});

test('rejected signals penalise the score', () => {
  const clean = { ...base, acceptedSignals: 20, rejectedSignals: 0 };
  const dirty = { ...base, acceptedSignals: 20, rejectedSignals: 20 };
  assert.ok(contributorScore(clean) > contributorScore(dirty));
});

test('higher reputation raises score for equal work', () => {
  const lo = { ...base, acceptedSignals: 20, reputation: 40 };
  const hi = { ...base, acceptedSignals: 20, reputation: 90 };
  assert.ok(contributorScore(hi) > contributorScore(lo));
});

test('score is never negative', () => {
  assert.equal(contributorScore({ ...base, rejectedSignals: 100 }), 0);
});

test('rankContributors assigns dense ranks and filters by view', () => {
  const rows = rankContributors(demoContributors, 'top_researchers');
  assert.ok(rows.length >= 2);
  assert.equal(rows[0].rank, 1);
  assert.equal(rows[1].rank, 2);
  // scores are descending
  assert.ok(rows[0].score >= rows[1].score);
  // only researchers
  const ids = rows.map((r) => r.id);
  assert.ok(ids.includes('u5')); // Jin (researcher)
  assert.ok(!ids.includes('u2')); // Marco (reviewer)
});

test('top_contributors includes all roles', () => {
  const rows = rankContributors(demoContributors, 'top_contributors');
  assert.equal(rows.length, demoContributors.length);
});

test('ties break deterministically (reputation then id)', () => {
  const a = { ...base, id: 'aaa', acceptedSignals: 10, reputation: 50 };
  const b = { ...base, id: 'bbb', acceptedSignals: 10, reputation: 50 };
  const rows = rankContributors([b, a], 'top_contributors');
  assert.equal(rows[0].id, 'aaa');
});

test('team leaderboard ranks by quality aggregate', () => {
  const rows = rankTeams(demoTeams);
  assert.equal(rows[0].rank, 1);
  assert.ok(rows[0].score >= rows[1].score);
  assert.ok(teamScore(demoTeams[0]) > 0);
});

test('empty input → empty board', () => {
  assert.deepEqual(rankContributors([] as ContributorStat[], 'top_contributors'), []);
  assert.deepEqual(rankTeams([] as TeamStat[]), []);
});
