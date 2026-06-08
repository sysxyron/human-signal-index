// =============================================================================
// @hsi/temporal-intelligence — evolution diffs (the "log" of a narrative).
//
// computeNarrativeEvolution diffs two consecutive snapshots and classifies the
// change with an EXPLAINABLE rationale. All thresholds are documented constants
// so the app/docs can describe the behaviour exactly. Pure & deterministic.
//
// CLASSIFICATION (first match wins, evaluated in this order):
//   split   — community OR source breadth jumps materially (≥ +2 communities or
//             sourceDelta ≥ SPLIT_SOURCE_DELTA) while amplification DIVERGES
//             (|amplificationDelta| ≥ SPLIT_AMP_DELTA). The idea is fragmenting
//             across more carriers with uneven energy.
//   merge   — community count DROPS by ≥1 (carriers converging) while signals
//             AND sources both rise (counts converge upward from many → one).
//   mutation— a composition/category shift: metadata.category changed, OR the
//             contradiction ratio swings by ≥ MUTATION_CONTRADICTION_DELTA while
//             signal growth stays modest (the meaning is changing, not the size).
//   growth  — signals up ≥ GROWTH_PCT OR amplification up ≥ GROWTH_AMP_DELTA.
//   decline — signals down ≥ GROWTH_PCT OR amplification down ≥ GROWTH_AMP_DELTA.
//   (else)  — defaults to whichever of growth/decline matches the sign of the
//             dominant delta; truly flat → 'stable' is NOT a change type, so the
//             smallest-magnitude case falls back to 'growth' with low confidence.
// =============================================================================

import type { EvolutionChangeType, EvolutionRecord, NarrativeSnapshot } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

// ---- Documented thresholds --------------------------------------------------
/** Signal % change (abs) considered "material" for growth/decline. */
export const GROWTH_PCT = 20;
/** Amplification delta (abs) considered "material" for growth/decline. */
export const GROWTH_AMP_DELTA = 10;
/** Source delta that (with amp divergence) signals a split. */
export const SPLIT_SOURCE_DELTA = 3;
/** Amplification delta magnitude that counts as "diverging" for a split. */
export const SPLIT_AMP_DELTA = 8;
/** Community jump that signals a split. */
export const SPLIT_COMMUNITY_DELTA = 2;
/** Contradiction-ratio swing (abs) that signals a mutation. */
export const MUTATION_CONTRADICTION_DELTA = 0.2;

function round(n: number, dp = 2): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function categoryOf(s: NarrativeSnapshot): string | undefined {
  const c = s.metadata?.category;
  return typeof c === 'string' ? c : undefined;
}

/**
 * Diff two consecutive snapshots into an explainable EvolutionRecord.
 * `prev` MUST precede `curr` in time (the caller orders the history).
 */
export function computeNarrativeEvolution(
  prev: NarrativeSnapshot,
  curr: NarrativeSnapshot,
  now: string,
): EvolutionRecord {
  const growthPct = round(
    ((curr.signalCount - prev.signalCount) / Math.max(1, prev.signalCount)) * 100,
  );
  const amplificationDelta = round(curr.amplificationScore - prev.amplificationScore);
  const communityDelta = curr.communityCount - prev.communityCount;
  const sourceDelta = curr.sourceCount - prev.sourceCount;
  const reliabilityDelta = round(curr.reliabilityScore - prev.reliabilityScore);
  const contradictionDelta = round(curr.contradictionRatio - prev.contradictionRatio);

  const categoryChanged =
    categoryOf(prev) !== undefined &&
    categoryOf(curr) !== undefined &&
    categoryOf(prev) !== categoryOf(curr);

  const reasoning: string[] = [];

  // Build the per-factor reasoning lines (deterministic order).
  reasoning.push(
    `${prev.signalCount}→${curr.signalCount} signals (${growthPct >= 0 ? '+' : ''}${growthPct}%)`,
  );
  if (amplificationDelta !== 0) {
    reasoning.push(
      `amplification ${amplificationDelta >= 0 ? '+' : ''}${amplificationDelta}`,
    );
  }
  if (sourceDelta !== 0) {
    reasoning.push(
      `${Math.abs(sourceDelta)} ${sourceDelta > 0 ? 'new' : 'lost'} source(s)`,
    );
  }
  if (communityDelta !== 0) {
    reasoning.push(
      `${communityDelta >= 0 ? '+' : ''}${communityDelta} communities`,
    );
  }
  if (contradictionDelta !== 0) {
    reasoning.push(
      `contradiction ${contradictionDelta >= 0 ? '+' : ''}${round(contradictionDelta * 100)}%`,
    );
  }
  if (categoryChanged) {
    reasoning.push(`category ${categoryOf(prev)} → ${categoryOf(curr)}`);
  }

  // ---- Classification (documented order) ------------------------------------
  let changeType: EvolutionChangeType;
  // A split fragments OUTWARD: breadth must not be shrinking (communityDelta ≥ 0),
  // otherwise converging carriers belong to the 'merge' case below.
  const splitByBreadth =
    communityDelta >= 0 &&
    (communityDelta >= SPLIT_COMMUNITY_DELTA || sourceDelta >= SPLIT_SOURCE_DELTA);
  const amplificationDiverges = Math.abs(amplificationDelta) >= SPLIT_AMP_DELTA;
  const merging = communityDelta <= -1 && growthPct > 0 && sourceDelta > 0;
  const mutating =
    categoryChanged ||
    (Math.abs(contradictionDelta) >= MUTATION_CONTRADICTION_DELTA &&
      Math.abs(growthPct) < GROWTH_PCT);

  if (splitByBreadth && amplificationDiverges) {
    changeType = 'split';
    reasoning.push('classified split: breadth jumped while amplification diverged');
  } else if (merging) {
    changeType = 'merge';
    reasoning.push('classified merge: carriers converged while signals & sources rose');
  } else if (mutating) {
    changeType = 'mutation';
    reasoning.push(
      categoryChanged
        ? 'classified mutation: category/composition shifted'
        : 'classified mutation: contradiction stance swung without size change',
    );
  } else if (growthPct >= GROWTH_PCT || amplificationDelta >= GROWTH_AMP_DELTA) {
    changeType = 'growth';
    reasoning.push('classified growth: signals/amplification up materially');
  } else if (growthPct <= -GROWTH_PCT || amplificationDelta <= -GROWTH_AMP_DELTA) {
    changeType = 'decline';
    reasoning.push('classified decline: signals/amplification down materially');
  } else {
    // Near-flat: pick the sign of the dominant signal, low confidence.
    changeType = growthPct < 0 || amplificationDelta < 0 ? 'decline' : 'growth';
    reasoning.push('classified by dominant delta (near-flat — low confidence)');
  }

  // ---- Confidence: magnitude + consistency ----------------------------------
  // Magnitude: how strong the dominant deltas are (normalized + saturated).
  const magnitude = clamp01(
    (Math.min(Math.abs(growthPct), 200) / 200) * 0.4 +
      (Math.min(Math.abs(amplificationDelta), 50) / 50) * 0.3 +
      (Math.min(Math.abs(sourceDelta) + Math.abs(communityDelta), 8) / 8) * 0.3,
  );
  // Consistency: do the signal & amplification deltas point the same way?
  const signalDir = Math.sign(growthPct);
  const ampDir = Math.sign(amplificationDelta);
  const consistent =
    signalDir === 0 || ampDir === 0 || signalDir === ampDir ? 1 : 0.55;
  const confidence = round(clamp01(0.25 + magnitude * 0.7) * consistent, 3);

  return {
    narrativeId: curr.narrativeId,
    parentSnapshotId: prev.id,
    childSnapshotId: curr.id,
    changeType,
    growthPct,
    amplificationDelta,
    communityDelta,
    sourceDelta,
    reliabilityDelta,
    contradictionDelta,
    confidence,
    reasoning,
    createdAt: now,
  };
}

/**
 * Pairwise evolution over an ordered snapshot history (oldest → newest). Returns
 * one EvolutionRecord per consecutive pair. Snapshots are sorted by capturedAt
 * (ties by id) for determinism before diffing.
 */
export function evolutionSeries(
  snapshots: NarrativeSnapshot[],
  now: string,
): EvolutionRecord[] {
  const ordered = [...snapshots].sort(
    (a, b) =>
      Date.parse(a.capturedAt) - Date.parse(b.capturedAt) ||
      a.id.localeCompare(b.id),
  );
  const out: EvolutionRecord[] = [];
  for (let i = 1; i < ordered.length; i += 1) {
    out.push(computeNarrativeEvolution(ordered[i - 1], ordered[i], now));
  }
  return out;
}

function orderedByTime(snapshots: NarrativeSnapshot[]): NarrativeSnapshot[] {
  return [...snapshots].sort(
    (a, b) =>
      Date.parse(a.capturedAt) - Date.parse(b.capturedAt) ||
      a.id.localeCompare(b.id),
  );
}

/**
 * Signal velocity = signals gained per day over the full window (first → last
 * snapshot). 0 when fewer than 2 snapshots or a zero-length window.
 */
export function signalVelocity(snapshots: NarrativeSnapshot[]): number {
  const ordered = orderedByTime(snapshots);
  if (ordered.length < 2) return 0;
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const days = (Date.parse(last.capturedAt) - Date.parse(first.capturedAt)) / DAY_MS;
  if (days <= 0) return 0;
  return round((last.signalCount - first.signalCount) / days, 3);
}

/**
 * Amplification acceleration = the sign+magnitude of the 2nd derivative of the
 * amplification series (change in the rate of change). Positive → amplification
 * is accelerating; negative → decelerating. Uses the mean of consecutive
 * second-differences over the time-ordered series. 0 with < 3 snapshots.
 */
export function amplificationAcceleration(snapshots: NarrativeSnapshot[]): number {
  const ordered = orderedByTime(snapshots);
  if (ordered.length < 3) return 0;
  // First differences in amplification per unit (snapshot step).
  const firstDiffs: number[] = [];
  for (let i = 1; i < ordered.length; i += 1) {
    firstDiffs.push(ordered[i].amplificationScore - ordered[i - 1].amplificationScore);
  }
  // Second differences = differences of the first differences.
  let sum = 0;
  let n = 0;
  for (let i = 1; i < firstDiffs.length; i += 1) {
    sum += firstDiffs[i] - firstDiffs[i - 1];
    n += 1;
  }
  return n > 0 ? round(sum / n, 3) : 0;
}
