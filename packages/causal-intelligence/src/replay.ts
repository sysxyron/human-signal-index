// =============================================================================
// @hsi/causal-intelligence — narrative replay timeline (the scrubber).
//
// buildReplayFrames produces one ReplayFrame per snapshot (optionally resampled
// to a cadence), each carrying the narrative's state at that moment plus the
// event types that fired at that boundary, the per-step change type, and the
// forecast. frameForTimestamp + milestoneFrames support a UI scrubber. Pure &
// deterministic — frames are time-ordered; the caller injects `now`.
// =============================================================================

import { forecastNarrativeTrajectory } from '@hsi/temporal-intelligence';

import { detectCausalEvents } from './events';
import type {
  CausalEvent,
  CausalInput,
  NarrativeMilestone,
  NarrativeSnapshot,
  ReplayFrame,
} from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

const CADENCE_DAYS: Record<'daily' | 'weekly' | 'monthly', number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
};

function orderByTime(snaps: NarrativeSnapshot[]): NarrativeSnapshot[] {
  return [...snaps].sort(
    (a, b) =>
      Date.parse(a.capturedAt) - Date.parse(b.capturedAt) ||
      a.id.localeCompare(b.id),
  );
}

function influenceSum(
  edges: { influenceScore: number }[] | undefined,
): number {
  if (!edges || edges.length === 0) return 0;
  return Math.round(edges.reduce((a, e) => a + e.influenceScore, 0));
}

/**
 * Resample an ordered snapshot series to a cadence: keep the first snapshot,
 * then keep the next snapshot only once ≥ cadence days have elapsed since the
 * last kept one; always keep the last snapshot. Deterministic.
 */
function resample(
  snaps: NarrativeSnapshot[],
  cadence: 'daily' | 'weekly' | 'monthly',
): NarrativeSnapshot[] {
  if (snaps.length <= 2) return snaps;
  const stepMs = CADENCE_DAYS[cadence] * DAY_MS;
  const kept: NarrativeSnapshot[] = [snaps[0]];
  let lastKept = Date.parse(snaps[0].capturedAt);
  for (let i = 1; i < snaps.length - 1; i += 1) {
    const t = Date.parse(snaps[i].capturedAt);
    if (t - lastKept >= stepMs) {
      kept.push(snaps[i]);
      lastKept = t;
    }
  }
  kept.push(snaps[snaps.length - 1]);
  return kept;
}

/**
 * Build the replay frames for a narrative. One frame per (resampled) snapshot,
 * time-ordered, with state + active event types + forecast + change type.
 */
export function buildReplayFrames(
  input: CausalInput,
  cadence: 'daily' | 'weekly' | 'monthly',
): ReplayFrame[] {
  const ordered = orderByTime(input.snapshots);
  const frames = resample(ordered, cadence);

  // Events keyed by the boundary time they occurred at.
  const events = detectCausalEvents(input);
  const eventsAt = new Map<string, CausalEvent[]>();
  for (const e of events) {
    const list = eventsAt.get(e.occurredAt) ?? [];
    list.push(e);
    eventsAt.set(e.occurredAt, list);
  }

  // Per-step change type, keyed by child snapshot time.
  const changeAt = new Map<string, string>();
  for (const r of input.evolution) {
    const child = input.snapshots.find((s) => s.id === r.childSnapshotId);
    if (child) changeAt.set(child.capturedAt, r.changeType);
  }

  const inSum = influenceSum(input.influenceIn);
  const outSum = influenceSum(input.influenceOut);

  return frames.map((s) => {
    // Forecast as of this frame (prefix up to this snapshot) — grounded, not guessed.
    const prefix = ordered.filter(
      (x) => Date.parse(x.capturedAt) <= Date.parse(s.capturedAt),
    );
    const forecast =
      prefix.length >= 1
        ? forecastNarrativeTrajectory({
            narrativeId: input.narrativeId,
            snapshots: prefix,
            evolution: [],
            now: s.capturedAt,
          }).forecastType
        : undefined;

    const firedTypes = (eventsAt.get(s.capturedAt) ?? []).map((e) => e.eventType);

    return {
      narrativeId: input.narrativeId,
      frameTimestamp: s.capturedAt,
      signals: s.signalCount,
      sources: s.sourceCount,
      communities: s.communityCount,
      amplification: s.amplificationScore,
      reliability: s.reliabilityScore,
      influenceIn: inSum,
      influenceOut: outSum,
      forecast,
      changeType: changeAt.get(s.capturedAt),
      events: firedTypes,
      data: {
        snapshotId: s.id,
        supportRatio: s.supportRatio,
        contradictionRatio: s.contradictionRatio,
        metadata: s.metadata ?? {},
      },
    };
  });
}

/** Find the frame active at a timestamp: the latest frame at/<= ts. */
export function frameForTimestamp(
  frames: ReplayFrame[],
  ts: string,
): ReplayFrame | undefined {
  const t = Date.parse(ts);
  let best: ReplayFrame | undefined;
  for (const f of frames) {
    if (Date.parse(f.frameTimestamp) <= t) {
      if (!best || Date.parse(f.frameTimestamp) > Date.parse(best.frameTimestamp)) {
        best = f;
      }
    }
  }
  return best;
}

/**
 * Map each milestone to the replay frame active at its `occurredAt` — for the
 * scrubber to mark milestone positions. Returns one entry per milestone (frame
 * may be undefined if the milestone predates the first frame).
 */
export function milestoneFrames(
  frames: ReplayFrame[],
  milestones: NarrativeMilestone[],
): { milestone: NarrativeMilestone; frame: ReplayFrame | undefined }[] {
  return milestones
    .slice()
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt))
    .map((m) => ({ milestone: m, frame: frameForTimestamp(frames, m.occurredAt) }));
}
