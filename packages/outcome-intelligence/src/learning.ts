// =============================================================================
// @hsi/outcome-intelligence — learning.ts
//
// learnFromOutcomes(): aggregate OutcomeEvaluations BY interventionType into a
// learned confidence per type. Repeated success RAISES the calibrated
// confidence; repeated failure LOWERS it. Pure & deterministic.
//
// CONFIDENCE-LEARNING HEURISTIC (Bayesian-ish, documented):
//   For each intervention type we observe N samples with an empirical success
//   rate p = successCount / N (success = successful | partially_successful).
//   We blend a PRIOR confidence with that empirical rate using a pseudo-count K
//   (= PRIOR_WEIGHT), so:
//
//       calibratedConfidence = (PRIOR_WEIGHT·prior + N·p) / (PRIOR_WEIGHT + N)
//
//   - With few samples the prior dominates (stable, humble).
//   - As N grows, the observed success rate dominates (learning).
//   - Repeated success (p→1) pulls confidence UP toward ~1; repeated failure
//     (p→0) pulls it DOWN toward ~0. Bounded to [0.02, 0.95] — never certainty.
//   The prior is the priorLearning entry's calibratedConfidence when merging
//   incrementally, else BASE_PRIOR.
// =============================================================================

import type { ConfidenceLearningEntry, OutcomeEvaluation } from './types';

/** Pseudo-count weight on the prior (samples needed to half-override it). */
const PRIOR_WEIGHT = 3;
/** Default prior success-confidence with no history. */
const BASE_PRIOR = 0.5;
const CONF_FLOOR = 0.02;
const CONF_CEIL = 0.95;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function isSuccess(s: OutcomeEvaluation['outcomeStatus']): boolean {
  return s === 'successful' || s === 'partially_successful';
}

interface Acc {
  sampleCount: number;
  successCount: number;
  scoreSum: number;
}

/**
 * Aggregate evaluations by interventionType and learn a calibrated confidence.
 * When `priorLearning` is supplied, the new evidence is folded INCREMENTALLY
 * onto the prior counts (so confidence accumulates across calls) and the prior's
 * calibratedConfidence seeds the blend baseline.
 */
export function learnFromOutcomes(
  evaluations: OutcomeEvaluation[],
  priorLearning: ConfidenceLearningEntry[] | undefined,
  now: string,
): ConfidenceLearningEntry[] {
  void now; // accepted for signature symmetry / determinism contract; not used.

  const priorByType = new Map<string, ConfidenceLearningEntry>();
  for (const p of priorLearning ?? []) priorByType.set(p.interventionType, p);

  // We need interventionType per evaluation. Evaluations don't carry it directly,
  // so callers group by the recommendation; here we read it from a side channel:
  // the evaluation's measurements don't hold type, so we rely on the caller
  // passing evaluations already keyed via the (recommendationId) → but to keep
  // this pure and self-contained we aggregate by the `interventionType` attached
  // through the evaluation extension below.
  const groups = new Map<string, Acc>();
  for (const ev of evaluations) {
    const type = evaluationInterventionType(ev);
    const acc = groups.get(type) ?? { sampleCount: 0, successCount: 0, scoreSum: 0 };
    acc.sampleCount += 1;
    if (isSuccess(ev.outcomeStatus)) acc.successCount += 1;
    acc.scoreSum += ev.successScore;
    groups.set(type, acc);
  }

  // Union of types seen now + types only present in the prior (carried forward).
  const allTypes = new Set<string>([...groups.keys(), ...priorByType.keys()]);

  const out: ConfidenceLearningEntry[] = [];
  for (const type of [...allTypes].sort()) {
    const prior = priorByType.get(type);
    const fresh = groups.get(type);

    // Incremental counts: prior counts + this batch.
    const priorSamples = prior?.sampleCount ?? 0;
    const priorSuccesses = prior?.successCount ?? 0;
    const priorScoreSum = prior ? prior.avgSuccessScore * prior.sampleCount : 0;

    const sampleCount = priorSamples + (fresh?.sampleCount ?? 0);
    const successCount = priorSuccesses + (fresh?.successCount ?? 0);
    const scoreSum = priorScoreSum + (fresh?.scoreSum ?? 0);

    const avgSuccessScore = sampleCount > 0 ? round(scoreSum / sampleCount, 1) : 0;

    // Empirical success rate over ALL observed samples for this type.
    const p = sampleCount > 0 ? successCount / sampleCount : BASE_PRIOR;
    const priorBaseline = prior?.calibratedConfidence ?? BASE_PRIOR;

    const blended =
      (PRIOR_WEIGHT * priorBaseline + sampleCount * p) / (PRIOR_WEIGHT + sampleCount);
    const calibratedConfidence = round(clamp(blended, CONF_FLOOR, CONF_CEIL), 4);
    const adjustment = round(calibratedConfidence - priorBaseline, 4);

    const dir =
      adjustment > 0.0001 ? 'raised' : adjustment < -0.0001 ? 'lowered' : 'held';
    const rationale =
      sampleCount === 0
        ? `No samples for ${type}; confidence held at baseline ${priorBaseline}.`
        : `${successCount}/${sampleCount} successes over ${sampleCount} samples ` +
          `(avg score ${avgSuccessScore}) → confidence ${dir} to ${calibratedConfidence}` +
          (prior ? ` from prior ${priorBaseline}.` : `.`);

    out.push({
      interventionType: type,
      sampleCount,
      successCount,
      avgSuccessScore,
      calibratedConfidence,
      adjustment,
      rationale,
    });
  }
  return out;
}

/** Look up the learned confidence for an intervention type, if known. */
export function calibratedConfidenceFor(
  interventionType: string,
  learning: ConfidenceLearningEntry[],
): number | undefined {
  const hit = learning.find((l) => l.interventionType === interventionType);
  return hit?.calibratedConfidence;
}

// ---------------------------------------------------------------------------
// OutcomeEvaluation's public shape (fixed by spec) carries no interventionType,
// so we maintain a deterministic side map keyed by recommendationId. evaluate
// → tag → learn keeps the value, and because the key is the recommendationId
// (not object identity) it survives copies/serialization within a process.
// ---------------------------------------------------------------------------

const TYPE_TAG = new Map<string, string>();

/** Tag an evaluation's recommendation with the interventionType that produced it. */
export function tagInterventionType(
  ev: OutcomeEvaluation,
  interventionType: string,
): OutcomeEvaluation {
  TYPE_TAG.set(ev.recommendationId, interventionType);
  return ev;
}

/**
 * Resolve the interventionType for an evaluation. Falls back to a stable label
 * derived from the decisionRunId when untagged, so grouping is still
 * deterministic (untagged batches simply group by run).
 */
export function evaluationInterventionType(ev: OutcomeEvaluation): string {
  return TYPE_TAG.get(ev.recommendationId) ?? `run:${ev.decisionRunId}`;
}
