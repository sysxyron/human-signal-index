// =============================================================================
// @hsi/counterfactual-engine — deterministic re-propagation core.
//
// buildAlternativeTimeline takes a baseline snapshot series + a set of event
// changes and recomputes the ALTERED snapshot series, then runs the real
// forecaster (forecastNarrativeTrajectory) on the altered series to obtain a
// finalForecastState. compareTimelines computes the deltas between two
// timelines. Pure & deterministic — no clocks, no randomness.
//
// RE-PROPAGATION MODEL (heuristic, grounded, monotonic):
//   Each CounterfactualEventChange carries an `impactScore` (0..100) and an
//   `action`. We translate (eventType, action, impact) into per-metric MULTIPLIERS
//   that apply to the GROWTH of each metric from the event boundary onward — i.e.
//   we damp/boost the *increments* contributed at and after the targeted step,
//   never rewriting history before the event. This keeps the alternate series a
//   plausible re-propagation of the same trajectory, just with the intervention's
//   contribution removed/reduced/amplified. Effects compound forward (an earlier,
//   larger intervention bends the whole tail), which is why upstream interventions
//   are flagged lower-confidence in counterfactual.ts.
// =============================================================================

import { forecastNarrativeTrajectory } from '@hsi/temporal-intelligence';
import type {
  EvolutionRecord,
  NarrativeSnapshot,
} from '@hsi/temporal-intelligence';

import type {
  AlternativeTimeline,
  CounterfactualEventChange,
  CounterfactualInput,
} from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Below this final community count, growth is assumed to fall under the viral
 * threshold — used by callers to justify "growth slows" reasoning. */
export const VIRAL_COMMUNITY_THRESHOLD = 3;

function round(n: number, dp = 2): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

function orderByTime(snaps: NarrativeSnapshot[]): NarrativeSnapshot[] {
  return [...snaps].sort(
    (a, b) =>
      Date.parse(a.capturedAt) - Date.parse(b.capturedAt) ||
      a.id.localeCompare(b.id),
  );
}

/** Per-metric multipliers applied to the INCREMENT contributed from a boundary. */
interface MetricMultipliers {
  signals: number;
  sources: number;
  communities: number;
  amplification: number;
  /** Additive delta applied to contradictionRatio increments (points, 0..1). */
  contradiction: number;
  /** Additive delta applied to reliabilityScore increments. */
  reliability: number;
  /**
   * Per-step additive PRESSURE on signals, expressed as a fraction of the prior
   * (altered) signal count. Negative = downward pressure (e.g. more contradiction
   * suppresses reach), positive = tailwind. Sign-consistent regardless of the
   * baseline increment's sign, unlike the multiplier fields.
   */
  signalPressureFrac: number;
}

const NEUTRAL: MetricMultipliers = {
  signals: 1,
  sources: 1,
  communities: 1,
  amplification: 1,
  contradiction: 0,
  reliability: 0,
  signalPressureFrac: 0,
};

/**
 * Map one event change to per-metric multipliers. `impactScore` (0..100) sets
 * how strongly the increment is damped/boosted. action 'removed' => the metric's
 * contribution is (mostly) zeroed; 'reduced' => damped; 'amplified' => boosted.
 */
function multipliersForChange(c: CounterfactualEventChange): MetricMultipliers {
  const w = clamp(c.impactScore, 0, 100) / 100; // 0..1 strength
  const m: MetricMultipliers = { ...NEUTRAL };

  // The fraction of an increment that survives a removal/reduction.
  const removed = clamp(1 - w, 0, 1); // strong impact => little survives
  const reduced = clamp(1 - w * 0.6, 0, 1); // partial damp
  const amplified = 1 + w * 0.8; // up to +80%

  const apply = (key: keyof MetricMultipliers, factor: number) => {
    (m[key] as number) = factor;
  };

  switch (c.eventType) {
    case 'source_expansion':
      // Sources drive reach; community + signal growth ride on them.
      if (c.action === 'removed') {
        apply('sources', removed);
        apply('communities', clamp(removed + 0.15, 0, 1));
        apply('signals', clamp(removed + 0.2, 0, 1));
        apply('amplification', clamp(removed + 0.25, 0, 1));
      } else if (c.action === 'reduced') {
        apply('sources', reduced);
        apply('communities', clamp(reduced + 0.1, 0, 1));
        apply('signals', clamp(reduced + 0.1, 0, 1));
        apply('amplification', clamp(reduced + 0.1, 0, 1));
      } else if (c.action === 'amplified') {
        apply('sources', amplified);
        apply('signals', amplified);
        apply('communities', amplified);
      }
      break;
    case 'community_growth':
      if (c.action === 'removed') {
        apply('communities', removed);
        apply('signals', clamp(removed + 0.25, 0, 1));
        apply('amplification', clamp(removed + 0.3, 0, 1));
      } else if (c.action === 'reduced') {
        apply('communities', reduced);
        apply('signals', clamp(reduced + 0.15, 0, 1));
      } else {
        apply('communities', amplified);
        apply('signals', 1 + w * 0.4);
      }
      break;
    case 'amplification_spike':
      if (c.action === 'removed') {
        apply('amplification', removed);
        apply('signals', clamp(removed + 0.3, 0, 1));
      } else if (c.action === 'reduced') {
        apply('amplification', reduced);
        apply('signals', clamp(reduced + 0.2, 0, 1));
      } else {
        apply('amplification', amplified);
        apply('signals', 1 + w * 0.5);
      }
      break;
    case 'signal_surge':
      if (c.action === 'removed') apply('signals', removed);
      else if (c.action === 'reduced') apply('signals', reduced);
      else apply('signals', amplified);
      break;
    case 'influence_transfer':
      // External push — dampens signals + amplification when removed.
      if (c.action === 'removed') {
        apply('signals', clamp(removed + 0.25, 0, 1));
        apply('amplification', clamp(removed + 0.3, 0, 1));
        apply('sources', clamp(removed + 0.4, 0, 1));
      } else if (c.action === 'reduced') {
        apply('signals', clamp(reduced + 0.1, 0, 1));
        apply('amplification', clamp(reduced + 0.15, 0, 1));
      } else {
        apply('signals', amplified);
        apply('amplification', amplified);
      }
      break;
    case 'contradiction_drop':
      // Removing a credibility-clearing event keeps contradictions higher,
      // which depresses reliability and applies downward pressure on reach.
      m.contradiction = c.action === 'removed' ? w * 0.18 : w * 0.1;
      m.signalPressureFrac = -w * 0.12;
      m.reliability = -w * 8;
      break;
    case 'contradiction_rise':
      if (c.action === 'amplified') {
        // More pushback => higher contradictions, lower reach + amplification.
        m.contradiction = w * 0.2;
        m.signalPressureFrac = -w * 0.18;
        apply('amplification', clamp(1 - w * 0.3, 0, 1));
        m.reliability = -w * 10;
      } else {
        // removed/reduced contradiction rise => clears the air, growth recovers.
        m.contradiction = -w * 0.15;
        m.signalPressureFrac = w * 0.14;
        m.reliability = w * 6;
      }
      break;
    default:
      break;
  }
  return m;
}

/** Combine the multipliers of all changes active at a given boundary time. */
function combine(active: CounterfactualEventChange[]): MetricMultipliers {
  return active.reduce<MetricMultipliers>((acc, c) => {
    const m = multipliersForChange(c);
    return {
      signals: acc.signals * m.signals,
      sources: acc.sources * m.sources,
      communities: acc.communities * m.communities,
      amplification: acc.amplification * m.amplification,
      contradiction: acc.contradiction + m.contradiction,
      reliability: acc.reliability + m.reliability,
      signalPressureFrac: acc.signalPressureFrac + m.signalPressureFrac,
    };
  }, { ...NEUTRAL });
}

/**
 * Recompute the altered snapshot series. For each consecutive step we take the
 * baseline INCREMENT of each metric and scale it by the combined multiplier of
 * any changes whose target time is at/before the step boundary (effects persist
 * forward — once a source never expanded, the deficit carries on).
 */
export function repropagateSnapshots(
  baseline: NarrativeSnapshot[],
  changes: CounterfactualEventChange[],
  changeTimeById: Map<string, string>,
): NarrativeSnapshot[] {
  const snaps = orderByTime(baseline);
  if (snaps.length === 0) return [];

  // Resolve each change to a boundary time. Changes without a resolvable time
  // are treated as active from the start (conservative).
  const timedChanges = changes.map((c) => ({
    change: c,
    at: c.originalEventId ? changeTimeById.get(c.originalEventId) : undefined,
  }));

  const out: NarrativeSnapshot[] = [{ ...snaps[0] }];
  for (let i = 1; i < snaps.length; i += 1) {
    const prevBase = snaps[i - 1];
    const currBase = snaps[i];
    const prevAlt = out[i - 1];
    const boundary = Date.parse(currBase.capturedAt);

    const active = timedChanges
      .filter((t) => t.at === undefined || Date.parse(t.at) <= boundary)
      .map((t) => t.change);
    const m = combine(active);

    const sigInc =
      (currBase.signalCount - prevBase.signalCount) * m.signals +
      prevAlt.signalCount * m.signalPressureFrac;
    const srcInc = (currBase.sourceCount - prevBase.sourceCount) * m.sources;
    const commInc =
      (currBase.communityCount - prevBase.communityCount) * m.communities;
    const ampInc =
      (currBase.amplificationScore - prevBase.amplificationScore) *
      m.amplification;
    const contraInc =
      currBase.contradictionRatio - prevBase.contradictionRatio + m.contradiction;
    const relInc =
      currBase.reliabilityScore - prevBase.reliabilityScore + m.reliability;

    out.push({
      ...currBase,
      signalCount: Math.max(0, Math.round(prevAlt.signalCount + sigInc)),
      sourceCount: Math.max(0, Math.round(prevAlt.sourceCount + srcInc)),
      communityCount: Math.max(0, Math.round(prevAlt.communityCount + commInc)),
      amplificationScore: clamp(
        round(prevAlt.amplificationScore + ampInc),
        0,
        100,
      ),
      reliabilityScore: clamp(round(prevAlt.reliabilityScore + relInc), 0, 100),
      contradictionRatio: clamp(
        round(prevAlt.contradictionRatio + contraInc, 4),
        0,
        1,
      ),
    });
  }
  return out;
}

function toTimeline(
  snaps: NarrativeSnapshot[],
  narrativeId: string,
  evolution: EvolutionRecord[],
  now: string,
): AlternativeTimeline {
  const ordered = orderByTime(snaps);
  const frames = ordered.map((s) => {
    // Per-step forecast (grounded in the prefix up to this snapshot).
    const prefix = ordered.slice(0, ordered.indexOf(s) + 1);
    const f = forecastNarrativeTrajectory({
      narrativeId,
      snapshots: prefix,
      evolution: [],
      now: s.capturedAt,
    });
    return {
      timestamp: s.capturedAt,
      signals: s.signalCount,
      sources: s.sourceCount,
      communities: s.communityCount,
      amplification: s.amplificationScore,
      forecast: f.forecastType,
    };
  });
  // Final forecast uses the full altered series + a "now" anchor.
  const finalForecast = forecastNarrativeTrajectory({
    narrativeId,
    snapshots: ordered,
    evolution,
    now,
  });
  return { frames, finalForecastState: finalForecast.forecastType };
}

/**
 * Build an alternative timeline from baseline snapshots + event changes.
 * Re-propagates downstream metrics then re-runs the real forecaster. Pure.
 */
export function buildAlternativeTimeline(
  input: CounterfactualInput,
  changes: CounterfactualEventChange[],
  now: string,
): AlternativeTimeline {
  const changeTimeById = new Map<string, string>();
  for (const e of input.events) {
    if (e.id) changeTimeById.set(e.id, e.occurredAt);
  }
  const altered = repropagateSnapshots(input.snapshots, changes, changeTimeById);
  return toTimeline(altered, input.narrativeId, input.evolution, now);
}

/** Build the baseline (no-intervention) timeline for comparison. Pure. */
export function buildBaselineTimeline(
  input: CounterfactualInput,
  now: string,
): AlternativeTimeline {
  return toTimeline(input.snapshots, input.narrativeId, input.evolution, now);
}

/** Compare two timelines into the standard delta bundle. Pure. */
export function compareTimelines(
  original: AlternativeTimeline,
  counterfactual: AlternativeTimeline,
): {
  signalDeltaPct: number;
  amplificationDelta: number;
  forecastChanged: boolean;
  growthDeltaPct: number;
} {
  const oLast = original.frames[original.frames.length - 1];
  const cLast = counterfactual.frames[counterfactual.frames.length - 1];
  const oFirst = original.frames[0];
  const cFirst = counterfactual.frames[0];

  const signalDeltaPct =
    oLast && cLast
      ? round(
          ((cLast.signals - oLast.signals) / Math.max(1, oLast.signals)) * 100,
        )
      : 0;
  const amplificationDelta =
    oLast && cLast ? round(cLast.amplification - oLast.amplification) : 0;

  const oGrowth =
    oLast && oFirst
      ? ((oLast.signals - oFirst.signals) / Math.max(1, oFirst.signals)) * 100
      : 0;
  const cGrowth =
    cLast && cFirst
      ? ((cLast.signals - cFirst.signals) / Math.max(1, cFirst.signals)) * 100
      : 0;
  const growthDeltaPct = round(cGrowth - oGrowth);

  const forecastChanged =
    (original.finalForecastState ?? '') !==
    (counterfactual.finalForecastState ?? '');

  return { signalDeltaPct, amplificationDelta, forecastChanged, growthDeltaPct };
}

/** Window span (days) of a snapshot series — used for confidence weighting. */
export function windowDays(snaps: NarrativeSnapshot[]): number {
  const ordered = orderByTime(snaps);
  if (ordered.length < 2) return 0;
  return (
    (Date.parse(ordered[ordered.length - 1].capturedAt) -
      Date.parse(ordered[0].capturedAt)) /
    DAY_MS
  );
}
