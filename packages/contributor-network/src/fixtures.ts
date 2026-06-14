// =============================================================================
// Deterministic demo fixtures — power the OFFLINE/NOT_CONFIGURED dashboard views
// (no Supabase env) and tests. No randomness, no Date.now(); timestamps are
// literals. Clearly labelled as demo by the pages that render them.
// =============================================================================

import type {
  ContributionMetrics, ContributorStat, CreditEntry, InvestigationEvent,
  PublicationReadiness, QualitySignals, TeamStat, XpEntry,
} from './types';

export const DEMO_NOW = '2026-06-14T12:00:00.000Z';

export const demoXpLedger: XpEntry[] = [
  { event: 'signal_submitted', amount: 10, at: '2026-06-01T09:00:00.000Z' },
  { event: 'signal_accepted', amount: 25, at: '2026-06-02T09:00:00.000Z' },
  { event: 'source_verified', amount: 25, at: '2026-06-03T09:00:00.000Z' },
  { event: 'evidence_package_created', amount: 50, at: '2026-06-04T09:00:00.000Z' },
  { event: 'review_completed', amount: 40, at: '2026-06-05T09:00:00.000Z' },
];

export const demoCreditLedger: CreditEntry[] = [
  { event: 'mission_completed', amount: 15, at: '2026-06-02T10:00:00.000Z' },
  { event: 'badge_earned', amount: 25, at: '2026-06-04T10:00:00.000Z' },
];

export const demoQuality: QualitySignals = {
  acceptedSignals: 38,
  rejectedSignals: 6,
  reviewAccuracy: 0.82,
  evidenceQuality: 0.74,
  traceabilityScore: 0.88,
  consensusAgreement: 0.7,
  governanceOutcomes: 0.6,
  publicationQuality: 0.65,
};

export const demoMetrics: ContributionMetrics = {
  accepted_signals: 38,
  approved_sources: 22,
  evidence_packages: 9,
  linked_signals: 64,
  completed_reviews: 41,
  traceability_days: 35,
  confirmed_early_detections: 2,
  approved_reports: 3,
  governance_actions: 7,
};

export const demoReadiness: PublicationReadiness = {
  evidenceComplete: true,
  reviewerComplete: true,
  governanceComplete: false,
  riskAssessed: true,
  traceabilitySufficient: true,
  sourceQualitySufficient: false,
};

export const demoInvestigationEvents: InvestigationEvent[] = [
  { action: 'created', actor: 'demo-researcher', reason: 'Opened from signal cluster.', at: '2026-06-08T08:00:00.000Z' },
  { action: 'status:intake->research', actor: 'demo-researcher', reason: 'Claimed for investigation.', at: '2026-06-08T09:30:00.000Z' },
  { action: 'status:research->evidence_collection', actor: 'demo-researcher', reason: 'Sources verified; collecting evidence.', at: '2026-06-10T14:00:00.000Z' },
  { action: 'status:evidence_collection->review', actor: 'demo-researcher', reason: 'Submitted for review.', at: '2026-06-12T11:00:00.000Z' },
];

export const demoContributors: ContributorStat[] = [
  { id: 'u1', name: 'Ada Lin', role: 'researcher', xp: 2150, acceptedSignals: 64, rejectedSignals: 7, evidencePackages: 18, reviewsCompleted: 12, reportsPrepared: 1, reputation: 78 },
  { id: 'u2', name: 'Marco Reyes', role: 'reviewer', xp: 1980, acceptedSignals: 20, rejectedSignals: 3, evidencePackages: 4, reviewsCompleted: 96, reportsPrepared: 0, reputation: 82 },
  { id: 'u3', name: 'Priya Shah', role: 'curator', xp: 2600, acceptedSignals: 12, rejectedSignals: 1, evidencePackages: 6, reviewsCompleted: 20, reportsPrepared: 14, reputation: 80 },
  { id: 'u4', name: 'Sam Okoye', role: 'viewer', xp: 320, acceptedSignals: 9, rejectedSignals: 11, evidencePackages: 0, reviewsCompleted: 0, reportsPrepared: 0, reputation: 44 },
  { id: 'u5', name: 'Jin Park', role: 'researcher', xp: 5400, acceptedSignals: 110, rejectedSignals: 9, evidencePackages: 31, reviewsCompleted: 22, reportsPrepared: 2, reputation: 88 },
];

export const demoTeams: TeamStat[] = [
  { id: 't1', name: 'Research', xp: 9200, acceptedSignals: 210, evidencePackages: 64, reviewsCompleted: 80, investigationsCompleted: 12, reportsPrepared: 6, escalationsResolved: 9 },
  { id: 't2', name: 'Review', xp: 7100, acceptedSignals: 60, evidencePackages: 18, reviewsCompleted: 240, investigationsCompleted: 4, reportsPrepared: 1, escalationsResolved: 14 },
  { id: 't3', name: 'Curation', xp: 6400, acceptedSignals: 30, evidencePackages: 12, reviewsCompleted: 40, investigationsCompleted: 3, reportsPrepared: 28, escalationsResolved: 2 },
];

/** A demo mission progress map keyed by template id → step counts. */
export const demoMissionProgress: Record<string, Record<string, number>> = {
  viewer_explore: { signals: 3, follow: 1, trails: 2 },
  contributor_build: { signals: 5, sources: 2, profile: 0 },
  researcher_verify: { sources: 10, evidence: 3, investigation: 1 },
  reviewer_validate: { reviews: 14, evidence: 5, escalate: 0 },
  curator_publish: { reports: 1, drafts: 3, retraction: 1 },
};
