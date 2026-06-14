// =============================================================================
// @hsi/contributor-network — shared types for the contributor intelligence
// network (Phase 25). PURE: no React, no DOM, no Date.now()/Math.random().
//
// GOVERNANCE: nothing here grants a privileged role. XP/reputation/ranks/badges
// describe CONTRIBUTION; they never bypass RBAC or admin approval. Progression
// surfaces are advisory — actual role assignment stays with admins (existing IAM).
// =============================================================================

/** RBAC roles (the real role ladder; unchanged by this phase). */
export type ContributorRole = 'viewer' | 'researcher' | 'reviewer' | 'curator' | 'admin';

/** Purpose chosen at onboarding (a self-declared INTENT, not a role grant). */
export type PurposePath =
  | 'observer'
  | 'contributor'
  | 'researcher_applicant'
  | 'reviewer_applicant'
  | 'organization_applicant';

/** The role an application requests (admin assigns; never self-granted; never admin). */
export type RequestedRole = 'contributor' | 'researcher' | 'reviewer' | 'curator';

export type ApplicationStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'needs_more_info'
  | 'withdrawn';

// ---- XP --------------------------------------------------------------------
export type XpEvent =
  | 'signal_submitted'
  | 'signal_accepted'
  | 'source_submitted'
  | 'source_verified'
  | 'evidence_package_created'
  | 'investigation_created'
  | 'investigation_completed'
  | 'review_completed'
  | 'publication_prepared'
  | 'governance_action_completed'
  | 'adjustment';

export interface XpEntry {
  event: XpEvent;
  amount: number; // append-only; corrections use event:'adjustment' (may be negative)
  at: string;
  note?: string;
}

// ---- Reputation ------------------------------------------------------------
export type ReputationCategory =
  | 'research_reputation'
  | 'review_reputation'
  | 'publication_reputation'
  | 'governance_reputation'
  | 'trust_reputation';

export interface QualitySignals {
  acceptedSignals: number;
  rejectedSignals: number;
  reviewAccuracy: number; // 0..1
  evidenceQuality: number; // 0..1
  traceabilityScore: number; // 0..1
  consensusAgreement: number; // 0..1
  governanceOutcomes: number; // 0..1 (favourable governance outcomes)
  publicationQuality: number; // 0..1
}

export type ReputationScores = Record<ReputationCategory, number>; // each 0..100

// ---- Ranks -----------------------------------------------------------------
export type RankTrack = 'viewer' | 'research' | 'review' | 'curation' | 'governance';

export interface RankDef {
  track: RankTrack;
  name: string;
  level: number; // 1-based within the track
  minXp: number;
  minReputation: number; // 0..100 on the track's primary category
  requiresAdminApproval: boolean; // advancing INTO this rank needs admin sign-off
  badgeRequirements: string[]; // badge ids that must be earned first
}

export interface RankProgress {
  current: RankDef;
  next: RankDef | null;
  xpToNext: number;
  reputationToNext: number;
  missingBadges: string[];
  needsAdminApproval: boolean;
}

// ---- Badges ----------------------------------------------------------------
export type BadgeMetric =
  | 'accepted_signals'
  | 'approved_sources'
  | 'evidence_packages'
  | 'linked_signals'
  | 'completed_reviews'
  | 'traceability_days'
  | 'confirmed_early_detections'
  | 'approved_reports'
  | 'governance_actions';

export interface BadgeDef {
  id: string;
  name: string;
  description: string;
  metric: BadgeMetric;
  threshold: number;
}

export interface ContributionMetrics {
  accepted_signals: number;
  approved_sources: number;
  evidence_packages: number;
  linked_signals: number;
  completed_reviews: number;
  traceability_days: number; // consecutive days at/above the traceability bar
  confirmed_early_detections: number;
  approved_reports: number;
  governance_actions: number;
}

export interface BadgeAward {
  badgeId: string;
  earnedByMetric: BadgeMetric;
  value: number;
  threshold: number;
}

// ---- Intel credits ---------------------------------------------------------
export type CreditEvent =
  | 'quality_submission'
  | 'mission_completed'
  | 'badge_earned'
  | 'investigation_approved'
  | 'special_operation'
  | 'adjustment';

export interface CreditEntry {
  event: CreditEvent;
  amount: number;
  at: string;
  note?: string;
}

// ---- Missions --------------------------------------------------------------
export type MissionStatus =
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'expired'
  | 'claimed';

export interface MissionStep {
  key: string;
  label: string;
  target: number;
}

export interface MissionTemplate {
  id: string;
  role: ContributorRole;
  title: string;
  steps: MissionStep[];
  xpReward: number;
  creditReward: number;
}

export interface MissionProgressInput {
  template: MissionTemplate;
  progress: Record<string, number>; // step.key -> count done
  claimed?: boolean;
  expiredAt?: string | null; // ISO deadline
  now: string;
}

export interface MissionView {
  id: string;
  title: string;
  role: ContributorRole;
  steps: Array<MissionStep & { done: number; complete: boolean }>;
  percent: number; // 0..100
  status: MissionStatus;
  xpReward: number;
  creditReward: number;
}

// ---- Investigation lifecycle ----------------------------------------------
export type InvestigationStatus =
  | 'intake'
  | 'research'
  | 'evidence_collection'
  | 'review'
  | 'escalated'
  | 'governance'
  | 'publication_ready'
  | 'published'
  | 'archived';

export type InvestigationPriority = 'low' | 'medium' | 'high' | 'critical';

export interface InvestigationEvent {
  action: string;
  actor: string;
  reason: string;
  at: string;
  metadata?: Record<string, unknown>;
}

export interface PublicationReadiness {
  evidenceComplete: boolean;
  reviewerComplete: boolean;
  governanceComplete: boolean;
  riskAssessed: boolean;
  traceabilitySufficient: boolean;
  sourceQualitySufficient: boolean;
}

// ---- Leaderboard -----------------------------------------------------------
export type LeaderboardView =
  | 'top_contributors'
  | 'top_researchers'
  | 'top_reviewers'
  | 'top_curators'
  | 'top_teams';

export interface ContributorStat {
  id: string;
  name: string;
  role: ContributorRole;
  xp: number;
  acceptedSignals: number;
  rejectedSignals: number;
  evidencePackages: number;
  reviewsCompleted: number;
  reportsPrepared: number;
  reputation: number; // 0..100 quality
}

export interface LeaderboardRow {
  rank: number;
  id: string;
  name: string;
  score: number; // quality-weighted
  xp: number;
  reputation: number;
}

export interface TeamStat {
  id: string;
  name: string;
  xp: number;
  acceptedSignals: number;
  evidencePackages: number;
  reviewsCompleted: number;
  investigationsCompleted: number;
  reportsPrepared: number;
  escalationsResolved: number;
}
