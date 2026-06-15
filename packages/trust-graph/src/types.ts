// =============================================================================
// @hsi/trust-graph — types. PURE quality measurement (no DB, no UI, no Date.now()).
//
// This engine measures QUALITY, not activity. It turns a contributor's
// accepted/rejected contributions, review outcomes, and publication outcomes into
// trust / accuracy / reliability / authority scores (all 0..100) and a
// recognition LADDER. Nothing here is an RBAC role; nothing grants access.
// =============================================================================

/** A contributor's quality inputs, aggregated by the caller (worker). */
export interface TrustInputs {
  // Signal accuracy.
  signalsSubmitted: number;
  signalsAccepted: number;
  signalsRejected: number;
  // Review accuracy (a reviewer's decision vs the final governance outcome).
  reviewAgreements: number;
  reviewDisagreements: number;
  // Publication quality.
  publicationsApproved: number;
  publicationsRejected: number;
  /** 0..1 mean traceability of the contributor's publications. */
  publicationTraceability: number;
  /** 0..1 share of the contributor's publications that cleared governance. */
  governanceApprovalRate: number;
  // Reliability.
  investigationsOpened: number;
  investigationsCompleted: number;
  investigationsAbandoned: number;
  overdueAssignments: number;
  /** Number of distinct time windows the contributor was active in (consistency). */
  activeWindows: number;
  /** Total windows observed (for the consistency ratio). */
  totalWindows: number;
  // Impact (Phase 28) — investigations that produced real outcomes.
  acceptedFindings: number;
  governanceActions: number;
  publicationsDelivered: number;
  // Governance effectiveness (Phase 28) — decisions confirmed by later outcomes.
  governanceConfirmed: number;
  governanceDecisions: number;
}

/** The four component scores + the headline trust/authority (all 0..100). */
export interface TrustScores {
  signalAccuracy: number;
  reviewAccuracy: number;
  publicationQuality: number;
  reliability: number;
  impact: number; // Phase 28 — investigation impact
  governanceEffectiveness: number; // Phase 28
  accuracy: number; // mean(signalAccuracy, reviewAccuracy)
  trust: number;
  authority: number;
}

/** Agreement breakdown for reviewers (Deliverable 3). */
export interface ReviewBreakdown {
  agreementPct: number; // 0..100
  disagreementPct: number; // 0..100
  score: number; // 0..100
}

/** A contributor recognition level (NOT an RBAC role). */
export interface TrustLevel {
  name: string;
  /** Minimum authority score to hold this level. */
  minAuthority: number;
  order: number;
}

/** Trust events recorded to history (Deliverable 9). */
export type TrustEventType =
  | 'SIGNAL_ACCEPTED'
  | 'SIGNAL_REJECTED'
  | 'REVIEW_AGREEMENT'
  | 'REVIEW_DISAGREEMENT'
  | 'PUBLICATION_APPROVED'
  | 'PUBLICATION_REJECTED'
  | 'INVESTIGATION_COMPLETED'
  | 'INVESTIGATION_ABANDONED'
  // Phase 28 — operational outcome events.
  | 'INVESTIGATION_ACCEPTED'
  | 'INVESTIGATION_REJECTED'
  | 'GOVERNANCE_CONFIRMED'
  | 'PUBLICATION_HIGH_CONFIDENCE'
  | 'PUBLICATION_LOW_CONFIDENCE';

/** A self-validation candidate (actor acting on their own work) — excluded from trust. */
export interface ValidationEvent {
  type: TrustEventType;
  actorId: string;
  subjectId: string | null;
}
