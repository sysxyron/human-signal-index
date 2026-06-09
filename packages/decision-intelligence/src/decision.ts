// =============================================================================
// @hsi/decision-intelligence — multi-intervention war-gaming + top-level run.
//
// simulateInterventionSet applies a SET of interventions CUMULATIVELY: it asks
// the counterfactual engine to resolve each scenario's event-level changes, then
// composes the union of those changes into ONE re-propagated alternative timeline
// (so the effects compound deterministically) and measures the cumulative outcome.
// Confidence DEGRADES with the number of compounding interventions — more
// interventions means more stacked assumptions, so we trust the result less.
//
// generateDecisionRun orchestrates sensitivity → rankings → recommendation into
// a single DecisionRun. Deterministic; caller injects `now`.
// =============================================================================

import {
  buildAlternativeTimeline,
  buildBaselineTimeline,
  compareTimelines,
  generateCounterfactual,
} from '@hsi/counterfactual-engine';
import type {
  ConfidenceBand,
  CounterfactualEventChange,
  CounterfactualInput,
} from '@hsi/counterfactual-engine';

import { rankInterventions } from './ranking';
import { generateRecommendations } from './recommendations';
import { runSensitivityAnalysis } from './sensitivity';
import type {
  DecisionInput,
  DecisionRun,
  InterventionSetResult,
  InterventionType,
} from './types';

/** Confidence ≥ this → 'high'; ≥ MEDIUM_BAND → 'medium'; else 'low'. */
export const HIGH_BAND = 0.66;
export const MEDIUM_BAND = 0.4;
/** Hard ceiling — we NEVER assert certainty. */
export const MAX_CONFIDENCE = 0.9;
/** Per-extra-intervention confidence penalty (compounding assumptions). */
export const SET_COMPOUNDING_PENALTY = 0.08;

function round(n: number, dp = 2): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

function bandOf(confidence: number): ConfidenceBand {
  if (confidence >= HIGH_BAND) return 'high';
  if (confidence >= MEDIUM_BAND) return 'medium';
  return 'low';
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
 * Apply a SET of interventions cumulatively and measure the combined outcome.
 * Each scenario is resolved by the counterfactual engine into concrete event
 * changes; we compose the UNION of those changes into one re-propagated timeline
 * (effects compound forward, deterministically). Confidence degrades with the
 * number of compounding interventions. Limitations are ALWAYS present.
 */
export function simulateInterventionSet(
  input: DecisionInput,
  interventions: InterventionType[],
  now: string,
): InterventionSetResult {
  const cfInput = toCfInput(input);
  const reasoning: string[] = [];
  const limitations: string[] = [];
  const evidence: string[] = [];

  // Resolve each scenario to its concrete event-level changes + confidence.
  const perScenario = interventions.map((type) => {
    const cf = generateCounterfactual(cfInput, { type }, now);
    return cf;
  });

  // Compose the union of all changes. De-dup by (eventId|eventType, action):
  // a later intervention that re-touches the same event keeps the LAST change
  // (deterministic by interventions[] order), but we keep distinct targets.
  const composed: CounterfactualEventChange[] = [];
  const seen = new Map<string, number>();
  for (const cf of perScenario) {
    for (const ch of cf.changes) {
      const key = `${ch.originalEventId ?? ch.eventType}|${ch.action}`;
      if (seen.has(key)) {
        composed[seen.get(key)!] = ch;
      } else {
        seen.set(key, composed.length);
        composed.push(ch);
      }
    }
  }

  // Build the cumulative timeline + deltas.
  const original = buildBaselineTimeline(cfInput, now);
  const counterfactual = buildAlternativeTimeline(cfInput, composed, now);
  const d = compareTimelines(original, counterfactual);

  // ---- Confidence: mean per-scenario confidence, degraded by set size. -------
  const meanConf =
    perScenario.length > 0
      ? perScenario.reduce((a, c) => a + c.confidence, 0) / perScenario.length
      : 0.3;
  const extra = Math.max(0, interventions.length - 1);
  const compoundingPenalty = extra * SET_COMPOUNDING_PENALTY;
  let confidence = meanConf - compoundingPenalty;
  confidence = clamp(round(confidence, 3), 0.05, MAX_CONFIDENCE);
  const confidenceBand = bandOf(confidence);

  // ---- Evidence + reasoning (data-grounded) ---------------------------------
  for (const cf of perScenario) {
    for (const ev of cf.evidence) evidence.push(ev);
  }
  if (evidence.length === 0) {
    evidence.push('No targeted events; only baseline metrics were available.');
  }

  reasoning.push(
    `Applied a SET of ${interventions.length} intervention${interventions.length === 1 ? '' : 's'} cumulatively: ${interventions.join(', ')}.`,
  );
  const oLast = original.frames[original.frames.length - 1];
  const cLast = counterfactual.frames[counterfactual.frames.length - 1];
  if (oLast && cLast) {
    if (d.signalDeltaPct < 0) {
      reasoning.push(
        `Cumulative signals fall ${Math.abs(d.signalDeltaPct)}% (${oLast.signals}→${cLast.signals}).`,
      );
    } else if (d.signalDeltaPct > 0) {
      reasoning.push(
        `Cumulative signals rise ${d.signalDeltaPct}% (${oLast.signals}→${cLast.signals}).`,
      );
    } else {
      reasoning.push(`Cumulative signal volume essentially unchanged (${cLast.signals}).`);
    }
    reasoning.push(
      `Cumulative amplification ${d.amplificationDelta >= 0 ? '+' : ''}${d.amplificationDelta} (${oLast.amplification}→${cLast.amplification}).`,
    );
  }
  if (d.forecastChanged) {
    reasoning.push(
      `Forecast state changes ${original.finalForecastState} → ${counterfactual.finalForecastState}.`,
    );
  } else {
    reasoning.push(
      `Forecast state holds at ${counterfactual.finalForecastState}.`,
    );
  }

  // ---- Limitations (ALWAYS present) -----------------------------------------
  limitations.push(
    'This is an ESTIMATE built from heuristic re-propagation of the actual history, not a prediction of certainty.',
  );
  limitations.push(
    `Combining ${interventions.length} interventions stacks assumptions — each added intervention lowers confidence (compounding penalty ${round(compoundingPenalty, 2)}).`,
  );
  if (interventions.length === 0) {
    limitations.push('Empty intervention set: this reflects the baseline trajectory only.');
  }
  if (composed.length === 0 && interventions.length > 0) {
    limitations.push(
      'None of the requested interventions matched a detected causal event — the cumulative effect is speculative.',
    );
  }

  const dir =
    d.signalDeltaPct < 0
      ? `slows growth ${Math.abs(d.signalDeltaPct)}%`
      : d.signalDeltaPct > 0
        ? `accelerates growth ${d.signalDeltaPct}%`
        : 'leaves growth roughly unchanged';
  const outcome =
    `Intervention set ${dir}; final forecast ${counterfactual.finalForecastState ?? 'unknown'}` +
    (d.forecastChanged ? ` (was ${original.finalForecastState})` : '') +
    `. Confidence ${Math.round(confidence * 100)}% (${confidenceBand}).`;

  return {
    interventions,
    outcome,
    confidence,
    confidenceBand,
    reasoning,
    limitations,
    deltas: {
      signalDeltaPct: d.signalDeltaPct,
      amplificationDelta: d.amplificationDelta,
      growthDeltaPct: d.growthDeltaPct,
      forecastChanged: d.forecastChanged,
    },
    evidence,
  };
}

/**
 * Orchestrate a full decision run: sensitivity → rankings → recommendation,
 * assembled into a single DecisionRun. Deterministic; caller injects `now`.
 */
export function generateDecisionRun(
  input: DecisionInput,
  now: string,
): DecisionRun {
  const sensitivity = runSensitivityAnalysis(input, now);
  const rankings = rankInterventions(input, now);
  const recommendation = generateRecommendations(input, now);

  const decisionName =
    `Decision for ${input.narrativeId}: ${recommendation.recommendedAction}`;

  return {
    narrativeId: input.narrativeId,
    decisionName,
    decisionType: recommendation.decisionType,
    confidence: recommendation.confidence,
    recommendedAction: recommendation.recommendedAction,
    reasoning: recommendation.reasoning,
    limitations: recommendation.limitations,
    recommendation,
    rankings,
    sensitivity,
    generatedAt: now,
  };
}
