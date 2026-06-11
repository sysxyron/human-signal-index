// =============================================================================
// @hsi/trust-history — append-only snapshot recording + history assembly.
//
// recordTrustSnapshot() normalises an input into a faithful, immutable snapshot
// (band derived, score clamped). getTrustHistory() filters + sorts a set of
// snapshots into a clean ascending series for one entity, NEVER mutating its
// inputs. Nothing here overwrites history — snapshots are only added and read.
// =============================================================================

import type {
  TrustBand,
  TrustSnapshot,
  TrustSnapshotInput,
} from './types';
import type { TrustEntityType, TrustScore } from '@hsi/calibration-engine';

const EPOCH = '1970-01-01T00:00:00.000Z';

export function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

export function clamp01(n: number): number {
  return clamp(n, 0, 1);
}

export function round(n: number, dp = 2): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

/** Map a 0..100 trust score to its band (mirrors the Phase-16 thresholds). */
export function bandForScore(score: number): TrustBand {
  const s = clamp(score, 0, 100);
  return s >= 70 ? 'high' : s >= 40 ? 'medium' : 'low';
}

/**
 * Record (build) a normalised, immutable trust snapshot. The score is clamped to
 * 0..100, the band is derived from it, and missing signals default safely. The
 * caller persists the returned value APPEND-ONLY — this function never mutates
 * any prior history.
 */
export function recordTrustSnapshot(
  input: TrustSnapshotInput,
  opts: { now: string },
): TrustSnapshot {
  const trustScore = round(clamp(input.trustScore, 0, 100));
  return {
    ...(input.id ? { id: input.id } : {}),
    entityType: input.entityType,
    entityId: input.entityId,
    trustScore,
    confidence: round(clamp01(input.confidence ?? 0), 4),
    calibrationScore: round(clamp01(input.calibrationScore ?? 0), 4),
    evidenceCount: Math.max(0, Math.floor(input.evidenceCount ?? 0)),
    band: bandForScore(trustScore),
    at: opts.now,
  };
}

/**
 * Build a snapshot directly from a Phase-16 engine TrustScore. Convenience for
 * the worker/DAL which already computed a TrustScore.
 */
export function snapshotFromTrustScore(
  score: TrustScore,
  opts: { now: string },
): TrustSnapshot {
  return recordTrustSnapshot(
    {
      entityType: score.entityType,
      entityId: score.entityId,
      trustScore: score.trustScore,
      confidence: score.confidence,
      calibrationScore: score.calibrationScore,
      evidenceCount: score.evidenceCount,
    },
    opts,
  );
}

/** Parse an ISO timestamp to epoch ms, falling back to 0 (so it sorts first). */
function ts(at: string | undefined): number {
  if (!at) return 0;
  const t = Date.parse(at);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Assemble an entity's trust history: filter a pool of snapshots to the given
 * entity (type + id), sort ASCENDING by `at` (oldest → newest), and optionally
 * cap to the most recent `limit`. Pure — inputs are never mutated.
 */
export function getTrustHistory(
  snapshots: TrustSnapshot[],
  filter: {
    entityType: TrustEntityType;
    entityId: string;
    limit?: number;
  },
): TrustSnapshot[] {
  const matched = snapshots
    .filter(
      (s) =>
        s.entityType === filter.entityType && s.entityId === filter.entityId,
    )
    .slice()
    .sort((a, b) => ts(a.at) - ts(b.at) || (a.id ?? '').localeCompare(b.id ?? ''));

  if (filter.limit !== undefined && filter.limit >= 0) {
    return matched.slice(Math.max(0, matched.length - filter.limit));
  }
  return matched;
}

/**
 * Group a pool of snapshots into per-entity histories (each ascending by time).
 * The key is `${entityType}:${entityId}`. Useful for batch trend/drift scans.
 */
export function groupTrustHistory(
  snapshots: TrustSnapshot[],
): Map<string, TrustSnapshot[]> {
  const groups = new Map<string, TrustSnapshot[]>();
  for (const s of snapshots) {
    const key = `${s.entityType}:${s.entityId}`;
    const arr = groups.get(key) ?? [];
    arr.push(s);
    groups.set(key, arr);
  }
  for (const [key, arr] of groups) {
    arr.sort((a, b) => ts(a.at) - ts(b.at) || (a.id ?? '').localeCompare(b.id ?? ''));
    groups.set(key, arr);
  }
  return groups;
}

/** The trust scores of a history as a plain number series (ascending). */
export function scoreSeries(history: TrustSnapshot[]): number[] {
  return history.map((s) => s.trustScore);
}
