// =============================================================================
// @hsi/outcome-intelligence — outcome.ts
//
// evaluateOutcome(): compare a recommendation's EXPECTED effect against the
// ACTUAL observed data, score success 0..100, classify status, and update
// confidence with a bounded adjustment. Pure & deterministic.
//
// SUCCESS-SCORING HEURISTIC (documented, no black box):
//   base 50 (= no information / neutral baseline).
//   + a DIRECTION term: +35 when the dominant observed change shares the
//     predicted sign, −40 when it moves the opposite way. (Wrong direction is
//     penalised harder than right direction is rewarded — a backfire is worse
//     than a non-event.)
//   + a MAGNITUDE term within the right direction: up to +15 scaled by how close
//     the observed magnitude came to the predicted magnitude (ratio capped 0..1).
//   + a COVERAGE term: per-metric agreement (`withinExpectation`) nudges ±, so
//     multi-metric corroboration raises the score and mixed signals pull it to
//     the neutral band.
//   Result clamped 0..100.
//
// CONFIDENCE UPDATE: confidenceAfter = clamp(confidenceBefore + adjustment),
//   adjustment = decisiveness × directionalSign × MAX_STEP, where decisiveness
//   grows with |successScore − 50| (how far from "no information" the outcome
//   was) and shrinks toward 0 on thin/inconclusive data. Clamped to (0, 0.99] —
//   NEVER 1.0, never < 0.
// =============================================================================

import {
  compareExpectedVsActual,
  expectedMetricsFor,
} from './measurement';
import type {
  ObservedData,
  OutcomeEvaluation,
  OutcomeStatus,
  RecommendationRef,
} from './types';

/** Largest single-step confidence move an outcome can produce. */
const MAX_CONFIDENCE_STEP = 0.2;
/** Hard upper bound on confidence — never certainty. */
const CONFIDENCE_CEIL = 0.99;
const CONFIDENCE_FLOOR = 0;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/** How much observed data we actually have to work with. */
function dataPoints(observed: ObservedData): number {
  let n = 0;
  if (observed.signalDeltaPct !== undefined) n++;
  if (observed.amplificationDelta !== undefined) n++;
  if (observed.communityDelta !== undefined) n++;
  if (observed.forecastState !== undefined) n++;
  if (observed.metrics) n += Object.keys(observed.metrics).length;
  return n;
}

/**
 * Evaluate one recommendation's outcome against observed reality.
 */
export function evaluateOutcome(
  rec: RecommendationRef,
  observed: ObservedData,
  now: string,
): OutcomeEvaluation {
  const expected = expectedMetricsFor(rec);
  const { directionMatch, magnitudeRatio, measurements } =
    compareExpectedVsActual(rec, observed);

  const points = dataPoints(observed);
  const explanation: string[] = [];
  const limitations: string[] = [];

  // --- INCONCLUSIVE: not enough observed data to judge. ----------------------
  const thin = points === 0;
  const expectedSign =
    Math.abs(rec.expectedEffect) <= 1 ? 0 : rec.expectedEffect > 0 ? 1 : -1;

  // --- SUCCESS SCORE ---------------------------------------------------------
  let successScore: number;
  if (thin) {
    successScore = 50; // no information → neutral midpoint, but flagged inconclusive
  } else {
    let score: number;
    if (expectedSign === 0) {
      // Predicted NO net movement → success when the world stayed flat.
      score = directionMatch ? 80 : 15;
    } else if (directionMatch) {
      // Right direction: score is driven by HOW MUCH of the predicted effect
      // actually materialised. ratio 0 (right way but no movement) → 25
      // (neutral non-event); ratio ~0.77 → 75 (successful); ratio ≥1 → 90.
      const closeness = clamp(magnitudeRatio, 0, 1);
      score = 25 + 65 * closeness;
    } else {
      score = 10; // backfired / wrong direction
    }
    // Coverage term: per-metric corroboration nudges ±5 (mixed signals pull down).
    if (measurements.length > 1) {
      const within = measurements.filter((m) => m.withinExpectation).length;
      const frac = within / measurements.length;
      score += (frac - 0.5) * 10;
    }
    successScore = clamp(round(score, 1), 0, 100);
  }

  // --- STATUS ----------------------------------------------------------------
  let outcomeStatus: OutcomeStatus;
  if (thin || points < 1) {
    outcomeStatus = 'inconclusive';
  } else if (!directionMatch && expectedSign !== 0) {
    // Wrong direction is always a failure regardless of the residual score.
    outcomeStatus = 'unsuccessful';
  } else if (successScore >= 75) {
    outcomeStatus = 'successful';
  } else if (successScore >= 50) {
    outcomeStatus = 'partially_successful';
  } else if (successScore < 25) {
    outcomeStatus = 'unsuccessful';
  } else {
    // 25..49, right direction but weak / mixed → neutral.
    outcomeStatus = 'neutral';
  }

  // --- CONFIDENCE UPDATE -----------------------------------------------------
  // decisiveness: 0 at the neutral midpoint, 1 at the extremes; damped when thin.
  let decisiveness = Math.abs(successScore - 50) / 50; // 0..1
  if (outcomeStatus === 'inconclusive') decisiveness *= 0.15;
  else if (outcomeStatus === 'neutral') decisiveness *= 0.5;
  const directionalSign = successScore >= 50 ? 1 : -1;
  const rawAdjustment = directionalSign * decisiveness * MAX_CONFIDENCE_STEP;

  const confidenceBefore = clamp(rec.confidenceBefore, 0, 1);
  const confidenceAfter = clamp(
    round(confidenceBefore + rawAdjustment, 4),
    CONFIDENCE_FLOOR,
    CONFIDENCE_CEIL,
  );
  const confidenceAdjustment = round(confidenceAfter - confidenceBefore, 4);

  // --- EXPLANATION (references the REAL deltas) ------------------------------
  explanation.push(
    `Recommendation "${rec.recommendedAction}" (${rec.interventionType}) predicted ` +
      `effect ${rec.expectedEffect >= 0 ? '+' : ''}${rec.expectedEffect}.`,
  );
  if (thin) {
    explanation.push('No observed metrics were supplied for the observation window.');
  } else {
    for (const m of measurements) {
      explanation.push(
        `${m.metric}: expected ${round(m.expectedValue, 2)}, observed ` +
          `${round(m.observedValue, 2)} (Δ ${round(m.delta, 2)}) — ` +
          `${m.withinExpectation ? 'within' : 'outside'} expectation.`,
      );
    }
    explanation.push(
      `Observed change ${directionMatch ? 'matched' : 'did NOT match'} the predicted ` +
        `direction; magnitude ratio ${round(magnitudeRatio, 2)}.`,
    );
    if (observed.forecastState !== undefined) {
      explanation.push(`Forecast state at end of window: ${observed.forecastState}.`);
    }
  }
  explanation.push(
    `Success score ${successScore}/100 → ${outcomeStatus}; confidence ` +
      `${round(confidenceBefore, 2)} → ${round(confidenceAfter, 2)} ` +
      `(${confidenceAdjustment >= 0 ? '+' : ''}${confidenceAdjustment}).`,
  );

  // --- LIMITATIONS (ALWAYS present) ------------------------------------------
  limitations.push(
    'Single observation window — outcome may be confounded by exogenous events ' +
      'not attributable to the recommendation.',
  );
  limitations.push(
    'This is one sample; the confidence update is bounded and should not be read ' +
      'as proof the intervention caused the change.',
  );
  if (thin) {
    limitations.push(
      'Insufficient observed data — outcome is INCONCLUSIVE and confidence was ' +
        'barely adjusted.',
    );
  } else if (points === 1) {
    limitations.push('Only one observed metric — limited corroboration.');
  }
  if (rec.expectedOutcome === undefined) {
    limitations.push(
      'No explicit expectedOutcome supplied; expectation derived from the signed ' +
        'expectedEffect only.',
    );
  }

  return {
    recommendationId: rec.recommendationId,
    decisionRunId: rec.decisionRunId,
    successScore,
    outcomeStatus,
    confidenceBefore: round(confidenceBefore, 4),
    confidenceAfter,
    confidenceAdjustment,
    measurements,
    explanation,
    limitations,
    evaluatedAt: now,
  };
}
