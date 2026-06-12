// =============================================================================
// @hsi/consensus-engine — public type surface (WorldForge/HSI Phase 20).
//
// CONSENSUS + DISSENT computation for the collective-intelligence network.
// Consensus is NOT a majority vote — each finding is weighted by EVIDENCE
// QUALITY, CONTRIBUTOR TRUST, HISTORICAL ACCURACY, GOVERNANCE STANDING, and the
// outcomes of CHALLENGES + REVIEWS. The engine COMPUTES a consensus candidate and
// the dissent around it; it never DECLARES truth and never auto-acts.
//
// PRINCIPLES (binding — identical to Phases 16-19):
//   * PURE & DETERMINISTIC — callers inject `now`; NO Date.now()/Math.random().
//   * OFFLINE — no network, no clocks, no keys.
//   * EXPLAINABLE + AUDITABLE — every snapshot enumerates the weights that
//     produced it + explicit LIMITATIONS. NO auto-consensus, NO auto-truth.
// =============================================================================

/**
 * One finding entering the consensus computation. A finding asserts a `position`
 * (a candidate conclusion) and carries the signals that weight it.
 */
export interface ConsensusFinding {
  id: string;
  /** The candidate conclusion this finding supports (consensus groups by this). */
  position: string;
  contributorId: string;
  /** Stated confidence in the position, 0..1. */
  confidence: number;
  /** Strength of the evidence backing this finding, 0..1. */
  evidenceStrength: number;
  /** Contributor trust, 0..100. */
  contributorTrust: number;
  /** Contributor historical accuracy, 0..1 (defaults to a neutral 0.5). */
  historicalAccuracy?: number;
  /** Governance standing of the finding/contributor, 0..1 (defaults 0.5). */
  governanceStanding?: number;
  /** Challenges UPHELD against this finding (lower its weight). */
  challengesUpheld?: number;
  /** Challenges REJECTED (defended → keeps weight). */
  challengesRejected?: number;
  /** Reviews that APPROVED this finding. */
  reviewsApproved?: number;
  /** Reviews that REJECTED this finding. */
  reviewsRejected?: number;
  /** Endorsement count (mild positive). */
  endorsements?: number;
}

/** A position's aggregated weight + composition. */
export interface PositionWeight {
  position: string;
  /** Summed weight across the findings for this position. */
  weight: number;
  /** Share of total weight, 0..1. */
  share: number;
  /** Number of findings supporting this position. */
  findingCount: number;
  /** Distinct contributors supporting this position. */
  contributorCount: number;
  /** Weighted mean evidence strength for this position, 0..1. */
  evidenceStrength: number;
  /** Weighted mean stated confidence for this position, 0..1. */
  meanConfidence: number;
}

/** A dissenting (non-consensus) position. */
export interface DissentPosition {
  position: string;
  /** Share of total weight, 0..1. */
  share: number;
  weight: number;
  findingCount: number;
  contributorCount: number;
  evidenceStrength: number;
  /** A short, human reason summarising why this position dissents. */
  reason: string;
}

/** The core consensus result. */
export interface ConsensusResult {
  /** The highest-weight position (the consensus CANDIDATE — never auto-truth). */
  consensusPosition: string | null;
  /** How concentrated the weighted mass is on the consensus position, 0..1. */
  agreementScore: number;
  /** Weighted evidence strength behind the consensus position, 0..1. */
  evidenceStrength: number;
  /** Overall confidence in the consensus (agreement × evidence × sample), 0..1. */
  confidence: number;
  dissentPositions: DissentPosition[];
}

/** A full, explainable consensus snapshot. */
export interface ConsensusSnapshot {
  investigationId: string;
  consensusPosition: string | null;
  agreementScore: number;
  evidenceStrength: number;
  confidence: number;
  /** Every position with its weight (sorted high→low). */
  positions: PositionWeight[];
  dissentPositions: DissentPosition[];
  /** Confidence distribution across all findings (5 buckets). */
  confidenceDistribution: ConfidenceBucket[];
  sampleCount: number;
  contributorCount: number;
  /** Enumerates the weights + numbers behind the snapshot. */
  explanation: string[];
  /** Honest caveats — ALWAYS populated. */
  limitations: string[];
  generatedAt: string;
}

/** One bucket of a confidence distribution. */
export interface ConfidenceBucket {
  label: string;
  lower: number;
  upper: number;
  count: number;
}

/** Documented weights for the consensus computation (base components sum to 1). */
export interface ConsensusWeights {
  evidence: number;
  trust: number;
  accuracy: number;
  governance: number;
}
