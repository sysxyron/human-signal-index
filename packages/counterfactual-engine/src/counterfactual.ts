// =============================================================================
// @hsi/counterfactual-engine — grounded counterfactual generation.
//
// generateCounterfactual replays a narrative's ACTUAL history with ONE
// intervention applied: it locates the target causal event(s), translates the
// ScenarioType into an InterventionAction + per-event impact, re-propagates the
// downstream metrics (simulation.ts), re-runs the real forecaster, and produces
// both timelines + deltas + a HONEST confidence/limitations/evidence bundle.
//
// It NEVER claims certainty: confidence is lower when the intervention is far
// upstream (its effect compounds through more steps), when data is thin (few
// snapshots), or when the targeted event is weak/uncertain. LIMITATIONS are
// ALWAYS present and state the assumptions. EVIDENCE references the real events
// and metrics used. Deterministic — caller injects `now`.
// =============================================================================

import type { CausalEvent } from '@hsi/causal-intelligence';

import {
  buildAlternativeTimeline,
  buildBaselineTimeline,
  compareTimelines,
  VIRAL_COMMUNITY_THRESHOLD,
} from './simulation';
import type {
  ConfidenceBand,
  CounterfactualEventChange,
  CounterfactualInput,
  CounterfactualResult,
  InterventionAction,
  ScenarioType,
} from './types';

/** Confidence at/above this → 'high'; at/above MEDIUM_BAND → 'medium'; else low. */
export const HIGH_BAND = 0.66;
export const MEDIUM_BAND = 0.4;
/** Hard ceiling — we NEVER assert certainty. */
export const MAX_CONFIDENCE = 0.9;

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

/** Map each scenario type to the action + the causal event types it targets. */
interface ScenarioPlan {
  action: InterventionAction;
  /** Event types this scenario operates on (first match wins for target). */
  targetTypes: string[];
  defaultName: string;
}

const SCENARIO_PLANS: Record<ScenarioType, ScenarioPlan> = {
  remove_event: { action: 'removed', targetTypes: [], defaultName: 'Remove event' },
  delay_event: { action: 'delayed', targetTypes: [], defaultName: 'Delay event' },
  accelerate_event: {
    action: 'accelerated',
    targetTypes: [],
    defaultName: 'Accelerate event',
  },
  reduce_amplification: {
    action: 'reduced',
    targetTypes: ['amplification_spike'],
    defaultName: 'Reduce amplification spike',
  },
  increase_amplification: {
    action: 'amplified',
    targetTypes: ['amplification_spike'],
    defaultName: 'Increase amplification',
  },
  remove_source: {
    action: 'removed',
    targetTypes: ['source_expansion'],
    defaultName: 'Remove source expansion',
  },
  add_source: {
    action: 'amplified',
    targetTypes: ['source_expansion'],
    defaultName: 'Add sources',
  },
  remove_community: {
    action: 'removed',
    targetTypes: ['community_growth'],
    defaultName: 'Remove community growth',
  },
  increase_reliability: {
    action: 'amplified',
    targetTypes: ['contradiction_drop'],
    defaultName: 'Increase reliability',
  },
  decrease_reliability: {
    action: 'reduced',
    targetTypes: ['contradiction_drop'],
    defaultName: 'Decrease reliability',
  },
  remove_contradiction: {
    action: 'removed',
    targetTypes: ['contradiction_rise'],
    defaultName: 'Remove contradiction',
  },
  increase_contradiction: {
    action: 'amplified',
    targetTypes: ['contradiction_rise'],
    defaultName: 'Increase contradiction',
  },
};

function orderEventsByTime(events: CausalEvent[]): CausalEvent[] {
  return [...events].sort(
    (a, b) =>
      Date.parse(a.occurredAt) - Date.parse(b.occurredAt) ||
      (a.id ?? '').localeCompare(b.id ?? ''),
  );
}

/** Resolve the target event(s) for a scenario. */
function resolveTargets(
  events: CausalEvent[],
  scenario: { type: ScenarioType; targetEventId?: string },
): CausalEvent[] {
  const ordered = orderEventsByTime(events);
  if (scenario.targetEventId) {
    const hit = ordered.find((e) => e.id === scenario.targetEventId);
    return hit ? [hit] : [];
  }
  const plan = SCENARIO_PLANS[scenario.type];
  if (plan.targetTypes.length === 0) {
    // Generic event scenarios: target the strongest event.
    const strongest = [...ordered].sort(
      (a, b) => b.eventStrength - a.eventStrength,
    )[0];
    return strongest ? [strongest] : [];
  }
  return ordered.filter((e) => plan.targetTypes.includes(e.eventType));
}

/**
 * Per-event-type STRUCTURAL weight (0..100): how consequential intervening on a
 * single event of this type is to the downstream trajectory. A source expansion
 * or amplification spike that the whole growth rides on is structurally large
 * even when its raw `eventStrength` (a magnitude-of-change score) is small.
 */
const STRUCTURAL_WEIGHT: Record<string, number> = {
  source_expansion: 60,
  amplification_spike: 55,
  community_growth: 55,
  influence_transfer: 60,
  signal_surge: 50,
  contradiction_rise: 50,
  contradiction_drop: 45,
  forecast_shift: 30,
};

/**
 * Impact (0..100) the change has on the downstream re-propagation. Grounded in:
 *   * the event type's STRUCTURAL weight (how load-bearing it is),
 *   * the event's own confidence (uncertain detections move metrics less),
 *   * a small lift from the event's raw strength,
 * all scaled by the requested `magnitude` (0..2; 1 = full strength).
 */
function impactFor(event: CausalEvent, magnitude: number): number {
  const structural = STRUCTURAL_WEIGHT[event.eventType] ?? 45;
  // Confidence (0..1) gates the structural weight; raw strength adds a little.
  const grounded =
    structural * (0.6 + 0.4 * clamp(event.confidence, 0, 1)) +
    clamp(event.eventStrength, 0, 100) * 0.15;
  return round(clamp(grounded * clamp(magnitude, 0, 2), 0, 100));
}

/**
 * Generate a grounded counterfactual for a narrative under one intervention.
 * Deterministic; caller injects `now`.
 */
export function generateCounterfactual(
  input: CounterfactualInput,
  scenario: {
    type: ScenarioType;
    targetEventId?: string;
    magnitude?: number;
    name?: string;
  },
  now: string,
): CounterfactualResult {
  const plan = SCENARIO_PLANS[scenario.type];
  const magnitude = scenario.magnitude ?? 1;
  const targets = resolveTargets(input.events, scenario);
  const scenarioName = scenario.name ?? plan.defaultName;

  const reasoning: string[] = [];
  const limitations: string[] = [];
  const evidence: string[] = [];

  // ---- Build the event-level changes ----------------------------------------
  const changes: CounterfactualEventChange[] = targets.map((e) => {
    const impact = impactFor(e, magnitude);
    evidence.push(
      `${e.eventType} @ ${e.occurredAt}: ${e.explanation} (strength ${e.eventStrength}, conf ${e.confidence})`,
    );
    return {
      originalEventId: e.id,
      eventType: e.eventType,
      action: plan.action,
      impactScore: impact,
      reasoning:
        `${plan.action} ${e.eventType} (impact ${impact}/100): ` +
        `${e.explanation}`,
    };
  });

  // ---- Timelines ------------------------------------------------------------
  const original = buildBaselineTimeline(input, now);
  const counterfactual = buildAlternativeTimeline(input, changes, now);
  const deltas = compareTimelines(original, counterfactual);

  // ---- Confidence -----------------------------------------------------------
  // Start from mean targeted-event confidence; penalise thin data + upstream
  // interventions (effect compounds) + many compounding changes.
  const snaps = [...input.snapshots];
  const orderedSnaps = snaps.sort(
    (a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt),
  );
  const meanEventConf =
    targets.length > 0
      ? targets.reduce((a, e) => a + e.confidence, 0) / targets.length
      : 0.3;

  // Upstream-ness: how many DOWNSTREAM snapshot steps the earliest targeted
  // event must re-propagate through. More steps => more compounding assumptions
  // => lower confidence. Normalised by the total number of steps available.
  let upstreamPenalty = 0;
  if (targets.length > 0 && orderedSnaps.length >= 2) {
    const earliest = Math.min(...targets.map((t) => Date.parse(t.occurredAt)));
    let downstreamSteps = 0;
    for (let i = 1; i < orderedSnaps.length; i += 1) {
      if (Date.parse(orderedSnaps[i].capturedAt) >= earliest) downstreamSteps += 1;
    }
    const totalSteps = orderedSnaps.length - 1;
    const fraction = clamp(downstreamSteps / Math.max(1, totalSteps), 0, 1);
    upstreamPenalty = round(fraction * 0.25, 3); // up to −0.25
  }

  // Thin data dominates: too few snapshots to ground a re-propagation at all.
  const thin = orderedSnaps.length < 3;
  const thinPenalty = thin ? 0.3 : orderedSnaps.length < 4 ? 0.1 : 0;
  const compoundingPenalty = Math.min(0.12, Math.max(0, targets.length - 1) * 0.04);
  const noTargetPenalty = targets.length === 0 ? 0.4 : 0;

  let confidence =
    meanEventConf - upstreamPenalty - thinPenalty - compoundingPenalty - noTargetPenalty;
  confidence = clamp(round(confidence, 3), 0.05, MAX_CONFIDENCE);
  const confidenceBand = bandOf(confidence);

  // ---- Reasoning (data-grounded) --------------------------------------------
  if (targets.length === 0) {
    reasoning.push(
      `No causal event matched scenario "${scenario.type}" — counterfactual is speculative; treat as low-confidence.`,
    );
  } else {
    reasoning.push(
      `Applied "${plan.action}" to ${targets.length} ${targets.length === 1 ? 'event' : 'events'} ` +
        `(${targets.map((t) => t.eventType).join(', ')}).`,
    );
  }

  const oLast = original.frames[original.frames.length - 1];
  const cLast = counterfactual.frames[counterfactual.frames.length - 1];
  if (oLast && cLast) {
    if (deltas.signalDeltaPct < 0) {
      reasoning.push(
        `Signals fall ${Math.abs(deltas.signalDeltaPct)}% (${oLast.signals}→${cLast.signals}) under the intervention.`,
      );
    } else if (deltas.signalDeltaPct > 0) {
      reasoning.push(
        `Signals rise ${deltas.signalDeltaPct}% (${oLast.signals}→${cLast.signals}) under the intervention.`,
      );
    } else {
      reasoning.push(`Signal volume essentially unchanged (${cLast.signals}).`);
    }
    reasoning.push(
      `Amplification ${deltas.amplificationDelta >= 0 ? '+' : ''}${deltas.amplificationDelta} ` +
        `(${oLast.amplification}→${cLast.amplification}).`,
    );
    // Viral-threshold grounding for community-driven slowdowns.
    if (cLast.communities < VIRAL_COMMUNITY_THRESHOLD && oLast.communities >= VIRAL_COMMUNITY_THRESHOLD) {
      reasoning.push(
        `Community count falls to ${cLast.communities} (< viral threshold ${VIRAL_COMMUNITY_THRESHOLD}) → growth slows.`,
      );
    }
  }
  if (deltas.forecastChanged) {
    reasoning.push(
      `Forecast state changes ${original.finalForecastState} → ${counterfactual.finalForecastState}.`,
    );
  } else {
    reasoning.push(
      `Forecast state holds at ${counterfactual.finalForecastState} (intervention did not flip the trajectory).`,
    );
  }

  // ---- Limitations (ALWAYS present) -----------------------------------------
  limitations.push(
    'This is an ESTIMATE built from heuristic re-propagation of the actual history, not a prediction of certainty.',
  );
  limitations.push(
    'Downstream effects are assumed to scale with the targeted event; real-world feedback loops may differ.',
  );
  if (upstreamPenalty > 0.12) {
    limitations.push(
      `The intervention is far upstream — its effect compounds through ${orderedSnaps.length - 1} steps, widening uncertainty.`,
    );
  }
  if (thin) {
    limitations.push(
      `Thin data (${orderedSnaps.length} snapshot${orderedSnaps.length === 1 ? '' : 's'}): the re-propagation has little history to ground it.`,
    );
  }
  if (targets.length === 0) {
    limitations.push(
      `No matching causal event was found, so no concrete metric change could be grounded.`,
    );
  }
  if (evidence.length === 0) {
    evidence.push('No targeted events; only baseline metrics were available.');
  }

  // ---- Summary --------------------------------------------------------------
  const dir =
    deltas.signalDeltaPct < 0
      ? `Growth slowed ${Math.abs(deltas.signalDeltaPct)}%`
      : deltas.signalDeltaPct > 0
        ? `Growth accelerated ${deltas.signalDeltaPct}%`
        : `Growth roughly unchanged`;
  const fc = counterfactual.finalForecastState ?? 'unknown';
  const probPct = cLast ? '' : '';
  void probPct;
  const summary =
    `${scenarioName}: ${dir}, final forecast ${fc}` +
    (deltas.forecastChanged ? ` (was ${original.finalForecastState})` : '') +
    `. ${cLast && cLast.communities < VIRAL_COMMUNITY_THRESHOLD ? 'Community growth falls below the viral threshold. ' : ''}` +
    `Confidence ${Math.round(confidence * 100)}% (${confidenceBand}).`;

  return {
    narrativeId: input.narrativeId,
    scenarioName,
    scenarioType: scenario.type,
    confidence,
    confidenceBand,
    summary,
    reasoning,
    limitations,
    evidence,
    changes,
    original,
    counterfactual,
    deltas,
    generatedAt: now,
  };
}
