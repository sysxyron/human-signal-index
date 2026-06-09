// =============================================================================
// @hsi/decision-intelligence — sensitivity analysis.
//
// runSensitivityAnalysis answers "which causal event contributes most to the
// observed outcome?" It reuses the causal engine's attributeChange (share =
// strength × confidence, normalized, capped so it never claims 100%) and folds
// per-event-TYPE shares into per-EVENT contributions tied to the real event ids.
//
// Output is honest: an `unexplainedPct` residual is ALWAYS reported, the
// dominant cause is the highest-share event type, and reasoning references the
// real events by their data-grounded explanations. Deterministic.
// =============================================================================

import { attributeChange } from '@hsi/causal-intelligence';
import type { CausalEvent, CausalInput } from '@hsi/causal-intelligence';

import type { DecisionInput, SensitivityResult } from './types';

function round(n: number, dp = 1): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

/** Pretty label for an event type, e.g. amplification_spike → "Amplification Spike". */
export function eventTypeLabel(t: string): string {
  return t
    .split('_')
    .map((w) => (w.length === 0 ? w : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}

function toCausalInput(input: DecisionInput): CausalInput {
  return {
    narrativeId: input.narrativeId,
    snapshots: input.snapshots,
    evolution: input.evolution,
    influenceIn: input.influenceIn,
    influenceOut: input.influenceOut,
    forecast: input.forecast,
    now: input.now,
  };
}

/** Impact weight used to split a type's share back across its member events. */
function eventWeight(e: CausalEvent): number {
  return Math.max(0, e.eventStrength) * Math.max(0, Math.min(1, e.confidence));
}

/**
 * Determine which causal events drive the observed change. Reuses the causal
 * engine's attribution (per-event-type shares + an unexplained residual) and
 * expands it to per-event contributions tied to real event ids. Deterministic.
 */
export function runSensitivityAnalysis(
  input: DecisionInput,
  now: string,
): SensitivityResult {
  void now; // contract parity; attribution is event-driven, not clock-driven.
  const events = input.events;
  const attribution = attributeChange(toCausalInput(input), events);

  const reasoning: string[] = [];

  if (events.length === 0) {
    reasoning.push(
      'No causal events were detected in the narrative history — sensitivity is undetermined; treat as fully unexplained.',
    );
    return {
      contributions: [],
      dominant: undefined,
      unexplainedPct: 100,
      reasoning,
    };
  }

  // Expand each per-type share across the member events of that type, split by
  // their relative impact weight (strength × confidence), preserving stable order.
  const byType = new Map<string, CausalEvent[]>();
  for (const e of events) {
    const list = byType.get(e.eventType) ?? [];
    list.push(e);
    byType.set(e.eventType, list);
  }

  const contributions: { eventType: string; eventId?: string; sharePct: number }[] =
    [];
  for (const ga of attribution.growthAttribution) {
    const members = byType.get(ga.eventType) ?? [];
    if (members.length <= 1) {
      contributions.push({
        eventType: ga.eventType,
        eventId: members[0]?.id,
        sharePct: round(ga.share, 1),
      });
      continue;
    }
    const totalW = members.reduce((a, e) => a + eventWeight(e), 0);
    for (const e of members) {
      const frac = totalW > 0 ? eventWeight(e) / totalW : 1 / members.length;
      contributions.push({
        eventType: ga.eventType,
        eventId: e.id,
        sharePct: round(ga.share * frac, 1),
      });
    }
  }

  // Sort contributions by share desc with a stable tiebreak.
  contributions.sort(
    (a, b) =>
      b.sharePct - a.sharePct ||
      a.eventType.localeCompare(b.eventType) ||
      (a.eventId ?? '').localeCompare(b.eventId ?? ''),
  );

  const dominantType = attribution.growthAttribution[0];
  const dominant = dominantType
    ? { eventType: dominantType.eventType, sharePct: round(dominantType.share, 1) }
    : undefined;

  // ---- Reasoning (data-grounded, references real events) --------------------
  if (dominant) {
    const ex = (byType.get(dominant.eventType) ?? [])
      .map((e) => e.explanation)
      .find((s) => s.length > 0);
    reasoning.push(
      `Dominant cause: ${eventTypeLabel(dominant.eventType)} accounts for ${dominant.sharePct}% of the observed change` +
        (ex ? ` — ${ex}.` : '.'),
    );
  }
  for (const ga of attribution.growthAttribution.slice(1, 4)) {
    reasoning.push(
      `${eventTypeLabel(ga.eventType)} contributes ${round(ga.share, 1)}%.`,
    );
  }
  reasoning.push(
    `${round(attribution.unexplained, 1)}% of the change is unexplained by the detected events (residual kept — we never force 100%).`,
  );

  return {
    contributions,
    dominant,
    unexplainedPct: round(attribution.unexplained, 1),
    reasoning,
  };
}
