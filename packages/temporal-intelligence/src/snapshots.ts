// =============================================================================
// @hsi/temporal-intelligence — snapshots ("commits" of narrative state).
//
// A snapshot freezes a narrative's derived stats at a moment. Snapshots are the
// atoms of the evolution history: pairwise diffs over an ordered snapshot series
// become EvolutionRecords. Everything here is PURE & DETERMINISTIC — the caller
// injects `now`; ids are derived from (narrativeId + capturedAt), never random.
// =============================================================================

import { fnv1a } from '@hsi/source-intelligence';

import type {
  NarrativeInput,
  NarrativeSnapshot,
  NarrativeStats,
  SignalInput,
  SnapshotCadence,
} from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

function clamp01(n: number): number {
  return clamp(n, 0, 1);
}

/** Deterministic snapshot id from narrative + time (stable, collision-resistant). */
function snapshotId(narrativeId: string, capturedAt: string): string {
  return `snap_${narrativeId}_${fnv1a(`${narrativeId}|${capturedAt}`)}`;
}

/**
 * Capture a snapshot from already-computed stats. Pure; the id is derived from
 * narrativeId + now unless an explicit id is provided.
 */
export function captureNarrativeSnapshot(
  stats: NarrativeStats,
  now: string,
  opts?: { id?: string; metadata?: Record<string, unknown> },
): NarrativeSnapshot {
  return {
    ...stats,
    amplificationScore: clamp(stats.amplificationScore, 0, 100),
    reliabilityScore: clamp(stats.reliabilityScore, 0, 100),
    supportRatio: clamp01(stats.supportRatio),
    contradictionRatio: clamp01(stats.contradictionRatio),
    id: opts?.id ?? snapshotId(stats.narrativeId, now),
    capturedAt: now,
    metadata: opts?.metadata,
  };
}

/**
 * Derive NarrativeStats from raw inputs. signalCount/sourceCount are derived
 * from the narrative + its signals; the remaining (amplification, reliability,
 * community, support/contradiction) come from `extras` when known, else default
 * to neutral/zero so the snapshot is honest about missing data.
 */
export function statsFromNarrative(
  narrative: NarrativeInput,
  signals: SignalInput[],
  extras?: {
    amplificationScore?: number;
    reliabilityScore?: number;
    communityCount?: number;
    supportRatio?: number;
    contradictionRatio?: number;
  },
): NarrativeStats {
  // Signals belonging to this narrative: those in signalIds, plus any tagged.
  const idSet = new Set(narrative.signalIds);
  const owned = signals.filter(
    (s) => idSet.has(s.id) || s.narrativeId === narrative.id,
  );
  const signalCount = Math.max(narrative.signalIds.length, owned.length);

  const sources = new Set<string>(narrative.sourceIds ?? []);
  for (const s of owned) if (s.sourceId) sources.add(s.sourceId);
  const sourceCount = sources.size;

  const communityCount =
    extras?.communityCount ?? (narrative.communityIds?.length ?? 0);

  return {
    narrativeId: narrative.id,
    signalCount,
    sourceCount,
    communityCount,
    amplificationScore: clamp(extras?.amplificationScore ?? 0, 0, 100),
    reliabilityScore: clamp(extras?.reliabilityScore ?? 0, 0, 100),
    supportRatio: clamp01(extras?.supportRatio ?? 0),
    contradictionRatio: clamp01(extras?.contradictionRatio ?? 0),
  };
}

/**
 * Capture a snapshot for every narrative. The cadence is stamped into metadata
 * for downstream filtering; capture itself is unconditional (callers gate timing
 * with {@link dueForCadence}).
 */
export function captureSnapshots(
  narratives: NarrativeInput[],
  signals: SignalInput[],
  now: string,
  cadence: SnapshotCadence,
): NarrativeSnapshot[] {
  return narratives.map((n) => {
    const stats = statsFromNarrative(n, signals);
    return captureNarrativeSnapshot(stats, now, {
      metadata: { cadence, category: n.category, name: n.name },
    });
  });
}

/** Window (in days) implied by a cadence. */
export const CADENCE_DAYS: Record<SnapshotCadence, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
};

/**
 * Is a fresh snapshot due given the last capture time, `now`, and the cadence?
 * True when there is no prior capture, or when the elapsed time since the last
 * capture meets/exceeds the cadence window. Deterministic.
 */
export function dueForCadence(
  lastCapturedAt: string | undefined,
  now: string,
  cadence: SnapshotCadence,
): boolean {
  if (!lastCapturedAt) return true;
  const last = Date.parse(lastCapturedAt);
  const nowMs = Date.parse(now);
  if (Number.isNaN(last) || Number.isNaN(nowMs)) return true;
  const elapsedDays = (nowMs - last) / DAY_MS;
  return elapsedDays >= CADENCE_DAYS[cadence];
}
