// =============================================================================
// @hsi/causal-intelligence — causal event detection.
//
// detectCausalEvents walks a narrative's time-ordered snapshot history and emits
// a CausalEvent for each material, threshold-gated change. Every event's
// `explanation` references the ACTUAL numbers (e.g. "signals rose 100→500
// (+400%)") and `metrics` carries those numbers. Pure & deterministic — the
// caller injects `now`; `occurredAt` is the snapshot boundary time.
//
// DETECTORS (each threshold-gated; no spurious events):
//   signal_surge        — signalCount rises by ≥ SIGNAL_SURGE_PCT% (and ≥ +3 abs).
//   source_expansion    — sourceCount rises by ≥ SOURCE_EXPANSION_DELTA.
//   community_growth    — communityCount rises by ≥ COMMUNITY_GROWTH_DELTA.
//   amplification_spike — amplificationScore rises by ≥ AMP_SPIKE_DELTA.
//   contradiction_drop  — contradictionRatio falls by ≥ CONTRADICTION_DELTA.
//   contradiction_rise  — contradictionRatio rises by ≥ CONTRADICTION_DELTA.
//   forecast_shift      — the per-step ForecastState changes (e.g. stable→rising).
//   influence_transfer  — a strong inbound InfluenceEdge (≥ INFLUENCE_MIN)
//                         coincides with a growth step.
// =============================================================================

import { forecastNarrativeTrajectory } from '@hsi/temporal-intelligence';
import type { ForecastState } from '@hsi/temporal-intelligence';

import type { CausalEvent, CausalEventType, CausalInput } from './types';

// ---- Documented thresholds --------------------------------------------------
/** Signal % rise considered a surge. */
export const SIGNAL_SURGE_PCT = 50;
/** Minimum absolute signal rise (guards tiny counts: 1→2 is not a surge). */
export const SIGNAL_SURGE_ABS = 3;
/** Source rise considered an expansion. */
export const SOURCE_EXPANSION_DELTA = 2;
/** Community rise considered growth. */
export const COMMUNITY_GROWTH_DELTA = 1;
/** Amplification rise considered a spike. */
export const AMP_SPIKE_DELTA = 12;
/** Contradiction-ratio swing (abs) considered material. */
export const CONTRADICTION_DELTA = 0.08;
/** Minimum inbound influence score to attribute an influence_transfer. */
export const INFLUENCE_MIN = 50;

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

function clamp01(n: number): number {
  return clamp(n, 0, 1);
}

function round(n: number, dp = 2): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

function orderByTime<T extends { capturedAt: string; id: string }>(xs: T[]): T[] {
  return [...xs].sort(
    (a, b) =>
      Date.parse(a.capturedAt) - Date.parse(b.capturedAt) ||
      a.id.localeCompare(b.id),
  );
}

function eventId(narrativeId: string, type: CausalEventType, at: string): string {
  // Deterministic, human-legible (no hashing dep needed for uniqueness here).
  return `evt_${narrativeId}_${type}_${at}`;
}

function mk(
  input: CausalInput,
  eventType: CausalEventType,
  occurredAt: string,
  eventStrength: number,
  confidence: number,
  explanation: string,
  metrics: Record<string, number | string>,
): CausalEvent {
  return {
    id: eventId(input.narrativeId, eventType, occurredAt),
    narrativeId: input.narrativeId,
    eventType,
    eventStrength: round(clamp(eventStrength, 0, 100)),
    confidence: round(clamp01(confidence), 3),
    explanation,
    occurredAt,
    metrics,
    createdAt: input.now,
  };
}

/**
 * Detect all causal events across a narrative's history. Deterministic and
 * threshold-gated; events are returned time-ordered (ties by event type).
 */
export function detectCausalEvents(input: CausalInput): CausalEvent[] {
  const snaps = orderByTime(input.snapshots);
  const out: CausalEvent[] = [];
  if (snaps.length < 2) {
    // A single snapshot cannot evidence change — honestly emit nothing here.
    // (Milestone "birth" is handled separately from a single snapshot.)
    return out;
  }

  // Per-step forecast for forecast_shift detection — recomputed on the prefix
  // up to each snapshot so the shift is grounded in the data, not a guess.
  const stateAt: ForecastState[] = [];
  for (let i = 0; i < snaps.length; i += 1) {
    const prefix = snaps.slice(0, i + 1);
    const f = forecastNarrativeTrajectory({
      narrativeId: input.narrativeId,
      snapshots: prefix,
      evolution: [],
      now: snaps[i].capturedAt,
    });
    stateAt.push(f.forecastType);
  }

  for (let i = 1; i < snaps.length; i += 1) {
    const prev = snaps[i - 1];
    const curr = snaps[i];
    const at = curr.capturedAt;

    // --- signal_surge --------------------------------------------------------
    const sigAbs = curr.signalCount - prev.signalCount;
    const sigPct = round(
      ((curr.signalCount - prev.signalCount) / Math.max(1, prev.signalCount)) * 100,
    );
    if (sigPct >= SIGNAL_SURGE_PCT && sigAbs >= SIGNAL_SURGE_ABS) {
      // Strength scales with the ratio (saturating at +500% → 100).
      const strength = clamp((sigPct / 500) * 100, 0, 100);
      const confidence = clamp01(0.55 + Math.min(sigAbs, 40) / 80);
      out.push(
        mk(
          input,
          'signal_surge',
          at,
          strength,
          confidence,
          `signals rose ${prev.signalCount}→${curr.signalCount} (+${sigPct}%)`,
          {
            from: prev.signalCount,
            to: curr.signalCount,
            deltaPct: sigPct,
            deltaAbs: sigAbs,
          },
        ),
      );
    }

    // --- source_expansion ----------------------------------------------------
    const srcDelta = curr.sourceCount - prev.sourceCount;
    if (srcDelta >= SOURCE_EXPANSION_DELTA) {
      const strength = clamp((srcDelta / 20) * 100, 0, 100);
      const confidence = clamp01(0.6 + Math.min(srcDelta, 10) / 20);
      out.push(
        mk(
          input,
          'source_expansion',
          at,
          strength,
          confidence,
          `${prev.sourceCount}→${curr.sourceCount} sources (+${srcDelta} new source${srcDelta === 1 ? '' : 's'})`,
          { from: prev.sourceCount, to: curr.sourceCount, delta: srcDelta },
        ),
      );
    }

    // --- community_growth ----------------------------------------------------
    const commDelta = curr.communityCount - prev.communityCount;
    if (commDelta >= COMMUNITY_GROWTH_DELTA) {
      const basePct = round((commDelta / Math.max(1, prev.communityCount)) * 100);
      const strength = clamp((commDelta / 15) * 100, 0, 100);
      const confidence = clamp01(0.55 + Math.min(commDelta, 8) / 16);
      out.push(
        mk(
          input,
          'community_growth',
          at,
          strength,
          confidence,
          `${prev.communityCount}→${curr.communityCount} communities (+${commDelta}, +${basePct}%)`,
          {
            from: prev.communityCount,
            to: curr.communityCount,
            delta: commDelta,
            deltaPct: basePct,
          },
        ),
      );
    }

    // --- amplification_spike -------------------------------------------------
    const ampDelta = round(curr.amplificationScore - prev.amplificationScore);
    if (ampDelta >= AMP_SPIKE_DELTA) {
      const strength = clamp((ampDelta / 80) * 100, 0, 100);
      const confidence = clamp01(0.55 + Math.min(ampDelta, 60) / 120);
      out.push(
        mk(
          input,
          'amplification_spike',
          at,
          strength,
          confidence,
          `amplification jumped ${prev.amplificationScore}→${curr.amplificationScore} (+${ampDelta})`,
          {
            from: prev.amplificationScore,
            to: curr.amplificationScore,
            delta: ampDelta,
          },
        ),
      );
    }

    // --- contradiction_drop / contradiction_rise -----------------------------
    const contraDelta = round(curr.contradictionRatio - prev.contradictionRatio, 4);
    if (contraDelta <= -CONTRADICTION_DELTA) {
      const fromPct = round(prev.contradictionRatio * 100);
      const toPct = round(curr.contradictionRatio * 100);
      const dropPts = round(Math.abs(contraDelta) * 100);
      const strength = clamp((Math.abs(contraDelta) / 0.5) * 100, 0, 100);
      const confidence = clamp01(0.55 + Math.min(Math.abs(contraDelta), 0.4) / 0.8);
      out.push(
        mk(
          input,
          'contradiction_drop',
          at,
          strength,
          confidence,
          `contradictions fell ${fromPct}%→${toPct}% (-${dropPts} pts)`,
          { from: fromPct, to: toPct, deltaPts: -dropPts },
        ),
      );
    } else if (contraDelta >= CONTRADICTION_DELTA) {
      const fromPct = round(prev.contradictionRatio * 100);
      const toPct = round(curr.contradictionRatio * 100);
      const risePts = round(contraDelta * 100);
      const strength = clamp((contraDelta / 0.5) * 100, 0, 100);
      const confidence = clamp01(0.55 + Math.min(contraDelta, 0.4) / 0.8);
      out.push(
        mk(
          input,
          'contradiction_rise',
          at,
          strength,
          confidence,
          `contradictions rose ${fromPct}%→${toPct}% (+${risePts} pts)`,
          { from: fromPct, to: toPct, deltaPts: risePts },
        ),
      );
    }

    // --- forecast_shift ------------------------------------------------------
    const prevState = stateAt[i - 1];
    const currState = stateAt[i];
    if (prevState !== currState) {
      // Strength = ordinal distance between states (emerging..dead), confidence
      // moderate (forecast states are themselves probabilistic).
      const ORDER: ForecastState[] = [
        'emerging',
        'rising',
        'stable',
        'declining',
        'dead',
      ];
      const dist = Math.abs(ORDER.indexOf(currState) - ORDER.indexOf(prevState));
      const strength = clamp((dist / 4) * 100, 20, 100);
      out.push(
        mk(
          input,
          'forecast_shift',
          at,
          strength,
          0.5,
          `forecast shifted ${prevState} → ${currState}`,
          { fromState: prevState, toState: currState, ordinalDistance: dist },
        ),
      );
    }

    // --- influence_transfer --------------------------------------------------
    // A strong inbound edge that coincides with a growth step at this boundary.
    const grew = sigPct >= SIGNAL_SURGE_PCT || ampDelta >= AMP_SPIKE_DELTA;
    if (grew && (input.influenceIn?.length ?? 0) > 0) {
      const strongest = [...(input.influenceIn ?? [])]
        .filter((e) => e.targetNarrativeId === input.narrativeId)
        .filter((e) => e.influenceScore >= INFLUENCE_MIN)
        .sort(
          (a, b) =>
            b.influenceScore - a.influenceScore ||
            a.sourceNarrativeId.localeCompare(b.sourceNarrativeId),
        )[0];
      if (strongest) {
        const strength = clamp(strongest.influenceScore, 0, 100);
        const confidence = clamp01(0.4 + strongest.influenceScore / 200);
        out.push(
          mk(
            input,
            'influence_transfer',
            at,
            strength,
            confidence,
            `${strongest.sourceNarrativeId} influenced this narrative (influence score ${round(strongest.influenceScore)}) coinciding with growth`,
            {
              source: strongest.sourceNarrativeId,
              influenceScore: round(strongest.influenceScore),
              sharedSources: strongest.sharedSources,
              sharedCommunities: strongest.sharedCommunities,
            },
          ),
        );
      }
    }
  }

  // Deterministic order: by time, then a stable causal-precedence tiebreak.
  const PRECEDENCE: CausalEventType[] = [
    'influence_transfer',
    'source_expansion',
    'signal_surge',
    'community_growth',
    'amplification_spike',
    'contradiction_drop',
    'contradiction_rise',
    'forecast_shift',
  ];
  return out.sort(
    (a, b) =>
      Date.parse(a.occurredAt) - Date.parse(b.occurredAt) ||
      PRECEDENCE.indexOf(a.eventType) - PRECEDENCE.indexOf(b.eventType),
  );
}
