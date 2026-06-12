// =============================================================================
// @hsi/collective-intelligence — the EVIDENCE DEBATE system.
//
// createEvidenceClaim builds an attributed claim; supportEvidence / challengeEvidence
// adjust its tallies; reviewEvidence records a human review; scoreEvidenceStrength
// produces an EXPLAINABLE 0..1 strength. Every score enumerates the support /
// challenge / review counts + source quality that produced it — no hidden scoring.
//
// STRENGTH (documented):
//   base       = 0.5·sourceQuality + 0.5·reviewFactor   (reviewFactor Laplace-smoothed)
//   contest    = support / (support + challenges)        (Laplace-smoothed)
//   strength   = base · (0.5 + 0.5·contest)
// =============================================================================

import type {
  EvidenceClaim,
  EvidenceClaimInput,
  EvidenceReview,
  EvidenceReviewDecision,
  EvidenceStrength,
} from './types';

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
function round(n: number, dp = 4): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

/** Create an evidence claim under debate. */
export function createEvidenceClaim(input: EvidenceClaimInput, opts: { now: string }): EvidenceClaim {
  return {
    id: input.id,
    investigationId: input.investigationId,
    contributorId: input.contributorId,
    claim: input.claim,
    sourceRef: input.sourceRef,
    sourceQuality: clamp01(input.sourceQuality ?? 0.5),
    supportCount: 0,
    challengeCount: 0,
    reviewsApproved: 0,
    reviewsRejected: 0,
    createdAt: opts.now,
    updatedAt: opts.now,
  };
}

/** Support an evidence claim (increments support). */
export function supportEvidence(claim: EvidenceClaim, opts: { now: string }): EvidenceClaim {
  return { ...claim, supportCount: claim.supportCount + 1, updatedAt: opts.now };
}

/** Challenge an evidence claim (increments challenges). */
export function challengeEvidence(claim: EvidenceClaim, opts: { now: string }): EvidenceClaim {
  return { ...claim, challengeCount: claim.challengeCount + 1, updatedAt: opts.now };
}

/** Record a human review of an evidence claim, returning the claim + the review. */
export function reviewEvidence(
  claim: EvidenceClaim,
  input: { id: string; reviewerId: string; decision: EvidenceReviewDecision; reason: string },
  opts: { now: string },
): { claim: EvidenceClaim; review: EvidenceReview } {
  const next: EvidenceClaim = {
    ...claim,
    reviewsApproved: claim.reviewsApproved + (input.decision === 'approved' ? 1 : 0),
    reviewsRejected: claim.reviewsRejected + (input.decision === 'rejected' ? 1 : 0),
    updatedAt: opts.now,
  };
  const review: EvidenceReview = {
    id: input.id,
    evidenceClaimId: claim.id,
    reviewerId: input.reviewerId,
    decision: input.decision,
    reason: input.reason,
    createdAt: opts.now,
  };
  return { claim: next, review };
}

/** Score an evidence claim's strength — EXPLAINABLE; never hidden. */
export function scoreEvidenceStrength(claim: EvidenceClaim): EvidenceStrength {
  const sourceQuality = clamp01(claim.sourceQuality);
  const approved = Math.max(0, claim.reviewsApproved);
  const rejected = Math.max(0, claim.reviewsRejected);
  const reviewFactor = (approved + 1) / (approved + rejected + 2); // 0.5 with none.

  const support = Math.max(0, claim.supportCount);
  const challenges = Math.max(0, claim.challengeCount);
  const contest = (support + 1) / (support + challenges + 2); // 0.5 with none.

  const base = 0.5 * sourceQuality + 0.5 * reviewFactor;
  const strength = round(clamp01(base * (0.5 + 0.5 * contest)));

  const explanation: string[] = [
    `Source quality ${Math.round(sourceQuality * 100)}% and review factor ${Math.round(reviewFactor * 100)}% (${approved} approved / ${rejected} rejected) → base ${Math.round(base * 100)}%.`,
    `Contest factor ${Math.round(contest * 100)}% (${support} support / ${challenges} challenges) scales the base → strength ${Math.round(strength * 100)}%.`,
  ];
  const limitations: string[] = [];
  if (support + challenges === 0) limitations.push('No support or challenges yet — contest factor is a neutral 50%.');
  if (approved + rejected === 0) limitations.push('No reviews yet — review factor is a neutral 50%.');
  limitations.push('Evidence strength is advisory and reflects only the recorded debate; it is not proof.');

  return {
    evidenceClaimId: claim.id,
    strength,
    supportCount: support,
    challengeCount: challenges,
    reviewsApproved: approved,
    reviewsRejected: rejected,
    sourceQuality: round(sourceQuality),
    explanation,
    limitations,
  };
}
