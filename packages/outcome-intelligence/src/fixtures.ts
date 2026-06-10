// =============================================================================
// @hsi/outcome-intelligence — fixtures.ts
//
// Deterministic, offline demo data + an end-to-end driver. Covers every
// OutcomeStatus, an intervention that repeatedly SUCCEEDS (confidence rises) and
// one that repeatedly FAILS (confidence falls), every alert type, and a full
// governance flow (pending → validated). No clocks, no randomness.
// =============================================================================

import { detectOutcomeAlerts } from './alerts';
import {
  applyGovernanceDecision,
  buildGovernanceReview,
  buildOutcomeAuditTrail,
} from './governance';
import {
  calibratedConfidenceFor,
  learnFromOutcomes,
  tagInterventionType,
} from './learning';
import { evaluateOutcome } from './outcome';
import type {
  ConfidenceLearningEntry,
  GovernanceReview,
  NarrativeSnapshot,
  ObservedData,
  OutcomeAlert,
  OutcomeAuditStep,
  OutcomeEvaluation,
  RecommendationRef,
} from './types';

/** Fixed injected "now" used throughout the demo. */
export const FIXTURE_NOW = '2026-06-01T00:00:00.000Z';

/** A small set of recommendations covering each OutcomeStatus + repeat patterns. */
export const DEMO_RECOMMENDATIONS: RecommendationRef[] = [
  // SUCCESSFUL — dampening predicted and dampening observed (right dir, ~full mag).
  {
    recommendationId: 'rec-success',
    decisionRunId: 'run-A',
    interventionType: 'reduce_amplification',
    recommendedAction: 'Reduce amplification on the rising narrative',
    expectedEffect: -40,
    confidenceBefore: 0.6,
    expectedOutcome: { signalDeltaPct: -40, amplificationDelta: -15 },
  },
  // PARTIALLY_SUCCESSFUL — right direction but undershoots magnitude.
  {
    recommendationId: 'rec-partial',
    decisionRunId: 'run-B',
    interventionType: 'remove_source',
    recommendedAction: 'Remove the top amplifying source',
    expectedEffect: -40,
    confidenceBefore: 0.55,
    expectedOutcome: { signalDeltaPct: -40 },
  },
  // NEUTRAL — right direction but very weak / mixed.
  {
    recommendationId: 'rec-neutral',
    decisionRunId: 'run-C',
    interventionType: 'remove_contradiction',
    recommendedAction: 'Remove a contradiction to stabilise',
    expectedEffect: -40,
    confidenceBefore: 0.5,
    expectedOutcome: { signalDeltaPct: -40, amplificationDelta: 10 },
  },
  // UNSUCCESSFUL — predicted dampening, narrative grew instead (backfire).
  {
    recommendationId: 'rec-fail',
    decisionRunId: 'run-D',
    interventionType: 'remove_community',
    recommendedAction: 'Remove a bridging community',
    expectedEffect: -40,
    confidenceBefore: 0.75,
    expectedOutcome: { signalDeltaPct: -40 },
  },
  // INCONCLUSIVE — thin data.
  {
    recommendationId: 'rec-thin',
    decisionRunId: 'run-E',
    interventionType: 'add_source',
    recommendedAction: 'Add a corrective source',
    expectedEffect: 30,
    confidenceBefore: 0.5,
  },
];

/** Observed data aligned 1:1 (by index) with DEMO_RECOMMENDATIONS. */
export const DEMO_OBSERVED: ObservedData[] = [
  // success: dampened ~as predicted.
  {
    signalDeltaPct: -42,
    amplificationDelta: -16,
    forecastState: 'declining',
    capturedAt: FIXTURE_NOW,
  },
  // partial: dampened but only half as much.
  { signalDeltaPct: -18, capturedAt: FIXTURE_NOW },
  // neutral: barely moved, amplification crept the wrong way.
  { signalDeltaPct: -6, amplificationDelta: 12, capturedAt: FIXTURE_NOW },
  // fail: predicted down, went UP.
  { signalDeltaPct: 35, capturedAt: FIXTURE_NOW },
  // inconclusive: nothing observed.
  { capturedAt: FIXTURE_NOW },
];

/**
 * Repeated-SUCCESS series for one intervention type → calibrated confidence
 * should RISE across the batch.
 */
export const DEMO_REPEAT_SUCCESS: RecommendationRef[] = [0, 1, 2, 3].map((i) => ({
  recommendationId: `winner-${i}`,
  decisionRunId: `winner-run-${i}`,
  interventionType: 'reduce_amplification',
  recommendedAction: 'Reduce amplification (repeated)',
  expectedEffect: -40,
  confidenceBefore: 0.5,
  expectedOutcome: { signalDeltaPct: -40 },
}));
export const DEMO_REPEAT_SUCCESS_OBSERVED: ObservedData[] = [0, 1, 2, 3].map(() => ({
  signalDeltaPct: -41,
  capturedAt: FIXTURE_NOW,
}));

/**
 * Repeated-FAILURE series for one intervention type → calibrated confidence
 * should FALL across the batch.
 */
export const DEMO_REPEAT_FAIL: RecommendationRef[] = [0, 1, 2, 3].map((i) => ({
  recommendationId: `loser-${i}`,
  decisionRunId: `loser-run-${i}`,
  interventionType: 'increase_contradiction',
  recommendedAction: 'Inject contradiction (repeated)',
  expectedEffect: -40,
  confidenceBefore: 0.5,
  expectedOutcome: { signalDeltaPct: -40 },
}));
export const DEMO_REPEAT_FAIL_OBSERVED: ObservedData[] = [0, 1, 2, 3].map(() => ({
  signalDeltaPct: 38,
  capturedAt: FIXTURE_NOW,
}));

/** Snapshots demonstrating narrative_spike AND resurgence. */
export const DEMO_SNAPSHOTS: NarrativeSnapshot[] = [
  snap('nar-spike', '2026-05-01T00:00:00.000Z', 100, 40),
  snap('nar-spike', '2026-05-08T00:00:00.000Z', 60, 35), // decline
  snap('nar-spike', '2026-05-15T00:00:00.000Z', 55, 30), // trough
  snap('nar-spike', '2026-05-22T00:00:00.000Z', 130, 70), // spike + resurgence
];

function snap(
  narrativeId: string,
  capturedAt: string,
  signalCount: number,
  amplificationScore: number,
): NarrativeSnapshot {
  return {
    id: `${narrativeId}@${capturedAt}`,
    narrativeId,
    capturedAt,
    signalCount,
    sourceCount: Math.max(1, Math.round(signalCount / 10)),
    communityCount: Math.max(1, Math.round(signalCount / 25)),
    amplificationScore,
    reliabilityScore: 50,
    supportRatio: 0.6,
    contradictionRatio: 0.2,
  };
}

/** Forecast that missed. */
export const DEMO_FORECASTS = [
  { predicted: 'declining', actual: 'declining' },
  { predicted: 'stable', actual: 'surging' },
];

/** A security signal to exercise security_anomaly. */
export const DEMO_SECURITY = [{ type: 'coordinated_inauthentic_behavior', severity: 'high' }];

/** The full output bundle of the offline demo. */
export interface OutcomeDemo {
  evaluations: OutcomeEvaluation[];
  repeatSuccessLearning: ConfidenceLearningEntry[];
  repeatFailLearning: ConfidenceLearningEntry[];
  mergedLearning: ConfidenceLearningEntry[];
  alerts: OutcomeAlert[];
  review: GovernanceReview;
  validatedReview: GovernanceReview;
  auditTrail: OutcomeAuditStep[];
  winnerConfidence: number | undefined;
  loserConfidence: number | undefined;
}

/**
 * Run the entire chain offline: evaluate → measure → learn → alerts →
 * governance → audit. Pure & deterministic — same output every call.
 */
export function outcomeDemo(): OutcomeDemo {
  // 1. Evaluate each demo recommendation against its observed data.
  const evaluations = DEMO_RECOMMENDATIONS.map((rec, i) =>
    tagInterventionType(
      evaluateOutcome(rec, DEMO_OBSERVED[i], FIXTURE_NOW),
      rec.interventionType,
    ),
  );

  // 2a. Learn from a repeated-success batch (confidence should rise).
  const successEvals = DEMO_REPEAT_SUCCESS.map((rec, i) =>
    tagInterventionType(
      evaluateOutcome(rec, DEMO_REPEAT_SUCCESS_OBSERVED[i], FIXTURE_NOW),
      rec.interventionType,
    ),
  );
  const repeatSuccessLearning = learnFromOutcomes(successEvals, undefined, FIXTURE_NOW);

  // 2b. Learn from a repeated-failure batch (confidence should fall).
  const failEvals = DEMO_REPEAT_FAIL.map((rec, i) =>
    tagInterventionType(
      evaluateOutcome(rec, DEMO_REPEAT_FAIL_OBSERVED[i], FIXTURE_NOW),
      rec.interventionType,
    ),
  );
  const repeatFailLearning = learnFromOutcomes(failEvals, undefined, FIXTURE_NOW);

  // 2c. Merge everything incrementally onto the per-recommendation evaluations.
  const seeded = learnFromOutcomes(evaluations, undefined, FIXTURE_NOW);
  const mergedLearning = learnFromOutcomes(
    [...successEvals, ...failEvals],
    seeded,
    FIXTURE_NOW,
  );

  const winnerConfidence = calibratedConfidenceFor(
    'reduce_amplification',
    repeatSuccessLearning,
  );
  const loserConfidence = calibratedConfidenceFor(
    'increase_contradiction',
    repeatFailLearning,
  );

  // 3. Alerts across every source (exercises every alert type).
  const alerts = detectOutcomeAlerts({
    evaluations,
    learning: repeatFailLearning,
    snapshots: DEMO_SNAPSHOTS,
    forecasts: DEMO_FORECASTS,
    securitySignals: DEMO_SECURITY,
    now: FIXTURE_NOW,
  });

  // 4. Governance flow: pending → validated.
  const review = buildGovernanceReview(evaluations[0], FIXTURE_NOW);
  const validatedReview = applyGovernanceDecision(review, 'validated', {
    reviewerId: 'curator-1',
    notes: 'Outcome confirmed against observed signal decline.',
    now: FIXTURE_NOW,
  });

  // 5. Full audit trail for the first recommendation.
  const auditTrail = buildOutcomeAuditTrail(
    DEMO_RECOMMENDATIONS[0],
    evaluations[0],
    mergedLearning.find((l) => l.interventionType === 'reduce_amplification'),
    validatedReview,
  );

  return {
    evaluations,
    repeatSuccessLearning,
    repeatFailLearning,
    mergedLearning,
    alerts,
    review,
    validatedReview,
    auditTrail,
    winnerConfidence,
    loserConfidence,
  };
}
