// =============================================================================
// HSI Phase 24 — Human Operations client-safe view helpers.
//
// PURE + CLIENT-SAFE: NO server-only imports. Status → color/label and labeled
// demo builders (from @hsi/operations-engine fixtures) so every operations page
// renders fully offline when an action returns NOT_CONFIGURED.
// =============================================================================

import {
  computeWorkload,
  computeTeamWorkload,
  detectOpsAlerts,
  forecastCapacity,
  isOpen,
  isOverdue,
  DEMO_CASES,
  DEMO_TEAM_MEMBERS,
  FIXTURE_NOW,
  operationsDemo,
} from '@hsi/operations-engine';
import { computePerformance } from '@hsi/performance-engine';
import type {
  ContributorOpsData,
  ExecutiveOperationsData,
  MyWorkData,
  OperationsAlertsData,
  OperationsCenterData,
  OperationsHighlights,
  OpsCaseView,
  TeamsData,
  WorkloadsData,
} from '@hsi/shared-types';

const NOW = FIXTURE_NOW;

export type OpsStatus = 'healthy' | 'busy' | 'overloaded';
const STATUS_COLOR: Record<string, string> = { healthy: '#10B981', busy: '#F59E0B', overloaded: '#EF4444' };
export function opsStatusColor(s?: string | null): string { return STATUS_COLOR[s ?? ''] ?? '#94A3B8'; }

const ESC_COLOR: Record<string, string> = { LOW: '#94A3B8', MEDIUM: '#3B82F6', HIGH: '#F59E0B', CRITICAL: '#EF4444' };
export function escalationColor(level?: string | null): string { return ESC_COLOR[level ?? ''] ?? '#94A3B8'; }

const SEV_COLOR: Record<string, string> = { info: '#3B82F6', warning: '#F59E0B', critical: '#EF4444' };
export function alertSeverityColor(s?: string | null): string { return SEV_COLOR[s ?? ''] ?? '#94A3B8'; }

export function formatDuration(ms?: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const h = ms / 3_600_000;
  if (h < 24) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}
export function titleize(v: string): string {
  return v.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/* role gating */
const ROLE_RANK: Record<string, number> = { viewer: 0, researcher: 2, reviewer: 3, curator: 4, admin: 5 };
export function canOperate(role?: string | null): boolean {
  return role ? (ROLE_RANK[role.toLowerCase()] ?? -1) >= ROLE_RANK.reviewer : false;
}
export function canResearch(role?: string | null): boolean {
  return role ? (ROLE_RANK[role.toLowerCase()] ?? -1) >= ROLE_RANK.researcher : false;
}

/* -------------------------------------------------------------------------- */
/* DEMO builders (from the operations-engine fixtures)                         */
/* -------------------------------------------------------------------------- */

function caseView(c: typeof DEMO_CASES[number]): OpsCaseView {
  return {
    id: c.id, title: c.title, state: c.state, team: c.team, assignee: c.assignee,
    escalation: c.escalation, dueAt: c.dueAt ?? null,
    overdue: isOverdue(c, NOW), open: isOpen(c),
  };
}

export function demoWorkloads(): WorkloadsData {
  const byAssignee = computeWorkload(DEMO_CASES, NOW).map((r) => ({ assignee: r.assignee, assigned: r.assigned, open: r.open, overdue: r.overdue, escalated: r.escalated }));
  const byTeam = computeTeamWorkload(DEMO_CASES, DEMO_TEAM_MEMBERS, NOW).map((t) => ({ team: t.team, members: t.members, open: t.open, overdue: t.overdue, escalated: t.escalated, loadPerMember: Number.isFinite(t.loadPerMember) ? t.loadPerMember : 99, status: t.status }));
  const open = DEMO_CASES.filter(isOpen).length;
  const overdue = DEMO_CASES.filter((c) => isOverdue(c, NOW)).length;
  const escalated = DEMO_CASES.filter((c) => c.escalation && c.escalation !== 'LOW' && isOpen(c)).length;
  const reviewBacklog = DEMO_CASES.filter((c) => c.state === 'REVIEW' && isOpen(c)).length;
  const publicationBacklog = DEMO_CASES.filter((c) => c.state === 'PUBLICATION_REVIEW' && isOpen(c)).length;
  return { byAssignee, byTeam, totals: { open, overdue, escalated, reviewBacklog, publicationBacklog } };
}

export function demoMyWork(me = 'alice'): MyWorkData {
  const mine = DEMO_CASES.filter((c) => c.assignee === me).map(caseView);
  return {
    assignedToMe: mine,
    awaitingReview: DEMO_CASES.filter((c) => c.state === 'REVIEW').map(caseView),
    needsEvidence: DEMO_CASES.filter((c) => c.state === 'EVIDENCE_COLLECTION').map(caseView),
    needsApproval: DEMO_CASES.filter((c) => c.state === 'PUBLICATION_REVIEW').map(caseView),
    escalated: DEMO_CASES.filter((c) => c.escalation && c.escalation !== 'LOW' && isOpen(c)).map(caseView),
    completed: DEMO_CASES.filter((c) => !isOpen(c)).map(caseView),
  };
}

export function demoTeams(): TeamsData {
  const tw = computeTeamWorkload(DEMO_CASES, DEMO_TEAM_MEMBERS, NOW);
  const names: Record<string, string> = { research: 'Research', review: 'Review', curation: 'Curation', governance: 'Governance', executive: 'Executive', security: 'Security', publishing: 'Publishing', simulation: 'Simulation' };
  return { teams: tw.map((t) => ({ key: t.team, name: names[t.team] ?? titleize(t.team), members: t.members, open: t.open, overdue: t.overdue, status: t.status })) };
}

export function demoOperationsAlerts(): OperationsAlertsData {
  const tw = computeTeamWorkload(DEMO_CASES, DEMO_TEAM_MEMBERS, NOW);
  const alerts = detectOpsAlerts(DEMO_CASES, tw, NOW).map((a, i) => ({
    id: `demo-${i}`, kind: a.kind, severity: a.severity, title: a.title, detail: a.detail,
    case_id: a.caseId, team: a.team, status: 'open' as const, created_at: NOW,
  }));
  const bySeverity: Record<string, number> = {};
  for (const a of alerts) bySeverity[a.severity] = (bySeverity[a.severity] ?? 0) + 1;
  return { alerts, bySeverity };
}

export function demoOperationsCenter(): OperationsCenterData {
  const workloads = demoWorkloads();
  const alerts = demoOperationsAlerts().alerts;
  const escalations = DEMO_CASES.filter((c) => c.escalation && c.escalation !== 'LOW').map((c) => ({ id: `esc-${c.id}`, case_id: c.id, level: c.escalation ?? 'LOW', reason: 'Demo escalation.', active: true, created_at: NOW }));
  return {
    workloads, alerts, escalations, teamHealth: workloads.byTeam,
    openCases: workloads.totals.open, overdueCases: workloads.totals.overdue, criticalEscalations: DEMO_CASES.filter((c) => c.escalation === 'CRITICAL' && isOpen(c)).length,
  };
}

export function demoExecutiveOperations(): ExecutiveOperationsData {
  const tw = computeTeamWorkload(DEMO_CASES, DEMO_TEAM_MEMBERS, NOW);
  const teamCapacity = tw.map((t) => ({ team: t.team, members: t.members, open: t.open, overdue: t.overdue, escalated: t.escalated, loadPerMember: Number.isFinite(t.loadPerMember) ? t.loadPerMember : 99, status: t.status }));
  const forecastedCapacity = (['research', 'review'] as const).map((team) => {
    const f = forecastCapacity({ team, members: DEMO_TEAM_MEMBERS[team] ?? 1, openCases: 12, throughputPerMemberPerWeek: 2, inflowPerWeek: 8 });
    return { team, weeklyCapacity: f.weeklyCapacity, netPerWeek: f.netPerWeek, trend: f.trend };
  });
  const worst = teamCapacity.some((t) => t.status === 'overloaded') ? 'overloaded' : teamCapacity.some((t) => t.status === 'busy') ? 'busy' : 'healthy';
  return {
    researchBacklog: DEMO_CASES.filter((c) => c.team === 'research' && isOpen(c)).length,
    reviewBacklog: DEMO_CASES.filter((c) => c.state === 'REVIEW' && isOpen(c)).length,
    publicationQueue: DEMO_CASES.filter((c) => c.state === 'PUBLICATION_REVIEW' && isOpen(c)).length,
    criticalEscalations: DEMO_CASES.filter((c) => c.escalation === 'CRITICAL' && isOpen(c)).length,
    openInvestigations: DEMO_CASES.filter(isOpen).length,
    teamCapacity, forecastedCapacity,
    avgResolutionMs: computePerformance([
      { type: 'completed', at: '2026-06-11T00:00:00.000Z', completionMs: 5 * 24 * 3600 * 1000 },
      { type: 'completed', at: '2026-06-12T00:00:00.000Z', completionMs: 7 * 24 * 3600 * 1000 },
    ], { now: NOW }).avgCompletionMs,
    operationalHealth: worst,
  };
}

export function demoContributorOps(): ContributorOpsData {
  return {
    active: 12, trusted: 5,
    contributors: [
      { name: 'alice', completed: 8, reviewed: 3, published: 1 },
      { name: 'bob', completed: 5, reviewed: 9, published: 0 },
      { name: 'carol', completed: 2, reviewed: 4, published: 3 },
    ],
  };
}

export function demoOperationsHighlights(): OperationsHighlights {
  const w = demoWorkloads();
  const a = demoOperationsAlerts();
  return {
    openCases: w.totals.open, overdueCases: w.totals.overdue, criticalEscalations: demoOperationsCenter().criticalEscalations,
    reviewBacklog: w.totals.reviewBacklog, publicationBacklog: w.totals.publicationBacklog, openAlerts: a.alerts.length,
  };
}

export { operationsDemo };
