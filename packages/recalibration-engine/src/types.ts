// =============================================================================
// @hsi/recalibration-engine — public type surface (WorldForge/HSI Phase 17).
//
// RECALIBRATION RECOMMENDATION + GOVERNANCE WORKFLOW. When trust drifts or
// calibration error crosses a threshold, this engine RECOMMENDS a confidence
// recalibration — as a PROPOSAL only. It NEVER auto-applies. A proposal is then
// routed through governance: reviewed, then approved or rejected by a human, with
// a full audit trail, the PREVIOUS state preserved, and the change fully
// reversible.
//
// PRINCIPLES (binding):
//   * PURE & DETERMINISTIC — callers inject `now`; NO Date.now()/Math.random().
//   * OFFLINE — fixtures + local heuristics; no network, no clocks, no keys.
//   * PROPOSAL ONLY — recommendations never mutate trust/confidence. Only an
//     explicit human approval produces a new state, and the previous state is
//     always preserved (reversible + audited).
//   * EXPLAINABLE + AUDITABLE — every proposal carries its reason + supporting
//     evidence; every decision carries who/why/when + a previous→new diff.
// =============================================================================

export type {
  TrustEntityType,
} from '@hsi/calibration-engine';
export type { TrustDriftEvent, TrustDriftKind } from '@hsi/trust-history';

import type { TrustEntityType } from '@hsi/calibration-engine';

/** What prompted a recalibration proposal. */
export type RecalibrationTrigger =
  | 'trust_drift'
  | 'trust_collapse'
  | 'calibration_error'
  | 'overconfidence'
  | 'underconfidence'
  | 'source_overstated'
  | 'manual';

/** Advisory severity for triaging a proposal. */
export type RecalibrationSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** The lifecycle state of a proposal. */
export type ProposalStatus = 'pending' | 'approved' | 'rejected';

/** The direction a recalibration moves confidence. */
export type RecalibrationDirection = 'downward' | 'upward' | 'none';

/**
 * A RECALIBRATION PROPOSAL — a recommendation to change an entity's stated
 * confidence (and, optionally, the trust it implies). A proposal NEVER changes
 * anything on its own; it is data for a human reviewer.
 */
export interface RecalibrationProposal {
  id: string;
  entityType: TrustEntityType;
  entityId: string;
  trigger: RecalibrationTrigger;
  /** Current stated confidence, 0..1. */
  currentConfidence: number;
  /** Recommended confidence, 0..1. */
  recommendedConfidence: number;
  /** Current trust score for context, 0..100 (optional). */
  currentTrust?: number;
  /** Recommended trust score for context, 0..100 (optional). */
  recommendedTrust?: number;
  direction: RecalibrationDirection;
  /** |recommended − current| confidence delta, 0..1. */
  magnitude: number;
  severity: RecalibrationSeverity;
  /** One-line human reason. */
  reason: string;
  /** The numbers/observations supporting the proposal. */
  supportingEvidence: string[];
  status: ProposalStatus;
  createdAt: string;
}

/** Inputs to proposeRecalibration. */
export interface RecalibrationProposalInput {
  id: string;
  entityType: TrustEntityType;
  entityId: string;
  trigger: RecalibrationTrigger;
  currentConfidence: number;
  recommendedConfidence: number;
  currentTrust?: number;
  recommendedTrust?: number;
  reason?: string;
  supportingEvidence?: string[];
}

/** A single validation check performed while reviewing a proposal. */
export interface RecalibrationCheck {
  label: string;
  ok: boolean;
  detail: string;
}

/**
 * The output of reviewRecalibrationProposal — a non-mutating, decision-ready
 * summary: validity, the proposed change, and a checklist for the reviewer. It
 * makes NO decision itself.
 */
export interface RecalibrationReviewSummary {
  proposalId: string;
  entityType: TrustEntityType;
  entityId: string;
  /** Whether the proposal passed all structural validity checks. */
  valid: boolean;
  direction: RecalibrationDirection;
  /** Signed confidence change (recommended − current), 0..1 magnitude. */
  confidenceDelta: number;
  severity: RecalibrationSeverity;
  checks: RecalibrationCheck[];
  /** Plain-language reviewer guidance (advisory). */
  recommendation: string;
  summary: string;
  reviewedAt: string;
}

/** The state captured before/after a decision (for reversibility + audit). */
export interface RecalibrationState {
  confidence: number;
  trust?: number;
}

/**
 * The result of approving or rejecting a proposal. Carries the decider, the
 * reason, the PREVIOUS state (preserved for reversal), the NEW state (equal to
 * the previous state on rejection), an audit trail, and a `reversible` flag.
 */
export interface RecalibrationDecision {
  proposalId: string;
  entityType: TrustEntityType;
  entityId: string;
  status: ProposalStatus;
  /** Who decided (user id / name). */
  decidedBy: string;
  /** Why (REQUIRED, non-blank — a blank reason is rejected upstream). */
  reason: string;
  /** State before the decision (always preserved). */
  previousState: RecalibrationState;
  /** State after the decision (== previousState when rejected). */
  newState: RecalibrationState;
  /** Whether the change can be reversed (always true — previous state is kept). */
  reversible: boolean;
  /** Human-readable, append-only audit trail of the decision. */
  auditTrail: string[];
  decidedAt: string;
}
