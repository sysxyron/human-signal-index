// =============================================================================
// @hsi/operations-engine — ASSIGNMENT + OWNERSHIP.
//
// assignCase / reassignCase / unassignCase produce a new Assignment (or null)
// plus an auditable AssignmentHistoryEntry. NO hidden ownership changes — every
// action records who, what, when, and why. Pure: no DB, no clocks.
// =============================================================================

import type {
  Assignment,
  AssignmentHistoryEntry,
  CaseRole,
  OwnershipChain,
} from './types';

export class AssignmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssignmentError';
  }
}

function requireText(value: string, label: string): string {
  if (!value || value.trim().length === 0) throw new AssignmentError(`${label} is required.`);
  return value.trim();
}

export interface AssignResult {
  assignment: Assignment;
  history: AssignmentHistoryEntry;
}

/** Assign an unowned case role to an assignee. */
export function assignCase(
  input: { caseId: string; role: CaseRole; assignee: string; assigner: string; reason: string; notes?: string },
  opts: { now: string },
): AssignResult {
  const caseId = requireText(input.caseId, 'caseId');
  const assignee = requireText(input.assignee, 'assignee');
  const assigner = requireText(input.assigner, 'assigner');
  const reason = requireText(input.reason, 'reason');
  const assignment: Assignment = {
    caseId, role: input.role, assignee, assigner, assignedAt: opts.now, reason,
    ...(input.notes ? { notes: input.notes.trim() } : {}),
  };
  const history: AssignmentHistoryEntry = {
    caseId, role: input.role, action: 'assigned', from: null, to: assignee, actor: assigner, reason, at: opts.now,
  };
  return { assignment, history };
}

/** Reassign a case role from its current assignee to a new one. */
export function reassignCase(
  current: Assignment,
  input: { assignee: string; assigner: string; reason: string; notes?: string },
  opts: { now: string },
): AssignResult {
  const assignee = requireText(input.assignee, 'assignee');
  const assigner = requireText(input.assigner, 'assigner');
  const reason = requireText(input.reason, 'reason');
  if (assignee === current.assignee) throw new AssignmentError('The case is already assigned to that person.');
  const assignment: Assignment = {
    caseId: current.caseId, role: current.role, assignee, assigner,
    assignedAt: opts.now, reassignedAt: opts.now, reason,
    ...(input.notes ? { notes: input.notes.trim() } : {}),
  };
  const history: AssignmentHistoryEntry = {
    caseId: current.caseId, role: current.role, action: 'reassigned',
    from: current.assignee, to: assignee, actor: assigner, reason, at: opts.now,
  };
  return { assignment, history };
}

/** Unassign a case role. Returns the history entry; the assignment is cleared. */
export function unassignCase(
  current: Assignment,
  input: { assigner: string; reason: string },
  opts: { now: string },
): AssignmentHistoryEntry {
  const assigner = requireText(input.assigner, 'assigner');
  const reason = requireText(input.reason, 'reason');
  return {
    caseId: current.caseId, role: current.role, action: 'unassigned',
    from: current.assignee, to: null, actor: assigner, reason, at: opts.now,
  };
}

/** All active assignments for a case (latest per role). */
export function getAssignments(assignments: Assignment[], caseId: string): Assignment[] {
  const latest = new Map<CaseRole, Assignment>();
  for (const a of assignments.filter((x) => x.caseId === caseId)) {
    const prev = latest.get(a.role);
    if (!prev || a.assignedAt.localeCompare(prev.assignedAt) >= 0) latest.set(a.role, a);
  }
  return [...latest.values()];
}

/** The full, time-ordered history for a case (optionally filtered by role). */
export function trackAssignmentHistory(
  history: AssignmentHistoryEntry[],
  caseId: string,
  role?: CaseRole,
): AssignmentHistoryEntry[] {
  return history
    .filter((h) => h.caseId === caseId && (role ? h.role === role : true))
    .sort((a, b) => a.at.localeCompare(b.at));
}

/** Derive the ownership / accountability chain from active assignments. */
export function ownershipChain(assignments: Assignment[], caseId: string): OwnershipChain {
  const active = getAssignments(assignments, caseId);
  const by = (role: CaseRole) => active.find((a) => a.role === role)?.assignee ?? null;
  return {
    caseId,
    owner: by('owner'),
    reviewer: by('reviewer'),
    approver: by('approver'),
    escalationContact: by('escalation_contact'),
  };
}
