// =============================================================================
// @hsi/recalibration-engine — GOVERNANCE approval workflow.
//
// Routes a RecalibrationProposal through human governance:
//   * reviewRecalibrationProposal() — a non-mutating, decision-ready summary
//     (validity checks + the proposed change + reviewer guidance). Makes NO
//     decision.
//   * approveProposal() — records an APPROVAL: the new state (recommended), the
//     PREVIOUS state (preserved), an audit trail, reversible=true. REQUIRES a
//     non-blank reviewer + reason.
//   * rejectProposal() — records a REJECTION: state UNCHANGED (new == previous),
//     an audit trail. REQUIRES a non-blank reviewer + reason.
//
// All three are PURE + DETERMINISTIC. A decision never silently applies — the
// caller persists the returned RecalibrationDecision and updates the trust model
// from `newState`, always keeping `previousState` for reversal.
// =============================================================================

import type {
  ProposalStatus,
  RecalibrationCheck,
  RecalibrationDecision,
  RecalibrationProposal,
  RecalibrationReviewSummary,
  RecalibrationState,
} from './types';

function round(n: number, dp = 4): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/**
 * Review a proposal WITHOUT deciding it. Runs structural validity checks (range,
 * direction consistency, non-trivial magnitude, pending status) and returns a
 * reviewer-facing summary. Pure — the proposal is not mutated.
 */
export function reviewRecalibrationProposal(
  proposal: RecalibrationProposal,
  opts: { now: string },
): RecalibrationReviewSummary {
  const checks: RecalibrationCheck[] = [];

  const inRange =
    proposal.currentConfidence >= 0 &&
    proposal.currentConfidence <= 1 &&
    proposal.recommendedConfidence >= 0 &&
    proposal.recommendedConfidence <= 1;
  checks.push({
    label: 'confidence-in-range',
    ok: inRange,
    detail: inRange
      ? 'Both confidences are within [0,1].'
      : 'A confidence is outside [0,1].',
  });

  const delta = round(proposal.recommendedConfidence - proposal.currentConfidence);
  const dirConsistent =
    (proposal.direction === 'downward' && delta < 0) ||
    (proposal.direction === 'upward' && delta > 0) ||
    (proposal.direction === 'none' && delta === 0);
  checks.push({
    label: 'direction-consistent',
    ok: dirConsistent,
    detail: dirConsistent
      ? `Direction '${proposal.direction}' matches the signed delta ${delta}.`
      : `Direction '${proposal.direction}' contradicts the signed delta ${delta}.`,
  });

  const nonTrivial = Math.abs(delta) > 0;
  checks.push({
    label: 'non-trivial-change',
    ok: nonTrivial,
    detail: nonTrivial
      ? `Proposed change is ${pct(Math.abs(delta))}.`
      : 'Proposed change is zero — nothing to recalibrate.',
  });

  const pending = proposal.status === 'pending';
  checks.push({
    label: 'status-pending',
    ok: pending,
    detail: pending
      ? 'Proposal is pending review.'
      : `Proposal is already '${proposal.status}'.`,
  });

  const hasEvidence = proposal.supportingEvidence.length > 0;
  checks.push({
    label: 'has-evidence',
    ok: hasEvidence,
    detail: hasEvidence
      ? `${proposal.supportingEvidence.length} supporting evidence item(s).`
      : 'No supporting evidence supplied.',
  });

  const valid = checks.every((c) => c.ok);

  const recommendation = valid
    ? `Proposal is well-formed: ${proposal.direction} recalibration of ${pct(Math.abs(delta))} ` +
      `(severity ${proposal.severity}). Approve only with an explicit reason; the previous ` +
      `state will be preserved and the change is reversible.`
    : `Proposal has failed ${checks.filter((c) => !c.ok).length} validity check(s); ` +
      `resolve them before approval. Do not apply.`;

  const summary =
    `${proposal.entityType} ${proposal.entityId}: confidence ${pct(proposal.currentConfidence)} → ` +
    `${pct(proposal.recommendedConfidence)} (${proposal.direction}). Trigger: ${proposal.trigger}.`;

  return {
    proposalId: proposal.id,
    entityType: proposal.entityType,
    entityId: proposal.entityId,
    valid,
    direction: proposal.direction,
    confidenceDelta: delta,
    severity: proposal.severity,
    checks,
    recommendation,
    summary,
    reviewedAt: opts.now,
  };
}

/** Build the state captured from a proposal's CURRENT values. */
function previousStateOf(proposal: RecalibrationProposal): RecalibrationState {
  return {
    confidence: proposal.currentConfidence,
    ...(proposal.currentTrust !== undefined ? { trust: proposal.currentTrust } : {}),
  };
}

/** Build the state a proposal RECOMMENDS. */
function recommendedStateOf(proposal: RecalibrationProposal): RecalibrationState {
  return {
    confidence: proposal.recommendedConfidence,
    ...(proposal.recommendedTrust !== undefined
      ? { trust: proposal.recommendedTrust }
      : {}),
  };
}

/** Shared validation: a decision REQUIRES a non-blank reviewer + reason. */
function decisionError(
  decidedBy: string | undefined,
  reason: string | undefined,
): string | null {
  if (!decidedBy || decidedBy.trim().length === 0) {
    return 'A recalibration decision requires an identified reviewer.';
  }
  if (!reason || reason.trim().length === 0) {
    return 'A recalibration decision requires a non-blank reason.';
  }
  return null;
}

/** Thrown when a governance decision is missing its reviewer/reason. */
export class RecalibrationDecisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecalibrationDecisionError';
  }
}

/**
 * APPROVE a proposal. Produces a decision whose `newState` is the recommended
 * state and whose `previousState` is preserved (reversible). REQUIRES a non-blank
 * reviewer + reason — otherwise throws RecalibrationDecisionError. Pure; the
 * proposal is not mutated (the caller flips its persisted status to 'approved').
 */
export function approveProposal(
  proposal: RecalibrationProposal,
  decision: { decidedBy: string; reason: string },
  opts: { now: string },
): RecalibrationDecision {
  const err = decisionError(decision.decidedBy, decision.reason);
  if (err) throw new RecalibrationDecisionError(err);

  const previousState = previousStateOf(proposal);
  const newState = recommendedStateOf(proposal);
  const reason = decision.reason.trim();
  const by = decision.decidedBy.trim();

  const auditTrail = [
    `${opts.now} — proposal ${proposal.id} created (trigger: ${proposal.trigger}).`,
    `${opts.now} — reviewed: confidence ${pct(previousState.confidence)} → ${pct(newState.confidence)} (${proposal.direction}).`,
    `${opts.now} — APPROVED by ${by}. Reason: ${reason}.`,
    `${opts.now} — previous state preserved (confidence ${pct(previousState.confidence)}${previousState.trust !== undefined ? `, trust ${previousState.trust}` : ''}); change is reversible.`,
  ];

  return {
    proposalId: proposal.id,
    entityType: proposal.entityType,
    entityId: proposal.entityId,
    status: 'approved' as ProposalStatus,
    decidedBy: by,
    reason,
    previousState,
    newState,
    reversible: true,
    auditTrail,
    decidedAt: opts.now,
  };
}

/**
 * REJECT a proposal. Produces a decision whose `newState` EQUALS the previous
 * state (nothing changes) and records the rejection in the audit trail. REQUIRES
 * a non-blank reviewer + reason — otherwise throws. Pure.
 */
export function rejectProposal(
  proposal: RecalibrationProposal,
  decision: { decidedBy: string; reason: string },
  opts: { now: string },
): RecalibrationDecision {
  const err = decisionError(decision.decidedBy, decision.reason);
  if (err) throw new RecalibrationDecisionError(err);

  const previousState = previousStateOf(proposal);
  const reason = decision.reason.trim();
  const by = decision.decidedBy.trim();

  const auditTrail = [
    `${opts.now} — proposal ${proposal.id} created (trigger: ${proposal.trigger}).`,
    `${opts.now} — reviewed: proposed confidence ${pct(proposal.currentConfidence)} → ${pct(proposal.recommendedConfidence)} (${proposal.direction}).`,
    `${opts.now} — REJECTED by ${by}. Reason: ${reason}.`,
    `${opts.now} — no change applied; state retained at confidence ${pct(previousState.confidence)}.`,
  ];

  return {
    proposalId: proposal.id,
    entityType: proposal.entityType,
    entityId: proposal.entityId,
    status: 'rejected' as ProposalStatus,
    decidedBy: by,
    reason,
    previousState,
    // Rejection preserves the previous state verbatim.
    newState: { ...previousState },
    reversible: true,
    auditTrail,
    decidedAt: opts.now,
  };
}

/**
 * Reverse an applied (approved) decision: swap previous/new so the entity is
 * restored to its prior state, with an audit note. Demonstrates that every
 * approved change is reversible. Pure.
 */
export function reverseDecision(
  applied: RecalibrationDecision,
  decision: { decidedBy: string; reason: string },
  opts: { now: string },
): RecalibrationDecision {
  const err = decisionError(decision.decidedBy, decision.reason);
  if (err) throw new RecalibrationDecisionError(err);
  const by = decision.decidedBy.trim();
  const reason = decision.reason.trim();

  return {
    ...applied,
    previousState: applied.newState,
    newState: applied.previousState,
    decidedBy: by,
    reason,
    auditTrail: [
      ...applied.auditTrail,
      `${opts.now} — REVERSED by ${by}. Reason: ${reason}. Restored to confidence ${pct(applied.previousState.confidence)}.`,
    ],
    decidedAt: opts.now,
  };
}
