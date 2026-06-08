// =============================================================================
// @hsi/temporal-intelligence — narrative influence network.
//
// Directed A→B influence: how much an earlier/active narrative A appears to have
// driven a later narrative B. Edges require TIME ORDERING (A active before B
// grows) so influence never flows backward in time. Pure & deterministic.
//
// influenceScore (0..100) is a weighted blend of:
//   shared sources      (0..30) — common carriers,
//   shared entities     (0..25) — common subjects,
//   shared communities  (0..15) — common structural clusters,
//   time precedence     (0..15) — A clearly precedes B,
//   amplification xfer   (0..15) — A's amplification rose BEFORE B's growth.
// =============================================================================

import type {
  InfluenceEdge,
  NarrativeInput,
  NarrativeSnapshot,
  SignalInput,
  TemporalDeps,
} from './types';

// ---- Documented weights -----------------------------------------------------
export const W_SOURCES = 30;
export const W_ENTITIES = 25;
export const W_COMMUNITIES = 15;
export const W_PRECEDENCE = 15;
export const W_AMP_TRANSFER = 15;
/** Minimum score below which an edge is considered spurious and dropped. */
export const INFLUENCE_MIN_SCORE = 12;

function round(n: number, dp = 2): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

function timeMs(t: string | undefined): number {
  if (!t) return Number.NaN;
  const ms = Date.parse(t);
  return Number.isNaN(ms) ? Number.NaN : ms;
}

function sourcesOf(n: NarrativeInput, signals: SignalInput[]): Set<string> {
  const set = new Set<string>(n.sourceIds ?? []);
  const owned = signals.filter(
    (s) => n.signalIds.includes(s.id) || s.narrativeId === n.id,
  );
  for (const s of owned) if (s.sourceId) set.add(s.sourceId);
  return set;
}

function entitiesOf(n: NarrativeInput, signals: SignalInput[]): Set<string> {
  const set = new Set<string>(n.entityIds ?? []);
  const owned = signals.filter(
    (s) => n.signalIds.includes(s.id) || s.narrativeId === n.id,
  );
  for (const s of owned) for (const e of s.entityIds ?? []) set.add(e);
  return set;
}

function intersectSize(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const x of a) if (b.has(x)) n += 1;
  return n;
}

/** Time-ordered snapshots for a narrative (oldest first). */
function snapsFor(
  narrativeId: string,
  snapshots: NarrativeSnapshot[],
): NarrativeSnapshot[] {
  return snapshots
    .filter((s) => s.narrativeId === narrativeId)
    .sort(
      (a, b) =>
        Date.parse(a.capturedAt) - Date.parse(b.capturedAt) ||
        a.id.localeCompare(b.id),
    );
}

/** Earliest time A's amplification first exceeds a threshold (rise onset). */
function amplificationRiseTime(snaps: NarrativeSnapshot[]): number {
  if (snaps.length === 0) return Number.NaN;
  const base = snaps[0].amplificationScore;
  for (const s of snaps) {
    if (s.amplificationScore - base >= 10) return Date.parse(s.capturedAt);
  }
  return Number.NaN;
}

/** Time at which B's signal growth first accelerates (>0 net gain from start). */
function growthOnsetTime(snaps: NarrativeSnapshot[]): number {
  if (snaps.length === 0) return Number.NaN;
  const base = snaps[0].signalCount;
  for (const s of snaps) {
    if (s.signalCount - base > 0) return Date.parse(s.capturedAt);
  }
  return Number.NaN;
}

/**
 * Build the directed influence network. Deterministic; spurious (sub-threshold)
 * edges are dropped. Output sorted by descending score, then source/target id.
 */
export function buildInfluenceNetwork(
  narratives: NarrativeInput[],
  snapshots: NarrativeSnapshot[],
  signals: SignalInput[],
  _deps: TemporalDeps,
): InfluenceEdge[] {
  const now = _deps.now;
  const sourcesByN = new Map(narratives.map((n) => [n.id, sourcesOf(n, signals)]));
  const entitiesByN = new Map(narratives.map((n) => [n.id, entitiesOf(n, signals)]));
  const communitiesByN = new Map(
    narratives.map((n) => [n.id, new Set(n.communityIds ?? [])]),
  );
  const snapsByN = new Map(
    narratives.map((n) => [n.id, snapsFor(n.id, snapshots)]),
  );

  const edges: InfluenceEdge[] = [];

  for (const a of narratives) {
    for (const b of narratives) {
      if (a.id === b.id) continue;
      const aStart = timeMs(a.firstSeenAt);
      const bStart = timeMs(b.firstSeenAt);
      // Require A active before B grows: A must start strictly before B.
      if (Number.isNaN(aStart) || Number.isNaN(bStart) || aStart >= bStart) {
        continue;
      }

      const sharedSources = intersectSize(
        sourcesByN.get(a.id)!,
        sourcesByN.get(b.id)!,
      );
      const sharedEntities = intersectSize(
        entitiesByN.get(a.id)!,
        entitiesByN.get(b.id)!,
      );
      const sharedCommunities = intersectSize(
        communitiesByN.get(a.id)!,
        communitiesByN.get(b.id)!,
      );

      // No overlap of any kind → no plausible influence.
      if (sharedSources === 0 && sharedEntities === 0 && sharedCommunities === 0) {
        continue;
      }

      const sourceTerm = clamp(sharedSources / 4, 0, 1) * W_SOURCES;
      const entityTerm = clamp(sharedEntities / 4, 0, 1) * W_ENTITIES;
      const communityTerm = clamp(sharedCommunities / 2, 0, 1) * W_COMMUNITIES;

      // Precedence: stronger when A clearly precedes B (capped at ~30 days lead).
      const leadDays = (bStart - aStart) / (24 * 60 * 60 * 1000);
      const precedenceTerm = clamp(leadDays / 30, 0, 1) * W_PRECEDENCE;

      // Amplification transfer: A's amplification rose BEFORE B's growth onset.
      const aRise = amplificationRiseTime(snapsByN.get(a.id) ?? []);
      const bGrowth = growthOnsetTime(snapsByN.get(b.id) ?? []);
      let ampTerm = 0;
      let ampTransfer = false;
      if (!Number.isNaN(aRise) && !Number.isNaN(bGrowth) && aRise < bGrowth) {
        ampTerm = W_AMP_TRANSFER;
        ampTransfer = true;
      }

      const influenceScore = round(
        clamp(
          sourceTerm + entityTerm + communityTerm + precedenceTerm + ampTerm,
          0,
          100,
        ),
      );
      if (influenceScore < INFLUENCE_MIN_SCORE) continue;

      const rationale =
        `"${a.name}"→"${b.name}" influence ${influenceScore}/100: ` +
        `${sharedSources} shared sources, ${sharedEntities} shared entities, ` +
        `${sharedCommunities} shared communities, A leads by ${Math.round(leadDays)}d` +
        (ampTransfer ? ', amplification rose before B grew' : '') +
        '.';

      edges.push({
        sourceNarrativeId: a.id,
        targetNarrativeId: b.id,
        influenceScore,
        sharedEntities,
        sharedSources,
        sharedCommunities,
        rationale,
        createdAt: now,
      });
    }
  }

  edges.sort(
    (x, y) =>
      y.influenceScore - x.influenceScore ||
      x.sourceNarrativeId.localeCompare(y.sourceNarrativeId) ||
      x.targetNarrativeId.localeCompare(y.targetNarrativeId),
  );
  return edges;
}

/**
 * Top influencers by total OUTGOING influence score. Deterministic ordering
 * (score desc, then id). `k` limits the result (default: all).
 */
export function topInfluencers(
  edges: InfluenceEdge[],
  k?: number,
): { narrativeId: string; outScore: number }[] {
  const totals = new Map<string, number>();
  for (const e of edges) {
    totals.set(
      e.sourceNarrativeId,
      (totals.get(e.sourceNarrativeId) ?? 0) + e.influenceScore,
    );
  }
  const ranked = [...totals.entries()]
    .map(([narrativeId, outScore]) => ({ narrativeId, outScore: round(outScore) }))
    .sort((a, b) => b.outScore - a.outScore || a.narrativeId.localeCompare(b.narrativeId));
  return typeof k === 'number' ? ranked.slice(0, k) : ranked;
}
