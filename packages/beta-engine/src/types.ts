// =============================================================================
// @hsi/beta-engine — types. PURE (no DB, no UI, no Date.now()).
//
// The operational beta layer: cohorts, tester status lifecycle, automatic mission
// assignment, progress, NPS, analytics (activation/retention/completion), and
// recognition badges. GOVERNANCE: testers self-serve (join/onboard/missions/
// issues/feedback) WITHOUT admin intervention, but privileged ROLE advancement
// still goes through admin-approved applications — this engine never grants roles.
// =============================================================================

export type CohortKey = 'internal' | 'research' | 'reviewer' | 'governance' | 'enterprise_pilot';

export type TesterStatus = 'pending' | 'invited' | 'active' | 'suspended' | 'completed';

export type IssueCategory = 'ui' | 'workflow' | 'performance' | 'permissions' | 'data' | 'security';
export type IssueSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IssueStatus = 'open' | 'triaged' | 'in_progress' | 'resolved' | 'closed';

export interface CohortDef { key: CohortKey; name: string; description: string }

/** A mission available to assign (shape-compatible with @hsi/contributor-network). */
export interface AssignableMission {
  id: string;
  role: string;
  title: string;
}

export interface TesterProgressInput {
  assignedMissions: number;
  completedMissions: number;
  xp: number;
}
export interface TesterProgress {
  completionPct: number; // 0..100
  completedMissions: number;
  assignedMissions: number;
  xp: number;
}

// ---- NPS -------------------------------------------------------------------
export interface NpsResult {
  responses: number;
  promoters: number;
  passives: number;
  detractors: number;
  score: number; // -100..100
}

// ---- analytics -------------------------------------------------------------
export interface CohortAnalyticsInput {
  total: number;
  invited: number;
  active: number;
  completed: number;
  activeLastPeriod: number; // testers active in the retention window
  missionsAssigned: number;
  missionsCompleted: number;
}
export interface CohortAnalytics {
  activationRate: number; // active+completed / total
  retentionRate: number; // activeLastPeriod / (active+completed)
  completionRate: number; // completed / total
  missionCompletionRate: number; // missionsCompleted / missionsAssigned
}

export type ReportPeriod = 'daily' | 'weekly' | 'monthly';

// ---- recognition badges (Deliverable 19) -----------------------------------
export type BetaBadgeKey =
  | 'found_bug'
  | 'power_tester'
  | 'elite_researcher'
  | 'review_specialist'
  | 'governance_advisor';

export interface BetaBadgeDef {
  key: BetaBadgeKey;
  name: string;
  description: string;
}

export interface TesterStats {
  issuesReported: number;
  missionsCompleted: number;
  signalsAccepted: number;
  reviewsCompleted: number;
  governanceActions: number;
}
