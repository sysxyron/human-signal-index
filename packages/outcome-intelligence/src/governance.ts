// =============================================================================
// @hsi/outcome-intelligence — governance.ts
//
// Human-in-the-loop governance over outcomes: build a pending review, transition
// it through decisions, and emit a fully traceable audit trail. NO auto-actions
// — every transition is explicitly applied by a caller (a human). Deterministic.
// =============================================================================

import type {
  ConfidenceLearningEntry,
  GovernanceDecision,
  GovernanceReview,
  OutcomeAuditStep,
  OutcomeEvaluation,
  RecommendationRef,
} from './types';

/** Decisions from which no further transition is expected. */
const TERMINAL: ReadonlySet<GovernanceDecision> = new Set<GovernanceDecision>([
  'approved',
  'rejected',
  'validated',
]);

/** Roles permitted to VALIDATE an outcome. */
const VALIDATOR_ROLES: ReadonlySet<string> = new Set([
  'admin',
  'curator',
  'reviewer',
]);

function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/** Is this decision terminal (no further routine transition expected)? */
export function isTerminal(decision: GovernanceDecision): boolean {
  return TERMINAL.has(decision);
}

/** Can the given role validate an outcome? (admin / curator / reviewer). */
export function canValidate(role: string): boolean {
  return VALIDATOR_ROLES.has(role.toLowerCase());
}

/**
 * Seed a PENDING governance review from an outcome evaluation. The notes
 * summarise the outcome so a human reviewer has the context inline.
 */
export function buildGovernanceReview(
  evaluation: OutcomeEvaluation,
  now: string,
): GovernanceReview {
  const notes =
    `Outcome ${evaluation.outcomeStatus} (score ${evaluation.successScore}/100). ` +
    `Confidence ${round(evaluation.confidenceBefore)} → ${round(evaluation.confidenceAfter)}. ` +
    `Awaiting human review.`;
  return {
    outcomeId: evaluation.recommendationId,
    decisionRunId: evaluation.decisionRunId,
    decision: 'pending',
    notes,
    createdAt: now,
  };
}

/**
 * Apply a governance decision, producing a NEW review object (immutable
 * transition). The caller (a human) owns the decision; this function never
 * decides on its own.
 */
export function applyGovernanceDecision(
  review: GovernanceReview,
  decision: GovernanceDecision,
  opts: { reviewerId?: string; notes?: string; now: string },
): GovernanceReview {
  const prior = review.notes ? `${review.notes} ` : '';
  const transition = `[${review.decision} → ${decision}]`;
  const appended = opts.notes ? ` ${opts.notes}` : '';
  return {
    outcomeId: review.outcomeId,
    decisionRunId: review.decisionRunId,
    decision,
    notes: `${prior}${transition}${appended}`.trim(),
    reviewerId: opts.reviewerId ?? review.reviewerId,
    createdAt: opts.now,
  };
}

/**
 * Build the full traceable audit chain for one recommendation's outcome:
 *   Recommendation → Expected → Observed → Success Score → Confidence Update →
 *   Governance Review. No black box — every step carries a human-readable detail.
 */
export function buildOutcomeAuditTrail(
  rec: RecommendationRef,
  evaluation: OutcomeEvaluation,
  learning: ConfidenceLearningEntry | undefined,
  review: GovernanceReview | undefined,
): OutcomeAuditStep[] {
  const expectedSummary = rec.expectedOutcome
    ? Object.entries(rec.expectedOutcome)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ')
    : `signalDeltaPct=${rec.expectedEffect}`;

  const observedSummary = evaluation.measurements
    .map((m) => `${m.metric}=${round(m.observedValue)}`)
    .join(', ');

  const steps: OutcomeAuditStep[] = [
    {
      step: 'Recommendation',
      detail: `${rec.recommendedAction} (${rec.interventionType}); confidence before ${round(rec.confidenceBefore)}.`,
    },
    {
      step: 'Expected',
      detail: `Predicted effect ${rec.expectedEffect} → ${expectedSummary}.`,
    },
    {
      step: 'Observed',
      detail: observedSummary || 'No observed metrics supplied.',
      at: evaluation.evaluatedAt,
    },
    {
      step: 'Success Score',
      detail: `${evaluation.successScore}/100 → ${evaluation.outcomeStatus}.`,
      at: evaluation.evaluatedAt,
    },
    {
      step: 'Confidence Update',
      detail:
        `${round(evaluation.confidenceBefore)} → ${round(evaluation.confidenceAfter)} ` +
        `(${evaluation.confidenceAdjustment >= 0 ? '+' : ''}${evaluation.confidenceAdjustment})` +
        (learning
          ? `; learned ${learning.interventionType} = ${learning.calibratedConfidence} ` +
            `(${learning.successCount}/${learning.sampleCount}).`
          : '.'),
      at: evaluation.evaluatedAt,
    },
    {
      step: 'Governance Review',
      detail: review
        ? `${review.decision}${review.reviewerId ? ` by ${review.reviewerId}` : ''}` +
          `${review.notes ? `: ${review.notes}` : ''}`
        : 'No review attached yet (pending human action).',
      at: review?.createdAt,
    },
  ];
  return steps;
}
