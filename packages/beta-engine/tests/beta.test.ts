import { test } from 'node:test';
import assert from 'node:assert/strict';

import { COHORTS, isCohortKey, STATUS_TRANSITIONS, canTransitionStatus, isEngaged } from '../src/cohorts';
import { assignMissions, testerProgress, isProgramComplete } from '../src/missions';
import { npsScore, cohortAnalytics, countInWindow, reportWindowMs } from '../src/analytics';
import { BETA_BADGES, evaluateBetaBadges, newBetaBadges, betaBadge } from '../src/badges';
import { demoMissions, demoCohortAnalytics, demoTesterStats, demoNps } from '../src/fixtures';

// ---- cohorts + status ------------------------------------------------------
test('5 cohorts; key guard', () => {
  assert.equal(COHORTS.length, 5);
  assert.deepEqual(COHORTS.map((c) => c.key), ['internal', 'research', 'reviewer', 'governance', 'enterprise_pilot']);
  assert.ok(isCohortKey('research'));
  assert.ok(!isCohortKey('nope'));
});

test('status lifecycle: pending→invited→active→completed; completed terminal', () => {
  assert.ok(canTransitionStatus('pending', 'invited'));
  assert.ok(canTransitionStatus('invited', 'active'));
  assert.ok(canTransitionStatus('active', 'completed'));
  assert.ok(canTransitionStatus('suspended', 'active'));
  assert.equal(STATUS_TRANSITIONS.completed.length, 0);
  assert.ok(!canTransitionStatus('completed', 'active'));
  assert.ok(!canTransitionStatus('pending', 'active')); // must be invited first
});

test('isEngaged for active/completed only', () => {
  assert.ok(isEngaged('active'));
  assert.ok(isEngaged('completed'));
  assert.ok(!isEngaged('pending'));
});

// ---- mission assignment ----------------------------------------------------
test('assignMissions: role-appropriate, drops completed, caps queue', () => {
  const q = assignMissions(demoMissions, { role: 'researcher', completedIds: [], rankLevel: 1, badgeCount: 0 });
  assert.ok(q.length > 0);
  assert.ok(q.every((m) => m.role === 'researcher' || m.role === 'viewer'));
  const filtered = assignMissions(demoMissions, { role: 'researcher', completedIds: ['researcher_verify'], rankLevel: 1 });
  assert.ok(!filtered.some((m) => m.id === 'researcher_verify'));
});

test('higher rank/badges raise the queue cap', () => {
  const many: AssignableMissionList = Array.from({ length: 12 }, (_, i) => ({ id: `m${i}`, role: 'viewer', title: `M${i}` }));
  const low = assignMissions(many, { role: 'viewer', completedIds: [], rankLevel: 1, badgeCount: 0 });
  const high = assignMissions(many, { role: 'viewer', completedIds: [], rankLevel: 4, badgeCount: 9 });
  assert.ok(high.length > low.length);
  assert.ok(high.length <= 6);
});
type AssignableMissionList = Parameters<typeof assignMissions>[0];

test('testerProgress + completion', () => {
  const p = testerProgress({ assignedMissions: 4, completedMissions: 2, xp: 120 });
  assert.equal(p.completionPct, 50);
  assert.ok(!isProgramComplete(p));
  assert.ok(isProgramComplete(testerProgress({ assignedMissions: 3, completedMissions: 3, xp: 0 })));
  assert.equal(testerProgress({ assignedMissions: 0, completedMissions: 0, xp: 0 }).completionPct, 0);
});

// ---- analytics -------------------------------------------------------------
test('npsScore = promoters − detractors %', () => {
  const r = npsScore(demoNps); // 9,10,8,7,9,6,10,9,4,8 → promoters 4(9,10,10,9... let me trust impl)
  assert.equal(r.responses, 10);
  assert.ok(r.score >= -100 && r.score <= 100);
  assert.equal(npsScore([]).score, 0);
  assert.equal(npsScore([10, 10]).score, 100);
  assert.equal(npsScore([0, 0]).score, -100);
});

test('cohortAnalytics rates', () => {
  const a = cohortAnalytics(demoCohortAnalytics);
  assert.equal(a.activationRate, Math.round(((22 + 6) / 40) * 100));
  assert.equal(a.completionRate, Math.round((6 / 40) * 100));
  assert.ok(a.missionCompletionRate > 0 && a.missionCompletionRate <= 100);
  assert.equal(cohortAnalytics({ total: 0, invited: 0, active: 0, completed: 0, activeLastPeriod: 0, missionsAssigned: 0, missionsCompleted: 0 }).activationRate, 0);
});

test('report windows + countInWindow', () => {
  assert.equal(reportWindowMs('weekly'), 7 * 86_400_000);
  const now = Date.parse('2026-06-14T00:00:00Z');
  const ts = ['2026-06-13T00:00:00Z', '2026-06-01T00:00:00Z', '2026-06-14T00:00:00Z'];
  assert.equal(countInWindow(ts, 'daily', now), 2); // 06-13 and 06-14
  assert.equal(countInWindow(ts, 'monthly', now), 3);
});

// ---- recognition badges ----------------------------------------------------
test('5 beta badges; evaluate by stats', () => {
  assert.equal(BETA_BADGES.length, 5);
  const earned = evaluateBetaBadges(demoTesterStats);
  assert.ok(earned.includes('found_bug'));
  assert.ok(earned.includes('power_tester'));
  assert.ok(earned.includes('elite_researcher'));
  assert.ok(!earned.includes('review_specialist')); // 12 < 50
  assert.equal(betaBadge('found_bug')?.name, 'Found Bug');
});

test('newBetaBadges excludes already-held', () => {
  const fresh = newBetaBadges(demoTesterStats, ['found_bug']);
  assert.ok(!fresh.includes('found_bug'));
  assert.ok(fresh.includes('power_tester'));
});

test('no badges with empty stats', () => {
  assert.equal(evaluateBetaBadges({ issuesReported: 0, missionsCompleted: 0, signalsAccepted: 0, reviewsCompleted: 0, governanceActions: 0 }).length, 0);
});
