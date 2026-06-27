import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  stageFor,
  emptyBetaLaunchOps,
  emptyBetaOperations,
  degradedBetaLaunch,
} from './status';

// ---- stageFor: launch-stage mapping ----------------------------------------

test('stageFor maps user counts to the four launch stages', () => {
  assert.equal(stageFor(0).current, 1);
  assert.equal(stageFor(10).current, 1);
  assert.equal(stageFor(11).current, 2);
  assert.equal(stageFor(25).current, 2);
  assert.equal(stageFor(26).current, 3);
  assert.equal(stageFor(100).current, 3);
  assert.equal(stageFor(101).current, 4);
  assert.equal(stageFor(5000).current, 4);
});

test('stageFor labels/ranges/milestones are populated', () => {
  for (const n of [0, 15, 50, 250]) {
    const s = stageFor(n);
    assert.ok(s.label.length > 0);
    assert.ok(s.range.length > 0);
    assert.ok(s.nextMilestone.length > 0);
  }
});

// ---- empty operational layer -----------------------------------------------

test('emptyBetaLaunchOps is fully-shaped and zeroed', () => {
  const o = emptyBetaLaunchOps();
  assert.deepEqual(o.cohorts, []);
  assert.deepEqual(o.invites.recent, []);
  assert.deepEqual(o.invites.events, []);
  assert.equal(o.invites.summary.sent, 0);
  assert.equal(o.invites.summary.accepted, 0);
  assert.deepEqual(o.feedback.recent, []);
  assert.equal(o.feedback.summary.total, 0);
  assert.deepEqual(o.onboarding, []);
});

// ---- empty beta-operations read model --------------------------------------

test('emptyBetaOperations exposes every nested section the panels read', () => {
  const b = emptyBetaOperations();
  // overview (page reads totalUsers; ProgramOverview reads role counts)
  assert.equal(b.overview.totalUsers, 0);
  assert.deepEqual(b.overview.roleDistribution, []);
  // health (BetaHealthDashboard reads trends arrays)
  assert.deepEqual(b.health.trendSignals, []);
  assert.deepEqual(b.health.trendPublications, []);
  // engagement (page reads participationRate)
  assert.equal(b.engagement.participationRate, 0);
  // workload / adoption / risks / feedback / summary all present
  assert.equal(b.workload.queuePressure, 'Low');
  assert.deepEqual(b.adoption.mostActiveCategories, []);
  assert.deepEqual(b.risks, []);
  assert.equal(b.feedback.available, false);
  assert.equal(b.summary.readinessTone, 'red');
});

// ---- degraded fallback ------------------------------------------------------

test('degradedBetaLaunch returns an unavailable, renderable shape with an operator reason', () => {
  const d = degradedBetaLaunch('admin');
  assert.equal(d.available, false);
  assert.ok(d.statusReason && d.statusReason.length > 0);
  // composed pieces are present and safe
  assert.equal(d.beta.overview.totalUsers, 0);
  assert.equal(d.release.available, false); // degraded release readiness
  assert.equal(d.release.score, 0);
  assert.deepEqual(d.ops.cohorts, []);
  assert.equal(d.stage.current, 1); // stageFor(0)
});

test('degradedBetaLaunch passes through a custom operator reason', () => {
  const d = degradedBetaLaunch(null, 'beta_cohorts read failed');
  assert.equal(d.statusReason, 'beta_cohorts read failed');
  assert.equal(d.available, false);
});
