import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  agentLabel,
  canCurate,
  canResearch,
  demoEscalations,
  demoOperationsDashboard,
  demoOperationsHighlights,
  demoOpportunities,
  demoPlatformHealth,
  demoResearchRunReplay,
  demoResearchRuns,
  engineLabel,
  formatPct,
  formatProgress,
  formatRuntime,
  formatTrust,
  healthDecor,
  isActiveState,
  priorityDecor,
  readStringArray,
  runStateDecor,
  severityDecor,
  taskStateDecor,
} from './view';

// ---- role gating ------------------------------------------------------------
test('canResearch true for researcher+', () => {
  assert.equal(canResearch('researcher'), true);
  assert.equal(canResearch('curator'), true);
  assert.equal(canResearch('viewer'), false);
  assert.equal(canResearch(null), false);
});

test('canCurate true for curator+', () => {
  assert.equal(canCurate('curator'), true);
  assert.equal(canCurate('admin'), true);
  assert.equal(canCurate('researcher'), false);
});

// ---- decorators -------------------------------------------------------------
test('runStateDecor labels states', () => {
  assert.equal(runStateDecor('COMPLETE').tone, 'green');
  assert.equal(runStateDecor('FAILED').tone, 'red');
  assert.equal(runStateDecor(null).label, 'Unknown');
});

test('isActiveState identifies working states', () => {
  assert.equal(isActiveState('EVIDENCING'), true);
  assert.equal(isActiveState('COMPLETE'), false);
  assert.equal(isActiveState('FAILED'), false);
  assert.equal(isActiveState('CREATED'), false);
});

test('priorityDecor labels', () => {
  assert.equal(priorityDecor('CRITICAL').label, 'Critical');
  assert.equal(priorityDecor('LOW').tone, 'neutral');
});

test('healthDecor labels', () => {
  assert.equal(healthDecor('HEALTHY').tone, 'green');
  assert.equal(healthDecor('DEGRADED').tone, 'orange');
  assert.equal(healthDecor('DOWN').tone, 'red');
});

test('severityDecor labels', () => {
  assert.equal(severityDecor('CRITICAL').tone, 'red');
  assert.equal(severityDecor('INFO').tone, 'blue');
});

test('taskStateDecor labels', () => {
  assert.equal(taskStateDecor('completed').tone, 'green');
  assert.equal(taskStateDecor('blocked').tone, 'orange');
});

test('agentLabel + engineLabel', () => {
  assert.equal(agentLabel('trust'), 'Trust');
  assert.equal(engineLabel('governance'), 'Governance Engine');
});

// ---- formatters -------------------------------------------------------------
test('formatPct', () => {
  assert.equal(formatPct(0.5), '50%');
  assert.equal(formatPct(null), '—');
  assert.equal(formatPct(2), '100%');
});

test('formatProgress', () => {
  assert.equal(formatProgress(0.73), '73%');
  assert.equal(formatProgress(null), '0%');
});

test('formatRuntime', () => {
  assert.equal(formatRuntime(500), '500ms');
  assert.equal(formatRuntime(1500), '1.5s');
  assert.equal(formatRuntime(120000), '2.0m');
});

test('formatTrust', () => {
  assert.equal(formatTrust(73.4), '73');
  assert.equal(formatTrust(null), '—');
});

test('readStringArray handles shapes', () => {
  assert.deepEqual(readStringArray({ items: ['a', 'b'] }), ['a', 'b']);
  assert.deepEqual(readStringArray(['x']), ['x']);
  assert.deepEqual(readStringArray('s'), ['s']);
  assert.deepEqual(readStringArray(null), []);
});

// ---- demo builders ----------------------------------------------------------
test('demoOperationsDashboard has all widgets', () => {
  const d = demoOperationsDashboard();
  assert.ok(d.health.length === 10);
  assert.ok(d.agentPerformance.length === 8);
  assert.ok(d.opportunities.length > 0);
  assert.ok(d.escalations.length > 0);
  assert.ok(['HEALTHY', 'DEGRADED', 'DOWN'].includes(d.overallStatus));
});

test('demoOperationsDashboard runsByState sums to total runs', () => {
  const d = demoOperationsDashboard();
  const total = Object.values(d.runsByState).reduce((a, n) => a + n, 0);
  assert.equal(total, 7);
});

test('demoResearchRuns lists runs + byState', () => {
  const d = demoResearchRuns();
  assert.ok(d.runs.length > 0);
  assert.ok(Object.keys(d.byState).length > 0);
});

test('demoResearchRunReplay has an event timeline', () => {
  const d = demoResearchRunReplay('r1');
  assert.equal(d.run.id, 'r1');
  assert.ok(d.events.length > 0);
  assert.ok(d.progress >= 0 && d.progress <= 1);
});

test('demoPlatformHealth has ten engines', () => {
  const d = demoPlatformHealth();
  assert.equal(d.health.length, 10);
  assert.equal(d.agentPerformance.length, 8);
});

test('demoOpportunities all proposed', () => {
  const d = demoOpportunities();
  assert.ok(d.opportunities.every((o) => o.status === 'proposed'));
  assert.equal(d.proposedCount, d.opportunities.length);
});

test('demoEscalations bySeverity sums to count', () => {
  const d = demoEscalations();
  const total = Object.values(d.bySeverity).reduce((a, n) => a + n, 0);
  assert.equal(total, d.escalations.length);
});

test('demo builders are deterministic', () => {
  assert.deepEqual(demoOperationsDashboard(), demoOperationsDashboard());
  assert.deepEqual(demoResearchRunReplay('x'), demoResearchRunReplay('x'));
});

test('demo run replay agents are the demo tasks', () => {
  const d = demoResearchRunReplay();
  assert.ok(d.tasks.length > 0);
  assert.ok(d.assignments.length === d.tasks.length);
});

test('demoOperationsHighlights summarises the dashboard', () => {
  const h = demoOperationsHighlights();
  const d = demoOperationsDashboard();
  assert.equal(h.queueDepth, d.queueDepth);
  assert.equal(h.openEscalations, d.escalations.length);
  assert.equal(h.proposedOpportunities, d.opportunities.length);
  assert.ok(['HEALTHY', 'DEGRADED', 'DOWN'].includes(h.overallStatus ?? ''));
});

test('demoOperationsHighlights is deterministic', () => {
  assert.deepEqual(demoOperationsHighlights(), demoOperationsHighlights());
});

test('demoOperationsHighlights active runs count is non-negative', () => {
  assert.ok((demoOperationsHighlights().activeRuns ?? 0) >= 0);
});
