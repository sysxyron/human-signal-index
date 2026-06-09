// =============================================================================
// @hsi/decision-intelligence — intervention ranking.
//
// rankInterventions estimates, for EACH candidate InterventionType, the signed
// effect it would have on the narrative's trajectory by running it through the
// counterfactual engine and reading the deltas, plus a riskScore and confidence.
// Candidates are sorted by a DOCUMENTED score and assigned a rankPosition.
//
// SCORING (documented):
//   expectedEffect ∈ [−100, 100]  — signed trajectory effect. Derived from the
//     counterfactual deltas: a blend of growthDeltaPct (clamped) and the
//     amplification delta, sign-preserved. Negative = dampens, positive = amplifies.
//   riskScore ∈ [0, 100]          — base risk by aggressiveness/upstream-ness of
//     the scenario + a penalty for low confidence + a penalty for large |effect|.
//   confidence ∈ [0, 1]           — the counterfactual's own confidence.
//   score = (|expectedEffect| × confidence) ÷ (1 + riskScore/100)
//     → high-magnitude, high-confidence, low-risk interventions rank first.
//
// NEVER certainty — every ranking carries reasoning and the underlying confidence.
// Deterministic; caller injects `now`.
// =============================================================================

import { generateCounterfactual } from '@hsi/counterfactual-engine';
import type { CounterfactualInput, ScenarioType } from '@hsi/counterfactual-engine';

import { eventTypeLabel } from './sensitivity';
import type { DecisionInput, InterventionRanking, InterventionType } from './types';

/** The full catalogue of intervention types, in deterministic order. */
export const ALL_INTERVENTIONS: InterventionType[] = [
  'remove_event',
  'delay_event',
  'accelerate_event',
  'reduce_amplification',
  'increase_amplification',
  'remove_source',
  'add_source',
  'remove_community',
  'increase_reliability',
  'decrease_reliability',
  'remove_contradiction',
  'increase_contradiction',
];

/**
 * Base risk (0..100) by how AGGRESSIVE / structurally upstream an intervention
 * is. Removing a load-bearing upstream event (source/community) is riskier than
 * a downstream nudge; "no-op-ish" reads are low risk.
 */
const BASE_RISK: Record<ScenarioType, number> = {
  remove_event: 60,
  delay_event: 40,
  accelerate_event: 45,
  reduce_amplification: 35,
  increase_amplification: 55,
  remove_source: 65,
  add_source: 50,
  remove_community: 60,
  increase_reliability: 30,
  decrease_reliability: 55,
  remove_contradiction: 45,
  increase_contradiction: 50,
};

function round(n: number, dp = 1): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

function toCfInput(input: DecisionInput): CounterfactualInput {
  return {
    narrativeId: input.narrativeId,
    snapshots: input.snapshots,
    evolution: input.evolution,
    events: input.events,
    forecast: input.forecast,
    now: input.now,
  };
}

/**
 * Signed expected effect from the counterfactual deltas. We blend the growth
 * delta (capped) with the amplification delta (scaled), preserving sign. A
 * counterfactual that slows growth yields a negative effect; one that boosts it
 * yields positive. Range clamped to [−100, 100].
 */
export function effectFromDeltas(d: {
  growthDeltaPct: number;
  amplificationDelta: number;
  signalDeltaPct: number;
}): number {
  const growth = clamp(d.growthDeltaPct, -100, 100);
  const signal = clamp(d.signalDeltaPct, -100, 100);
  const amp = clamp(d.amplificationDelta, -100, 100);
  // Weighted blend: growth + signal dominate, amplification is a supporting cue.
  const blended = growth * 0.5 + signal * 0.3 + amp * 0.2;
  return round(clamp(blended, -100, 100), 1);
}

/**
 * Rank every candidate intervention for a narrative. Deterministic; caller
 * injects `now`. The returned array is sorted by the documented score (best
 * first) with rankPosition assigned 1..N.
 */
export function rankInterventions(
  input: DecisionInput,
  now: string,
): InterventionRanking[] {
  const cfInput = toCfInput(input);

  const scored = ALL_INTERVENTIONS.map((type) => {
    const cf = generateCounterfactual(cfInput, { type }, now);
    const expectedEffect = effectFromDeltas(cf.deltas);
    const confidence = cf.confidence;

    // Risk: base aggressiveness + low-confidence penalty + magnitude penalty.
    const lowConfPenalty = (1 - clamp(confidence, 0, 1)) * 25; // up to +25
    const magnitudePenalty = (Math.abs(expectedEffect) / 100) * 15; // up to +15
    const riskScore = round(
      clamp(BASE_RISK[type] + lowConfPenalty + magnitudePenalty, 0, 100),
      1,
    );

    // Documented score: magnitude × confidence, discounted by risk.
    const score =
      (Math.abs(expectedEffect) * confidence) / (1 + riskScore / 100);

    const targetTypes = cf.changes.map((c) => eventTypeLabel(c.eventType));
    const dir =
      expectedEffect < 0
        ? 'dampens'
        : expectedEffect > 0
          ? 'amplifies'
          : 'leaves unchanged';
    const reasoning =
      `${type}: estimated to ${dir} the trajectory ` +
      `(effect ${expectedEffect >= 0 ? '+' : ''}${expectedEffect}, risk ${riskScore}/100, ` +
      `confidence ${Math.round(confidence * 100)}%). ` +
      (targetTypes.length > 0
        ? `Targets ${targetTypes.join(', ')}. `
        : 'No matching causal event — speculative. ') +
      'Estimate only; never certainty.';

    return {
      ranking: {
        interventionType: type,
        expectedEffect,
        riskScore,
        confidence,
        rankPosition: 0,
        reasoning,
      } as InterventionRanking,
      score,
    };
  });

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      b.ranking.confidence - a.ranking.confidence ||
      a.ranking.riskScore - b.ranking.riskScore ||
      a.ranking.interventionType.localeCompare(b.ranking.interventionType),
  );

  return scored.map((s, i) => ({ ...s.ranking, rankPosition: i + 1 }));
}
