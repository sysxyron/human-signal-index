import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ROLES, ROLE_TASKS, ROLE_SUMMARY, ROLE_LABEL, isRole, summaryForRole, tasksForRole } from './role-tasks';

test('every role has tasks + a summary + a label', () => {
  for (const r of ROLES) {
    assert.ok(ROLE_TASKS[r].length >= 3, `${r} tasks`);
    assert.ok(ROLE_SUMMARY[r].length > 20, `${r} summary`);
    assert.ok(ROLE_LABEL[r].length > 0, `${r} label`);
  }
});

test('isRole guards correctly', () => {
  assert.equal(isRole('admin'), true);
  assert.equal(isRole('wizard'), false);
  assert.equal(isRole(null), false);
});

test('tasksForRole / summaryForRole default to viewer for unknown', () => {
  assert.deepEqual(tasksForRole('wizard'), ROLE_TASKS.viewer);
  assert.equal(summaryForRole(null), ROLE_SUMMARY.viewer);
});

test('every task points at a real /dashboard route', () => {
  for (const r of ROLES) {
    for (const t of ROLE_TASKS[r]) {
      assert.ok(t.href.startsWith('/dashboard'), `${r} task href ${t.href}`);
      assert.ok(t.label.trim().length > 0, `${r} task label`);
    }
  }
});

test('viewer tasks only target viewer-safe routes (read / feedback / onboarding)', () => {
  const allowed = ['/dashboard/public-reports', '/dashboard/traceability-engine', '/dashboard/trust', '/dashboard/launch/issues', '/dashboard/tester-onboarding', '/dashboard/forecasts', '/dashboard/profile'];
  for (const t of ROLE_TASKS.viewer) assert.ok(allowed.includes(t.href), `viewer task ${t.href} should be viewer-safe`);
});

test('admin tasks include invite + approve + access logs', () => {
  const labels = ROLE_TASKS.admin.map((t) => t.label.toLowerCase()).join(' | ');
  assert.match(labels, /invite/);
  assert.match(labels, /approve/);
  assert.match(labels, /access logs/);
});

test('summaries explain what the role cannot do', () => {
  assert.match(ROLE_SUMMARY.viewer, /cannot/i);
  assert.match(ROLE_SUMMARY.reviewer, /cannot/i);
});
