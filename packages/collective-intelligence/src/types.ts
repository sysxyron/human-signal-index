// =============================================================================
// @hsi/collective-intelligence — public type surface (WorldForge/HSI Phase 20).
//
// The COLLABORATIVE INTELLIGENCE layer: investigations multiple researchers work
// on together — submitting findings, challenging conclusions, proposing
// alternative narratives, debating evidence, endorsing, and being scored on their
// reliability. Plus the governance review of a forming consensus. Nothing is ever
// silently edited; every action is attributed + timestamped + audited; no
// auto-consensus, no auto-truth, no auto-publish.
//
// PRINCIPLES (binding — identical to Phases 16-19):
//   * PURE & DETERMINISTIC — callers inject `now`; NO Date.now()/Math.random().
//   * OFFLINE — no network, no clocks, no keys.
//   * EXPLAINABLE + AUDITABLE — every score carries explanation[] + limitations[];
//     every transition is recorded. NO hidden scoring.
// =============================================================================

export type { ConsensusSnapshot, ConsensusFinding } from '@hsi/consensus-engine';

/** The lifecycle state of an investigation. */
export type InvestigationState =
  | 'DRAFT'
  | 'ACTIVE'
  | 'UNDER_REVIEW'
  | 'CONSENSUS_FORMING'
  | 'PUBLISHED'
  | 'ARCHIVED';

/** An audited investigation transition. */
export interface InvestigationEvent {
  investigationId: string;
  from: InvestigationState;
  to: InvestigationState;
  actor: string;
  reason: string;
  at: string;
}

/** An investigation — the collaborative unit of work. */
export interface Investigation {
  id: string;
  slug: string;
  title: string;
  question: string;
  state: InvestigationState;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  events: InvestigationEvent[];
}

export interface InvestigationInput {
  id: string;
  slug: string;
  title: string;
  question: string;
  createdBy: string;
}
export interface InvestigationPatch {
  title?: string;
  question?: string;
}

export type TransitionValidity = { valid: boolean; reason: string };
export type InvestigationTransitionResult =
  | { ok: true; investigation: Investigation; event: InvestigationEvent }
  | { ok: false; error: string; reason: string };

// ---- Findings / challenges / narratives / endorsements ----------------------

/** A finding submitted to an investigation (a position + its support). */
export interface Finding {
  id: string;
  investigationId: string;
  contributorId: string;
  /** The candidate conclusion this finding supports. */
  position: string;
  summary: string;
  /** 0..1 stated confidence. */
  confidence: number;
  evidenceRefs: string[];
  endorsements: number;
  createdAt: string;
  updatedAt: string;
}

export interface FindingInput {
  id: string;
  investigationId: string;
  contributorId: string;
  position: string;
  summary: string;
  confidence?: number;
  evidenceRefs?: string[];
}

/** A challenge against a finding. */
export type ChallengeStatus = 'open' | 'upheld' | 'rejected';
export interface Challenge {
  id: string;
  investigationId: string;
  targetFindingId: string;
  contributorId: string;
  reason: string;
  status: ChallengeStatus;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

/** An alternative narrative proposed for an investigation. */
export interface AlternativeNarrative {
  id: string;
  investigationId: string;
  contributorId: string;
  title: string;
  summary: string;
  /** The position this narrative argues for. */
  position: string;
  createdAt: string;
}

/** An endorsement of a finding (withdrawable). */
export interface Endorsement {
  id: string;
  findingId: string;
  contributorId: string;
  withdrawn: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Discussion-activity metrics for an investigation. */
export interface DiscussionMetrics {
  findingCount: number;
  challengeCount: number;
  openChallengeCount: number;
  alternativeCount: number;
  endorsementCount: number;
  contributorCount: number;
  /** 0..1 — how contested the investigation is (challenges per finding). */
  contentiousness: number;
  /** 0..1 — overall activity level (capped). */
  activityScore: number;
}

// ---- Evidence debate --------------------------------------------------------

/** An evidence claim under debate. */
export interface EvidenceClaim {
  id: string;
  investigationId: string;
  contributorId: string;
  claim: string;
  sourceRef: string;
  /** 0..1 source quality. */
  sourceQuality: number;
  supportCount: number;
  challengeCount: number;
  reviewsApproved: number;
  reviewsRejected: number;
  createdAt: string;
  updatedAt: string;
}

export interface EvidenceClaimInput {
  id: string;
  investigationId: string;
  contributorId: string;
  claim: string;
  sourceRef: string;
  sourceQuality?: number;
}

export type EvidenceReviewDecision = 'approved' | 'rejected';
export interface EvidenceReview {
  id: string;
  evidenceClaimId: string;
  reviewerId: string;
  decision: EvidenceReviewDecision;
  reason: string;
  createdAt: string;
}

/** An explainable evidence-strength score. */
export interface EvidenceStrength {
  evidenceClaimId: string;
  /** 0..1 strength. */
  strength: number;
  supportCount: number;
  challengeCount: number;
  reviewsApproved: number;
  reviewsRejected: number;
  sourceQuality: number;
  explanation: string[];
  limitations: string[];
}

// ---- Contributor reputation -------------------------------------------------

/** Inputs to the contributor reputation computation. */
export interface ContributorInput {
  contributorId: string;
  /** Findings that ended aligned with the accepted consensus. */
  findingsAligned?: number;
  /** Findings that ended against the accepted consensus. */
  findingsMisaligned?: number;
  /** Challenges this contributor raised that were upheld. */
  challengesUpheld?: number;
  /** Challenges raised that were rejected. */
  challengesRejected?: number;
  /** Evidence reviews this contributor performed that were later confirmed. */
  reviewsConfirmed?: number;
  /** Reviews later overturned. */
  reviewsOverturned?: number;
  /** Mean source quality of evidence this contributor submitted, 0..1. */
  evidenceQuality?: number;
  /** Base trust seed, 0..100 (e.g. from the Phase-17 trust layer). */
  baseTrust?: number;
  /** Total contributions (drives the thin-sample discount). */
  contributionCount?: number;
}

/** An explainable contributor reliability score. */
export interface ContributorScore {
  contributorId: string;
  /** 0..1 accuracy (consensus alignment of findings). */
  accuracy: number;
  /** 0..100 overall trust. */
  trust: number;
  /** 0..1 review reliability. */
  reviewQuality: number;
  /** 0..1 how often this contributor aligns with accepted consensus. */
  consensusAlignment: number;
  /** 0..1 evidence quality. */
  evidenceQuality: number;
  /** 0..100 overall composite. */
  overall: number;
  explanation: string[];
  limitations: string[];
}

// ---- Governance (consensus review) ------------------------------------------

export type ConsensusDecision = 'approved' | 'rejected' | 'escalated' | 'archived';

/** A human governance decision over a forming consensus. */
export interface ConsensusReview {
  investigationId: string;
  decision: ConsensusDecision;
  reviewer: string;
  reason: string;
  /** The consensus position + agreement at decision time (context). */
  consensusPosition: string | null;
  agreementScore: number;
  /** State the investigation should move to as a result. */
  resultingState: InvestigationState;
  at: string;
}
