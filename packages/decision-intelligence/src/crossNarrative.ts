// =============================================================================
// @hsi/decision-intelligence — cross-narrative impact ("if A changes, then B?").
//
// computeCrossNarrativeImpact scores how strongly a SOURCE narrative couples to
// each TARGET narrative and classifies the relationship. The strength (0..100) is
// a DOCUMENTED blend of four grounded signals:
//
//   influence  (0..40)  — influence-graph edge weight from source → target
//   overlap    (0..30)  — shared communities + shared sources (audience overlap)
//   ampCoupling(0..20)  — how aligned their amplification levels are (co-amplified)
//   coMovement (0..10)  — temporal co-movement of their trajectories (same sign)
//
// impactType classification (from the dominant signals + co-movement sign):
//   * triggers     — very high influence (the source clearly precedes/drives target)
//   * amplifies    — positive co-movement + meaningful coupling
//   * reinforces   — high audience overlap + aligned amplification (mutual support)
//   * competes     — meaningful overlap but OPPOSITE co-movement (zero-sum attention)
//   * dampens      — coupling present but target trajectory falls as source rises
//   * neutral      — weak coupling all round
//
// confidence rises with evidence richness (more grounded signals → higher). Each
// pair carries reasoning. Deterministic; caller injects `now`.
// =============================================================================

import type { DecisionInput, CrossNarrativeImpact, ImpactType } from './types';

function round(n: number, dp = 1): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

/** Net trajectory slope (signal growth %) over the snapshot window. */
function trajectorySlope(
  snaps: { capturedAt: string; signalCount: number }[],
): number {
  if (snaps.length < 2) return 0;
  const ordered = [...snaps].sort(
    (a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt),
  );
  const first = ordered[0].signalCount;
  const last = ordered[ordered.length - 1].signalCount;
  return ((last - first) / Math.max(1, first)) * 100;
}

/** Final amplification level over a snapshot window. */
function finalAmp(snaps: { capturedAt: string; amplificationScore: number }[]): number {
  if (snaps.length === 0) return 0;
  const ordered = [...snaps].sort(
    (a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt),
  );
  return ordered[ordered.length - 1].amplificationScore;
}

export interface CrossNarrativeTarget {
  narrativeId: string;
  snapshots: { capturedAt: string; signalCount: number; amplificationScore: number }[];
  /** Optional influence edge weight from source → this target (0..100). */
  influenceFromSource?: number;
  /** Communities shared with the source narrative. */
  sharedCommunities?: number;
  /** Sources shared with the source narrative. */
  sharedSources?: number;
}

/**
 * Compute the source narrative's impact on each target. Deterministic; caller
 * injects `now`. Returns one CrossNarrativeImpact per target, sorted by strength.
 */
export function computeCrossNarrativeImpact(
  source: DecisionInput,
  targets: CrossNarrativeTarget[],
  now: string,
): CrossNarrativeImpact[] {
  void now;
  const srcSlope = trajectorySlope(source.snapshots);
  const srcAmp = finalAmp(source.snapshots);

  // Build an influence lookup from the source's outbound edges as a fallback.
  const outById = new Map<string, number>();
  for (const e of source.influenceOut ?? []) {
    if (e.sourceNarrativeId === source.narrativeId) {
      outById.set(e.targetNarrativeId, e.influenceScore);
    }
  }

  const results = targets.map((t) => {
    const influenceRaw =
      t.influenceFromSource ?? outById.get(t.narrativeId) ?? 0;
    const tgtSlope = trajectorySlope(t.snapshots);
    const tgtAmp = finalAmp(t.snapshots);

    // ---- Components (documented caps). --------------------------------------
    const influence = clamp((influenceRaw / 100) * 40, 0, 40);
    const overlapRaw = (t.sharedCommunities ?? 0) * 5 + (t.sharedSources ?? 0) * 4;
    const overlap = clamp(overlapRaw, 0, 30);
    // Amplification coupling: aligned high amplification = stronger coupling.
    const ampAlign = 1 - Math.abs(srcAmp - tgtAmp) / 100; // 1 = identical levels
    const ampCoupling = clamp(((srcAmp + tgtAmp) / 200) * ampAlign * 20, 0, 20);
    // Co-movement: same-sign slopes → positive contribution.
    const sameSign = Math.sign(srcSlope) === Math.sign(tgtSlope) && srcSlope !== 0;
    const coMovement = sameSign ? 10 : 0;

    const impactStrength = round(
      clamp(influence + overlap + ampCoupling + coMovement, 0, 100),
      1,
    );

    // ---- Classification. ----------------------------------------------------
    const meaningfulCoupling = influence + overlap + ampCoupling >= 20;
    const oppositeMovement =
      srcSlope !== 0 &&
      tgtSlope !== 0 &&
      Math.sign(srcSlope) !== Math.sign(tgtSlope);

    let impactType: ImpactType;
    if (influenceRaw >= 70) {
      impactType = 'triggers';
    } else if (meaningfulCoupling && sameSign) {
      impactType = 'amplifies';
    } else if (overlap >= 18 && ampAlign >= 0.7 && meaningfulCoupling) {
      impactType = 'reinforces';
    } else if (meaningfulCoupling && oppositeMovement) {
      // Shared audience but diverging trajectories: zero-sum attention OR drag.
      impactType = overlap >= 15 ? 'competes' : 'dampens';
    } else {
      impactType = 'neutral';
    }

    // ---- Confidence: richer evidence → higher (never certainty). ------------
    let evidenceCount = 0;
    if (influenceRaw > 0) evidenceCount += 1;
    if ((t.sharedCommunities ?? 0) > 0 || (t.sharedSources ?? 0) > 0) evidenceCount += 1;
    if (t.snapshots.length >= 2) evidenceCount += 1;
    if (source.snapshots.length >= 2) evidenceCount += 1;
    const confidence = round(clamp(0.2 + evidenceCount * 0.15, 0.2, 0.85), 3);

    const reasoning =
      `${source.narrativeId} → ${t.narrativeId}: strength ${impactStrength}/100 ` +
      `(influence ${round(influence, 1)}, overlap ${round(overlap, 1)}, amp-coupling ${round(ampCoupling, 1)}, co-move ${coMovement}). ` +
      `Source slope ${round(srcSlope, 1)}%, target slope ${round(tgtSlope, 1)}% → classified "${impactType}". ` +
      'Estimate from coupling signals; never certainty.';

    return {
      sourceNarrativeId: source.narrativeId,
      targetNarrativeId: t.narrativeId,
      impactType,
      impactStrength,
      confidence,
      reasoning,
    };
  });

  results.sort(
    (a, b) =>
      b.impactStrength - a.impactStrength ||
      a.targetNarrativeId.localeCompare(b.targetNarrativeId),
  );
  return results;
}
