import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeTeamWorkload,
  computeWorkload,
  detectOpsAlerts,
  forecastCapacity,
  isOpen,
  isOverdue,
} from '../src/workload';
import { DEMO_CASES, DEMO_TEAM_MEMBERS, FIXTURE_NOW } from '../src/fixtures';
import type { CaseRecord } from '../src/types';

const NOW = FIXTURE_NOW;

function c(o: Partial<CaseRecord> = {}): CaseRecord {
  return { id: 'c', title: 't', state: 'RESEARCH', team: 'research', assignee: 'a', escalation: 'LOW', createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z', ...o };
}

test('isOpen false for terminal/closed', () => {
  assert.equal(isOpen(c({ state: 'ARCHIVED' })), false);
  assert.equal(isOpen(c({ closedAt: NOW })), false);
  assert.equal(isOpen(c({ state: 'RESEARCH' })), true);
});

test('isOverdue when past due + open', () => {
  assert.equal(isOverdue(c({ dueAt: '2026-06-01T00:00:00.000Z' }), NOW), true);
  assert.equal(isOverdue(c({ dueAt: '2026-12-01T00:00:00.000Z' }), NOW), false);
  assert.equal(isOverdue(c({ dueAt: '2026-06-01T00:00:00.000Z', state: 'ARCHIVED' }), NOW), false);
  assert.equal(isOverdue(c({ dueAt: null }), NOW), false);
});

test('computeWorkload rolls up per assignee', () => {
  const rows = computeWorkload([c({ assignee: 'alice', state: 'RESEARCH' }), c({ assignee: 'alice', state: 'REVIEW' }), c({ assignee: 'bob' })], NOW);
  const alice = rows.find((r) => r.assignee === 'alice');
  assert.equal(alice?.assigned, 2);
  assert.equal(alice?.open, 2);
  assert.ok(alice?.byState.RESEARCH === 1 && alice?.byState.REVIEW === 1);
});

test('computeWorkload counts overdue + escalated', () => {
  const rows = computeWorkload([c({ assignee: 'alice', dueAt: '2026-06-01T00:00:00.000Z', escalation: 'HIGH' })], NOW);
  assert.equal(rows[0].overdue, 1);
  assert.equal(rows[0].escalated, 1);
});

test('computeWorkload ignores unassigned', () => {
  const rows = computeWorkload([c({ assignee: null })], NOW);
  assert.equal(rows.length, 0);
});

test('computeTeamWorkload includes empty teams with members', () => {
  const rows = computeTeamWorkload([], { research: 3 }, NOW);
  const research = rows.find((r) => r.team === 'research');
  assert.equal(research?.members, 3);
  assert.equal(research?.open, 0);
  assert.equal(research?.status, 'healthy');
});

test('team with members=0 but open cases → overloaded', () => {
  const rows = computeTeamWorkload([c({ team: 'curation', assignee: 'x' })], { curation: 0 }, NOW);
  const cur = rows.find((r) => r.team === 'curation');
  assert.equal(cur?.status, 'overloaded');
});

test('loadPerMember + busy/overloaded thresholds', () => {
  const many = Array.from({ length: 10 }, (_, i) => c({ id: `c${i}`, team: 'review', assignee: `u${i}` }));
  const rows = computeTeamWorkload(many, { review: 2 }, NOW);
  const rev = rows.find((r) => r.team === 'review');
  assert.equal(rev?.loadPerMember, 5);
  assert.equal(rev?.status, 'busy');
});

test('forecastCapacity: shrinking backlog clears', () => {
  const f = forecastCapacity({ team: 'research', members: 4, openCases: 10, throughputPerMemberPerWeek: 3, inflowPerWeek: 4 });
  assert.equal(f.weeklyCapacity, 12);
  assert.equal(f.netPerWeek, -8);
  assert.equal(f.trend, 'shrinking');
  assert.ok(f.weeksToClear !== null && f.weeksToClear > 0);
  assert.equal(f.staffingGap, 0);
});

test('forecastCapacity: growing backlog → staffing gap, no clear', () => {
  const f = forecastCapacity({ team: 'review', members: 1, openCases: 20, throughputPerMemberPerWeek: 2, inflowPerWeek: 8 });
  assert.equal(f.trend, 'growing');
  assert.equal(f.weeksToClear, null);
  assert.ok(f.staffingGap >= 1);
  assert.ok(f.projectedBacklog > 20);
});

test('forecastCapacity: balanced → stable', () => {
  const f = forecastCapacity({ team: 'curation', members: 2, openCases: 5, throughputPerMemberPerWeek: 2, inflowPerWeek: 4 });
  assert.equal(f.netPerWeek, 0);
  assert.equal(f.trend, 'stable');
});

test('forecastCapacity is advisory (carries limitations)', () => {
  const f = forecastCapacity({ team: 'research', members: 1, openCases: 1, throughputPerMemberPerWeek: 1, inflowPerWeek: 1 });
  assert.ok(f.limitations.some((l) => /advisory/i.test(l)));
  assert.ok(f.limitations.some((l) => /never auto-assign/i.test(l)));
});

test('detectOpsAlerts flags overdue + critical escalation, all advisory', () => {
  const tw = computeTeamWorkload(DEMO_CASES, DEMO_TEAM_MEMBERS, NOW);
  const alerts = detectOpsAlerts(DEMO_CASES, tw, NOW);
  assert.ok(alerts.length > 0);
  assert.ok(alerts.every((a) => a.advisory === true));
  assert.ok(alerts.some((a) => a.kind === 'investigation_overdue' || a.kind === 'review_overdue'));
  assert.ok(alerts.some((a) => a.kind === 'escalation_pending' && a.severity === 'critical'));
});

test('alerts sorted critical-first', () => {
  const tw = computeTeamWorkload(DEMO_CASES, DEMO_TEAM_MEMBERS, NOW);
  const alerts = detectOpsAlerts(DEMO_CASES, tw, NOW);
  const sevRank = { critical: 0, warning: 1, info: 2 } as const;
  for (let i = 1; i < alerts.length; i++) {
    assert.ok(sevRank[alerts[i - 1].severity] <= sevRank[alerts[i].severity]);
  }
});

test('no alerts for a clean, on-time case set', () => {
  const clean = [c({ id: 'x', state: 'RESEARCH', assignee: 'a', dueAt: '2026-12-01T00:00:00.000Z', escalation: 'LOW' })];
  const tw = computeTeamWorkload(clean, { research: 3 }, NOW);
  assert.equal(detectOpsAlerts(clean, tw, NOW).length, 0);
});

test('deterministic', () => {
  assert.deepEqual(computeWorkload(DEMO_CASES, NOW), computeWorkload(DEMO_CASES, NOW));
});
