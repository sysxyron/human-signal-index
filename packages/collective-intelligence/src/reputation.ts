// =============================================================================
// @hsi/collective-intelligence — the CONTRIBUTOR REPUTATION layer.
//
// computeContributorAccuracy / Trust / ContributionQuality / ReviewReliability →
// a composite ContributorScore. EVERY component is explainable (the counts that
// produced it) and carries limitations — NO hidden scoring. Thin samples are
// discounted toward a neutral prior; absent signals default to neutral.
//
// COMPONENTS (each 0..1 unless noted):
//   accuracy           = findings aligned / (aligned + misaligned)   (Laplace)
//   consensusAlignment = same as accuracy (alignment with accepted consensus)
//   reviewQuality      = reviews confirmed / (confirmed + overturned) (Laplace)
//   evidenceQuality    = supplied mean source quality (neutral if absent)
//   trust (0..100)     = blend of the above + baseTrust, sample-discounted
//   overall (0..100)   = the same blend, reported as the headline score
// =============================================================================

import type { ContributorInput, ContributorScore } from './types';

const NEUTRAL = 0.5;
const FULL_CONTRIBUTIONS = 10;

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
function round(n: number, dp = 4): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}
function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/** Laplace-smoothed positive ratio. Returns neutral 0.5 when no data. */
function ratio(pos: number, neg: number): number {
  return (Math.max(0, pos) + 1) / (Math.max(0, pos) + Math.max(0, neg) + 2);
}

/** 0..1 accuracy = consensus alignment of findings. */
export function computeContributorAccuracy(input: ContributorInput): number {
  return round(ratio(input.findingsAligned ?? 0, input.findingsMisaligned ?? 0));
}

/** 0..1 review reliability = reviews confirmed vs overturned. */
export function computeReviewReliability(input: ContributorInput): number {
  return round(ratio(input.reviewsConfirmed ?? 0, input.reviewsOverturned ?? 0));
}

/** 0..1 contribution quality = challenge accuracy + evidence quality blended. */
export function computeContributionQuality(input: ContributorInput): number {
  const challengeAccuracy = ratio(input.challengesUpheld ?? 0, input.challengesRejected ?? 0);
  const evidenceQuality = input.evidenceQuality !== undefined ? clamp01(input.evidenceQuality) : NEUTRAL;
  return round(0.5 * challengeAccuracy + 0.5 * evidenceQuality);
}

/**
 * 0..100 contributor trust — a blend of accuracy, review reliability, contribution
 * quality, and a base trust seed, discounted toward neutral for thin samples.
 */
export function computeContributorTrust(input: ContributorInput): number {
  const accuracy = computeContributorAccuracy(input);
  const reviewQuality = computeReviewReliability(input);
  const quality = computeContributionQuality(input);
  const base = input.baseTrust !== undefined ? clamp01(input.baseTrust / 100) : NEUTRAL;

  const blended = 0.35 * accuracy + 0.25 * reviewQuality + 0.25 * quality + 0.15 * base;

  const contributions = Math.max(0, input.contributionCount ?? 0);
  const weight = clamp01(contributions / FULL_CONTRIBUTIONS);
  const adjusted = NEUTRAL + (blended - NEUTRAL) * weight;
  return round(clamp01(adjusted) * 100, 2);
}

/** The full, explainable contributor score. */
export function computeContributorScore(input: ContributorInput): ContributorScore {
  const accuracy = computeContributorAccuracy(input);
  const reviewQuality = computeReviewReliability(input);
  const quality = computeContributionQuality(input);
  const evidenceQuality = input.evidenceQuality !== undefined ? clamp01(input.evidenceQuality) : NEUTRAL;
  const trust = computeContributorTrust(input);
  const overall = trust;

  const contributions = Math.max(0, input.contributionCount ?? 0);

  const explanation: string[] = [
    `Accuracy ${pct(accuracy)} from ${input.findingsAligned ?? 0} aligned / ${input.findingsMisaligned ?? 0} misaligned findings.`,
    `Review reliability ${pct(reviewQuality)} from ${input.reviewsConfirmed ?? 0} confirmed / ${input.reviewsOverturned ?? 0} overturned reviews.`,
    `Contribution quality ${pct(quality)} (challenge accuracy + evidence quality ${pct(evidenceQuality)}).`,
    `Trust ${trust}/100 = weighted blend, discounted by sample ${contributions}/${FULL_CONTRIBUTIONS}.`,
  ];
  const limitations: string[] = [];
  if (contributions < FULL_CONTRIBUTIONS) {
    limitations.push(`Only ${contributions} contribution(s) (below the ${FULL_CONTRIBUTIONS} floor); the score is pulled toward neutral.`);
  }
  if (input.evidenceQuality === undefined) limitations.push('No evidence-quality signal supplied — defaulted to a neutral 50%.');
  if (input.baseTrust === undefined) limitations.push('No base trust seed supplied — defaulted to a neutral 50%.');
  limitations.push('Contributor reputation is advisory and based only on recorded contributions; it is not a verdict on the person.');

  return {
    contributorId: input.contributorId,
    accuracy,
    trust,
    reviewQuality,
    consensusAlignment: accuracy,
    evidenceQuality: round(evidenceQuality),
    overall,
    explanation,
    limitations,
  };
}
