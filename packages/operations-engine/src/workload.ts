// =============================================================================
// @hsi/operations-engine — WORKLOAD, CAPACITY & ALERTS.
//
// computeWorkload rolls cases up per assignee; computeTeamWorkload per team;
// forecastCapacity estimates backlog growth + staffing gap (advisory); and
// detectOpsAlerts surfaces overdue/stalled/imbalanced/escalation conditions.
// Everything is advisory — nothing auto-assigns, auto-escalates, or acts. Pure.
// =============================================================================

import { isTerminal } from './lifecycle';
import type {
  CapacityForecast,
  CapacityInput,
  CaseRecord,
  OpsAlert,
  TeamKey,
  TeamWorkload,
  WorkloadRow,
} from './types';

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Is a case open (not in a terminal state)? */
export function isOpen(c: CaseRecord): boolean {
  return !isTerminal(c.state) && c.closedAt == null;
}

/** Is a case overdue at `now`? */
export function isOverdue(c: CaseRecord, now: string): boolean {
  if (!c.dueAt) return false;
  if (!isOpen(c)) return false;
  const due = Date.parse(c.dueAt);
  const t = Date.parse(now);
  return !Number.isNaN(due) && !Number.isNaN(t) && t > due;
}

/** Per-assignee workload across the given cases. */
export function computeWorkload(cases: CaseRecord[], now: string): WorkloadRow[] {
  const rows = new Map<string, WorkloadRow>();
  for (const c of cases) {
    if (!c.assignee) continue;
    const row = rows.get(c.assignee) ?? { assignee: c.assignee, assigned: 0, open: 0, overdue: 0, escalated: 0, byState: {} };
    row.assigned += 1;
    row.byState[c.state] = (row.byState[c.state] ?? 0) + 1;
    if (isOpen(c)) row.open += 1;
    if (isOverdue(c, now)) row.overdue += 1;
    if (c.escalation && c.escalation !== 'LOW') row.escalated += 1;
    rows.set(c.assignee, row);
  }
  return [...rows.values()].sort((a, b) => b.open - a.open || a.assignee.localeCompare(b.assignee));
}

/** Per-team workload. `teamMembers` supplies head-count per team. */
export function computeTeamWorkload(
  cases: CaseRecord[],
  teamMembers: Partial<Record<TeamKey, number>>,
  now: string,
): TeamWorkload[] {
  const teams = new Map<TeamKey, TeamWorkload>();
  for (const c of cases) {
    const t = teams.get(c.team) ?? {
      team: c.team, members: Math.max(0, teamMembers[c.team] ?? 0),
      open: 0, overdue: 0, escalated: 0, loadPerMember: 0, status: 'healthy' as const,
    };
    if (isOpen(c)) t.open += 1;
    if (isOverdue(c, now)) t.overdue += 1;
    if (c.escalation && c.escalation !== 'LOW') t.escalated += 1;
    teams.set(c.team, t);
  }
  // Ensure teams with members but no cases still appear.
  for (const [team, members] of Object.entries(teamMembers) as [TeamKey, number][]) {
    if (!teams.has(team)) teams.set(team, { team, members, open: 0, overdue: 0, escalated: 0, loadPerMember: 0, status: 'healthy' });
  }
  for (const t of teams.values()) {
    t.loadPerMember = t.members > 0 ? round1(t.open / t.members) : t.open > 0 ? Infinity : 0;
    t.status = t.members === 0 && t.open > 0 ? 'overloaded' : t.loadPerMember > 8 ? 'overloaded' : t.loadPerMember > 4 ? 'busy' : 'healthy';
  }
  return [...teams.values()].sort((a, b) => b.open - a.open || a.team.localeCompare(b.team));
}

/** Forecast a team's capacity + backlog trajectory (advisory). */
export function forecastCapacity(input: CapacityInput, opts: { horizonWeeks?: number } = {}): CapacityForecast {
  const horizon = opts.horizonWeeks ?? 4;
  const weeklyCapacity = round1(Math.max(0, input.members) * Math.max(0, input.throughputPerMemberPerWeek));
  const netPerWeek = round1(input.inflowPerWeek - weeklyCapacity);
  const weeksToClear = weeklyCapacity > input.inflowPerWeek && weeklyCapacity > 0
    ? Math.ceil(input.openCases / (weeklyCapacity - input.inflowPerWeek))
    : null;
  const projectedBacklog = Math.max(0, Math.round(input.openCases + netPerWeek * horizon));
  const perMember = input.throughputPerMemberPerWeek > 0 ? input.throughputPerMemberPerWeek : 0;
  const staffingGap = netPerWeek > 0 && perMember > 0 ? Math.ceil(netPerWeek / perMember) : 0;
  const trend: CapacityForecast['trend'] = netPerWeek > 0 ? 'growing' : netPerWeek < 0 ? 'shrinking' : 'stable';
  return {
    team: input.team,
    weeklyCapacity,
    netPerWeek,
    weeksToClear,
    projectedBacklog,
    staffingGap,
    trend,
    limitations: [
      'Estimate from observed throughput + inflow; advisory only.',
      'Capacity planning never auto-assigns or auto-escalates — staffing is a human decision.',
    ],
  };
}

/** Detect advisory operational alerts. Never acts. */
export function detectOpsAlerts(
  cases: CaseRecord[],
  teamWorkload: TeamWorkload[],
  now: string,
): OpsAlert[] {
  const alerts: OpsAlert[] = [];
  for (const c of cases) {
    if (isOverdue(c, now)) {
      const reviewish = c.state === 'REVIEW' || c.state === 'PUBLICATION_REVIEW';
      alerts.push({
        kind: reviewish ? 'review_overdue' : 'investigation_overdue',
        severity: 'warning',
        title: `${reviewish ? 'Review' : 'Investigation'} overdue: ${c.title}`,
        detail: `Case ${c.id} is past its due date in '${c.state}'.`,
        caseId: c.id, team: c.team, advisory: true,
      });
    }
    if (c.state === 'PUBLICATION_REVIEW' && isOpen(c)) {
      const updated = Date.parse(c.updatedAt);
      const t = Date.parse(now);
      if (!Number.isNaN(updated) && !Number.isNaN(t) && t - updated > 7 * 24 * 3600 * 1000) {
        alerts.push({ kind: 'publication_stalled', severity: 'warning', title: `Publication stalled: ${c.title}`, detail: `Case ${c.id} has sat in publication review for over a week.`, caseId: c.id, team: c.team, advisory: true });
      }
    }
    if (c.escalation === 'CRITICAL' && isOpen(c)) {
      alerts.push({ kind: 'escalation_pending', severity: 'critical', title: `Critical escalation: ${c.title}`, detail: `Case ${c.id} is escalated CRITICAL and still open.`, caseId: c.id, team: c.team, advisory: true });
    }
  }
  for (const t of teamWorkload) {
    if (t.status === 'overloaded') {
      alerts.push({ kind: 'workload_imbalance', severity: 'warning', title: `Team overloaded: ${t.team}`, detail: `${t.team} has ${t.open} open case(s) across ${t.members} member(s).`, team: t.team, advisory: true });
    }
  }
  // Stable ordering: critical first.
  const sev = { critical: 0, warning: 1, info: 2 } as const;
  return alerts.sort((a, b) => sev[a.severity] - sev[b.severity] || a.title.localeCompare(b.title));
}
