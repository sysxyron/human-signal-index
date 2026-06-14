// =============================================================================
// @hsi/operations-engine — type surface (WorldForge/HSI Phase 24).
//
// The HUMAN OPERATIONS layer: assignment, ownership, escalation, the
// investigation lifecycle, workload + capacity, and beta-tester issue tracking.
//
// PRINCIPLES (binding):
//   * PURE & DETERMINISTIC — callers inject `now`; NO Date.now()/Math.random().
//   * OFFLINE — no network, no clocks, no keys, no DB.
//   * ADVISORY — this engine assigns work and surfaces load; it NEVER publishes,
//     approves, rejects, or changes governance outcomes. Every action is a human
//     action and is auditable. No autonomous decisions.
// =============================================================================

// ---- lifecycle --------------------------------------------------------------

/** The canonical investigation lifecycle states, in order. */
export type LifecycleState =
  | 'SUBMITTED'
  | 'TRIAGE'
  | 'RESEARCH'
  | 'EVIDENCE_COLLECTION'
  | 'REVIEW'
  | 'PUBLICATION_REVIEW'
  | 'PUBLISHED'
  | 'ARCHIVED';

/** A recorded lifecycle transition (auditable; no silent changes). */
export interface LifecycleTransition {
  from: LifecycleState;
  to: LifecycleState;
  actor: string;
  reason: string;
  at: string;
}

export interface TimelineEntry {
  state: LifecycleState;
  enteredAt: string;
  actor: string;
  reason: string;
  /** Duration in this state in ms, when a later transition exists. */
  durationMs?: number;
}

// ---- assignment + ownership -------------------------------------------------

/** The accountable roles on a case (the accountability chain). */
export type CaseRole = 'owner' | 'reviewer' | 'approver' | 'escalation_contact';

export interface Assignment {
  caseId: string;
  role: CaseRole;
  assignee: string;
  assigner: string;
  assignedAt: string;
  reassignedAt?: string;
  reason: string;
  notes?: string;
}

export type AssignmentAction = 'assigned' | 'reassigned' | 'unassigned';

export interface AssignmentHistoryEntry {
  caseId: string;
  role: CaseRole;
  action: AssignmentAction;
  from: string | null;
  to: string | null;
  actor: string;
  reason: string;
  at: string;
}

/** The ownership / accountability chain for a case. */
export interface OwnershipChain {
  caseId: string;
  owner: string | null;
  reviewer: string | null;
  approver: string | null;
  escalationContact: string | null;
}

// ---- escalation -------------------------------------------------------------

export type EscalationLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface Escalation {
  caseId: string;
  level: EscalationLevel;
  raisedBy: string;
  reason: string;
  at: string;
  active: boolean;
}

export type EscalationAction = 'escalated' | 'de-escalated';

export interface EscalationHistoryEntry {
  caseId: string;
  action: EscalationAction;
  from: EscalationLevel | null;
  to: EscalationLevel | null;
  actor: string;
  reason: string;
  at: string;
}

// ---- teams + workload -------------------------------------------------------

export type TeamKey =
  | 'research'
  | 'review'
  | 'curation'
  | 'governance'
  | 'executive'
  | 'security'
  | 'publishing'
  | 'simulation';

/** A unit of work used for workload + lifecycle calculations. */
export interface CaseRecord {
  id: string;
  title: string;
  state: LifecycleState;
  team: TeamKey;
  assignee: string | null;
  escalation: EscalationLevel | null;
  createdAt: string;
  updatedAt: string;
  dueAt?: string | null;
  closedAt?: string | null;
}

export interface WorkloadRow {
  assignee: string;
  assigned: number;
  open: number;
  overdue: number;
  escalated: number;
  byState: Record<string, number>;
}

export interface TeamWorkload {
  team: TeamKey;
  members: number;
  open: number;
  overdue: number;
  escalated: number;
  /** open / members, rounded to 1 decimal. */
  loadPerMember: number;
  status: 'healthy' | 'busy' | 'overloaded';
}

export interface CapacityInput {
  team: TeamKey;
  members: number;
  openCases: number;
  /** Cases closed per member per week (observed). */
  throughputPerMemberPerWeek: number;
  /** New cases arriving per week (observed). */
  inflowPerWeek: number;
}

export interface CapacityForecast {
  team: TeamKey;
  /** Cases the team can clear per week. */
  weeklyCapacity: number;
  /** Net backlog change per week (inflow - capacity). */
  netPerWeek: number;
  /** Weeks to clear the current backlog, or null when capacity ≤ inflow. */
  weeksToClear: number | null;
  /** Projected backlog in `horizonWeeks`. */
  projectedBacklog: number;
  staffingGap: number; // additional members needed to break even (>=0)
  trend: 'shrinking' | 'stable' | 'growing';
  limitations: string[];
}

// ---- beta-tester issues -----------------------------------------------------

export type TesterIssueState =
  | 'SUBMITTED'
  | 'TRIAGED'
  | 'ASSIGNED'
  | 'RESOLVED'
  | 'VERIFIED'
  | 'CLOSED';

export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface TesterIssueRecord {
  id: string;
  tester: string;
  title: string;
  severity: IssueSeverity;
  state: TesterIssueState;
  assignee: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---- operational alerts -----------------------------------------------------

export type OpsAlertKind =
  | 'investigation_overdue'
  | 'review_overdue'
  | 'publication_stalled'
  | 'escalation_pending'
  | 'workload_imbalance'
  | 'human_review_required';

export type OpsAlertSeverity = 'info' | 'warning' | 'critical';

export interface OpsAlert {
  kind: OpsAlertKind;
  severity: OpsAlertSeverity;
  title: string;
  detail: string;
  caseId?: string;
  team?: TeamKey;
  /** Advisory only — alerts never act. */
  advisory: true;
}
