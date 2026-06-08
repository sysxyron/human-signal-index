// =============================================================================
// @hsi/source-intelligence — source reliability scoring (Phase 9).
//
// computeSourceReliability rates how dependable a SOURCE has proven to be, as a
// 0..100 score + a tier, with an explainable rationale. Reliability RISES with:
//   * captureSuccessRate    — fraction of captures that succeeded,
//   * reviewedApprovedRate   — fraction of human-reviewed items approved,
//   * signalCount            — track-record volume (saturating),
//   * ageDays                — longevity (saturating);
// and FALLS with:
//   * blockedRate            — fraction of captures blocked (anti-bot/policy),
//   * contradictionRate      — fraction of signals contradicted by evidence.
//
// Pure & deterministic — no clocks, no randomness. This is a TRIAGE aid that
// informs human reviewers; it is never a verdict and never auto-actioned. Where
// human-review inputs are absent the score stays conservative ('unproven').
// =============================================================================

import { clamp, round } from './internal/text';

export type ReliabilityTier = 'high' | 'medium' | 'low' | 'unproven';

export interface ReliabilityInput {
  sourceId: string;
  /** 0..1 fraction of capture attempts that succeeded. */
  captureSuccessRate: number;
  /** 0..1 fraction of attempts blocked (anti-bot/policy). Default 0. */
  blockedRate?: number;
  /** Number of signals captured from this source (track record). */
  signalCount: number;
  /** 0..1 fraction of human-reviewed items approved. Undefined = no reviews yet. */
  reviewedApprovedRate?: number;
  /** 0..1 fraction of signals later contradicted by evidence. Default 0. */
  contradictionRate?: number;
  /** Age of the source in days (longevity). Default 0. */
  ageDays?: number;
}

export interface ReliabilityScore {
  sourceId: string;
  /** 0..100 composite reliability. */
  reliabilityScore: number;
  tier: ReliabilityTier;
  rationale: string;
}

/** Below this signal count (and with no reviews) a source is 'unproven'. */
export const UNPROVEN_SIGNAL_FLOOR = 3;

/**
 * Compute a source's reliability score + tier. Pure & deterministic; clamps all
 * inputs into their valid ranges so out-of-range data never produces NaN.
 */
export function computeSourceReliability(input: ReliabilityInput): ReliabilityScore {
  const success = clamp(input.captureSuccessRate, 0, 1);
  const blocked = clamp(input.blockedRate ?? 0, 0, 1);
  const approved = input.reviewedApprovedRate === undefined ? undefined : clamp(input.reviewedApprovedRate, 0, 1);
  const contradiction = clamp(input.contradictionRate ?? 0, 0, 1);
  const signalCount = Math.max(0, Math.floor(input.signalCount));
  const ageDays = Math.max(0, input.ageDays ?? 0);

  // Saturating track-record terms.
  const volume = clamp(signalCount / 50, 0, 1); // ~50 signals → full credit
  const age = clamp(ageDays / 180, 0, 1); // ~6 months → full credit

  // Positive contributions (weights sum to 100 before penalties).
  //   capture success 35, approved-review 30, volume 20, age 15.
  // When no human review exists yet, redistribute that weight to capture+volume
  // (we can't credit approval we don't have) and keep the source conservative.
  let positive: number;
  if (approved === undefined) {
    positive = success * 50 + volume * 35 + age * 15;
  } else {
    positive = success * 35 + approved * 30 + volume * 20 + age * 15;
  }

  // Penalties: blocked + contradiction erode reliability sharply.
  const penalty = blocked * 35 + contradiction * 45;

  let score = round(clamp(positive - penalty, 0, 100));

  // Tiering. 'unproven' dominates when there's too little evidence to judge.
  let tier: ReliabilityTier;
  if (approved === undefined && signalCount < UNPROVEN_SIGNAL_FLOOR) {
    tier = 'unproven';
    // Cap an unproven source's headline score so it can't read as trusted.
    score = Math.min(score, 49);
  } else if (score >= 70) {
    tier = 'high';
  } else if (score >= 45) {
    tier = 'medium';
  } else {
    tier = 'low';
  }

  const parts: string[] = [
    `capture success ${round(success * 100)}%`,
    approved === undefined ? 'no human reviews yet' : `approved-review ${round(approved * 100)}%`,
    `${signalCount} signal(s)`,
    `age ${ageDays}d`,
  ];
  if (blocked > 0) parts.push(`blocked ${round(blocked * 100)}%`);
  if (contradiction > 0) parts.push(`contradicted ${round(contradiction * 100)}%`);

  const rationale = `Source "${input.sourceId}" reliability ${score}/100 (${tier}): ${parts.join(', ')}.`;

  return { sourceId: input.sourceId, reliabilityScore: score, tier, rationale };
}
