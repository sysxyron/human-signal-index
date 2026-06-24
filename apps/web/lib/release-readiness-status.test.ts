import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveReleaseStatus,
  degradedReadiness,
  STATUS_POINTS,
  type ChecklistItem,
} from './release-readiness-status';

const item = (status: ChecklistItem['status'], label = 'Check'): ChecklistItem => ({ label, status, detail: 'd' });

// ---- deriveReleaseStatus: status mapping -----------------------------------

test('all checks pass → READY with score 100 and a positive reason', () => {
  const r = deriveReleaseStatus([item('Pass'), item('Pass'), item('Pass')], false);
  assert.equal(r.status, 'READY');
  assert.equal(r.score, 100);
  assert.deepEqual(r.statusReasons, ['All readiness checks pass.']);
});

test('warnings but no fails → MONITORING', () => {
  const r = deriveReleaseStatus([item('Pass'), item('Warning', 'Backlog')], false);
  assert.equal(r.status, 'MONITORING');
  assert.equal(r.statusReasons.length, 1);
  assert.match(r.statusReasons[0], /Backlog: Warning/);
});

test('a single fail (no hard fail) → AT RISK', () => {
  const r = deriveReleaseStatus([item('Pass'), item('Fail', 'Sources')], false);
  assert.equal(r.status, 'AT RISK');
});

test('hard fail forces NOT READY even with one fail', () => {
  const r = deriveReleaseStatus([item('Pass'), item('Fail', 'Platform')], true);
  assert.equal(r.status, 'NOT READY');
});

test('two or more fails → NOT READY', () => {
  const r = deriveReleaseStatus([item('Fail'), item('Fail'), item('Pass')], false);
  assert.equal(r.status, 'NOT READY');
});

test('score is the weighted ratio of checklist points', () => {
  // Pass(2) + Warning(1) + Fail(0) = 3 of a possible 6 → 50.
  const r = deriveReleaseStatus([item('Pass'), item('Warning'), item('Fail')], false);
  assert.equal(r.score, 50);
});

test('empty checklist degrades to NOT READY / score 0 (never READY)', () => {
  const r = deriveReleaseStatus([], false);
  assert.equal(r.status, 'NOT READY');
  assert.equal(r.score, 0);
});

test('STATUS_POINTS weighting is Pass>Warning>Fail', () => {
  assert.ok(STATUS_POINTS.Pass > STATUS_POINTS.Warning);
  assert.ok(STATUS_POINTS.Warning > STATUS_POINTS.Fail);
  assert.equal(STATUS_POINTS.Fail, 0);
});

// ---- degradedReadiness: safe empty fallback --------------------------------

test('degradedReadiness returns an unavailable, fully-empty but renderable shape', () => {
  const r = degradedReadiness('researcher');
  assert.equal(r.available, false);
  assert.equal(r.role, 'researcher');
  assert.equal(r.isAdmin, false);
  assert.equal(r.status, 'NOT READY');
  assert.equal(r.score, 0);
  // Every array field is present and empty so the panels render without crashing.
  assert.deepEqual(r.platformReadiness, []);
  assert.deepEqual(r.systemHealth, []);
  assert.deepEqual(r.betaOps, []);
  assert.deepEqual(r.intelligenceHealth, []);
  assert.deepEqual(r.alertsRisks, []);
  assert.deepEqual(r.trustGovernance, []);
  assert.deepEqual(r.checklist, []);
  assert.deepEqual(r.networkReadiness.rows, []);
  assert.equal(r.networkReadiness.score, 0);
  assert.deepEqual(r.launchBrief.strengths, []);
  assert.deepEqual(r.launchBrief.coverageGaps, []);
  assert.ok(r.statusReasons.length > 0);
});

test('degradedReadiness marks admin role correctly', () => {
  assert.equal(degradedReadiness('admin').isAdmin, true);
  assert.equal(degradedReadiness(null).isAdmin, false);
  assert.equal(degradedReadiness(null).role, null);
});
