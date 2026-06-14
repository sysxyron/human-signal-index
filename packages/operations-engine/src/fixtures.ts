// =============================================================================
// @hsi/operations-engine — deterministic offline fixtures + end-to-end demo.
// =============================================================================

import { assignCase, reassignCase, ownershipChain } from './assignment';
import { escalate } from './escalation';
import { transition, buildTimeline } from './lifecycle';
import { computeWorkload, computeTeamWorkload, forecastCapacity, detectOpsAlerts } from './workload';
import type { Assignment, CaseRecord, LifecycleTransition, TeamKey } from './types';

export const FIXTURE_NOW = '2026-06-13T12:00:00.000Z';

export const DEMO_CASES: CaseRecord[] = [
  { id: 'c-1', title: 'Reassessing an early settlement date', state: 'RESEARCH', team: 'research', assignee: 'alice', escalation: 'LOW', createdAt: '2026-06-01T09:00:00.000Z', updatedAt: '2026-06-10T09:00:00.000Z', dueAt: '2026-06-09T09:00:00.000Z' },
  { id: 'c-2', title: 'Contested migration route', state: 'EVIDENCE_COLLECTION', team: 'research', assignee: 'alice', escalation: 'MEDIUM', createdAt: '2026-06-02T09:00:00.000Z', updatedAt: '2026-06-11T09:00:00.000Z', dueAt: '2026-06-20T09:00:00.000Z' },
  { id: 'c-3', title: 'Health misinformation cluster', state: 'REVIEW', team: 'review', assignee: 'bob', escalation: 'HIGH', createdAt: '2026-06-03T09:00:00.000Z', updatedAt: '2026-06-12T09:00:00.000Z', dueAt: '2026-06-12T09:00:00.000Z' },
  { id: 'c-4', title: 'Influence operation indicators', state: 'PUBLICATION_REVIEW', team: 'curation', assignee: 'carol', escalation: 'CRITICAL', createdAt: '2026-05-20T09:00:00.000Z', updatedAt: '2026-06-01T09:00:00.000Z', dueAt: '2026-06-05T09:00:00.000Z' },
  { id: 'c-5', title: 'Election narrative seeding', state: 'PUBLISHED', team: 'publishing', assignee: 'dave', escalation: 'LOW', createdAt: '2026-05-10T09:00:00.000Z', updatedAt: '2026-05-30T09:00:00.000Z', closedAt: '2026-05-30T09:00:00.000Z' },
  { id: 'c-6', title: 'Astroturfed product campaign', state: 'TRIAGE', team: 'research', assignee: null, escalation: 'LOW', createdAt: '2026-06-12T09:00:00.000Z', updatedAt: '2026-06-12T09:00:00.000Z' },
];

export const DEMO_TEAM_MEMBERS: Partial<Record<TeamKey, number>> = {
  research: 3, review: 2, curation: 1, publishing: 2, governance: 1, executive: 1, security: 1, simulation: 1,
};

/** Run the full operations chain offline. Deterministic. */
export function operationsDemo() {
  const now = FIXTURE_NOW;

  // Assignment.
  const a1 = assignCase({ caseId: 'c-6', role: 'owner', assignee: 'alice', assigner: 'lead', reason: 'Initial triage owner.' }, { now });
  const a2 = reassignCase(a1.assignment, { assignee: 'erin', assigner: 'lead', reason: 'Balancing load.' }, { now });
  const assignments: Assignment[] = [a2.assignment, { caseId: 'c-1', role: 'reviewer', assignee: 'bob', assigner: 'lead', assignedAt: now, reason: 'Reviewer.' }];
  const chain = ownershipChain(assignments, 'c-6');

  // Lifecycle.
  const t1 = transition('TRIAGE', 'RESEARCH', { actor: 'alice', reason: 'Triage complete.' }, { now });
  const transitions: LifecycleTransition[] = t1.ok ? [t1.transition] : [];
  const timeline = buildTimeline(transitions, { state: 'SUBMITTED', at: '2026-06-12T08:00:00.000Z', actor: 'system' });

  // Escalation.
  const esc = escalate('LOW', 'HIGH', { caseId: 'c-3', actor: 'bob', reason: 'Spreading fast.' }, { now });

  // Workload + capacity + alerts.
  const workload = computeWorkload(DEMO_CASES, now);
  const teamWorkload = computeTeamWorkload(DEMO_CASES, DEMO_TEAM_MEMBERS, now);
  const capacity = forecastCapacity({ team: 'research', members: 3, openCases: 12, throughputPerMemberPerWeek: 2, inflowPerWeek: 8 });
  const alerts = detectOpsAlerts(DEMO_CASES, teamWorkload, now);

  return { now, assignments, chain, transitions, timeline, escalation: esc, workload, teamWorkload, capacity, alerts };
}
