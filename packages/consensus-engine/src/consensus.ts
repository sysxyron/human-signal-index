// =============================================================================
// @hsi/consensus-engine — the consensus computation.
//
// Consensus is NOT majority vote. Each finding's WEIGHT blends evidence quality,
// contributor trust, historical accuracy, and governance standing, then is scaled
// by the outcomes of CHALLENGES (upheld lower it) and REVIEWS (approved raise it).
// Positions are grouped by their claim; the highest-weight position is the
// consensus CANDIDATE. The engine never declares truth — it reports the weighted
// agreement, the dissent, and an explicit confidence, all explainable.
//
// WEIGHTS (documented, base components sum to 1):
//   0.35 evidence · 0.30 trust · 0.20 accuracy · 0.15 governance.
// Challenge/review factors (Laplace-smoothed) scale the base in [0.5, 1.0].
// =============================================================================

import type {
  ConfidenceBucket,
  ConsensusFinding,
  ConsensusResult,
  ConsensusSnapshot,
  ConsensusWeights,
  DissentPosition,
  PositionWeight,
} from './types';

/** The documented consensus weights. */
export const CONSENSUS_WEIGHTS: ConsensusWeights = {
  evidence: 0.35,
  trust: 0.3,
  accuracy: 0.2,
  governance: 0.15,
};

/** Sample count at which confidence is no longer discounted for thinness. */
export const FULL_SAMPLE = 8;
const NEUTRAL = 0.5;

export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
export function round(n: number, dp = 4): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

/**
 * The blended weight of a single finding. base ∈ [0,1] from the four signals,
 * scaled by challenge + review factors into [0.5·base, base]. Deterministic.
 */
export function findingWeight(f: ConsensusFinding): number {
  const evidence = clamp01(f.evidenceStrength);
  const trust = clamp01((f.contributorTrust ?? 0) / 100);
  const accuracy = f.historicalAccuracy !== undefined ? clamp01(f.historicalAccuracy) : NEUTRAL;
  const governance = f.governanceStanding !== undefined ? clamp01(f.governanceStanding) : NEUTRAL;

  const base =
    CONSENSUS_WEIGHTS.evidence * evidence +
    CONSENSUS_WEIGHTS.trust * trust +
    CONSENSUS_WEIGHTS.accuracy * accuracy +
    CONSENSUS_WEIGHTS.governance * governance;

  // Laplace-smoothed challenge factor: more UPHELD challenges → lower.
  const upheld = Math.max(0, f.challengesUpheld ?? 0);
  const rejected = Math.max(0, f.challengesRejected ?? 0);
  const challengeFactor = (rejected + 1) / (upheld + rejected + 2); // 0.5 when none.

  // Review factor: more APPROVED reviews → higher.
  const approved = Math.max(0, f.reviewsApproved ?? 0);
  const revRejected = Math.max(0, f.reviewsRejected ?? 0);
  const reviewFactor = (approved + 1) / (approved + revRejected + 2);

  // Mild endorsement bonus (capped).
  const endorseBonus = Math.min(0.1, Math.max(0, f.endorsements ?? 0) * 0.01);

  const scaled = base * (0.5 + 0.25 * challengeFactor + 0.25 * reviewFactor) + endorseBonus * base;
  return round(clamp01(scaled));
}

/** Group findings into per-position weights (sorted high→low). */
export function positionWeights(findings: ConsensusFinding[]): PositionWeight[] {
  const groups = new Map<string, ConsensusFinding[]>();
  for (const f of findings) {
    const arr = groups.get(f.position) ?? [];
    arr.push(f);
    groups.set(f.position, arr);
  }
  const weightOf = new Map<string, number>();
  for (const f of findings) weightOf.set(f.id, findingWeight(f));

  const total = findings.reduce((a, f) => a + (weightOf.get(f.id) ?? 0), 0) || 1;

  const out: PositionWeight[] = [];
  for (const [position, fs] of groups) {
    const weight = fs.reduce((a, f) => a + (weightOf.get(f.id) ?? 0), 0);
    const wsum = weight || 1;
    const evidenceStrength = fs.reduce((a, f) => a + clamp01(f.evidenceStrength) * (weightOf.get(f.id) ?? 0), 0) / wsum;
    const meanConfidence = fs.reduce((a, f) => a + clamp01(f.confidence) * (weightOf.get(f.id) ?? 0), 0) / wsum;
    out.push({
      position,
      weight: round(weight),
      share: round(weight / total),
      findingCount: fs.length,
      contributorCount: new Set(fs.map((f) => f.contributorId)).size,
      evidenceStrength: round(evidenceStrength),
      meanConfidence: round(meanConfidence),
    });
  }
  return out.sort((a, b) => b.weight - a.weight || a.position.localeCompare(b.position));
}

/** How concentrated the weighted mass is on the leading position, 0..1. */
export function computeAgreementScore(findings: ConsensusFinding[]): number {
  if (findings.length === 0) return 0;
  const positions = positionWeights(findings);
  const total = positions.reduce((a, p) => a + p.weight, 0) || 1;
  const top = positions[0]?.weight ?? 0;
  return round(top / total);
}

/** Weighted evidence support behind a position (default: the leading one), 0..1. */
export function computeEvidenceSupport(findings: ConsensusFinding[], position?: string): number {
  const positions = positionWeights(findings);
  if (positions.length === 0) return 0;
  const target = position
    ? positions.find((p) => p.position === position)
    : positions[0];
  return target ? target.evidenceStrength : 0;
}

/** Confidence distribution across all findings (5 buckets of 0.2). */
export function computeConfidenceDistribution(findings: ConsensusFinding[]): ConfidenceBucket[] {
  const edges = [0, 0.2, 0.4, 0.6, 0.8, 1.0001];
  const buckets: ConfidenceBucket[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const lower = edges[i];
    const upper = i === edges.length - 2 ? 1 : edges[i + 1];
    const count = findings.filter((f) => {
      const c = clamp01(f.confidence);
      return c >= edges[i] && c < edges[i + 1];
    }).length;
    buckets.push({ label: `${Math.round(lower * 100)}–${Math.round(upper * 100)}%`, lower, upper, count });
  }
  return buckets;
}

/** Compute the dissent positions relative to a consensus position. */
export function computeDissent(findings: ConsensusFinding[], consensusPosition: string | null): DissentPosition[] {
  const positions = positionWeights(findings);
  return positions
    .filter((p) => p.position !== consensusPosition)
    .map((p) => ({
      position: p.position,
      share: p.share,
      weight: p.weight,
      findingCount: p.findingCount,
      contributorCount: p.contributorCount,
      evidenceStrength: p.evidenceStrength,
      reason:
        `${p.contributorCount} contributor(s) hold "${p.position}" with ${Math.round(p.evidenceStrength * 100)}% ` +
        `weighted evidence (share ${Math.round(p.share * 100)}%).`,
    }));
}

/** The core consensus result (candidate position + agreement + dissent + confidence). */
export function computeConsensus(findings: ConsensusFinding[]): ConsensusResult {
  if (findings.length === 0) {
    return { consensusPosition: null, agreementScore: 0, evidenceStrength: 0, confidence: 0, dissentPositions: [] };
  }
  const positions = positionWeights(findings);
  const consensusPosition = positions[0]?.position ?? null;
  const agreementScore = computeAgreementScore(findings);
  const evidenceStrength = computeEvidenceSupport(findings, consensusPosition ?? undefined);
  const sampleFactor = clamp01(findings.length / FULL_SAMPLE);
  const confidence = round(agreementScore * evidenceStrength * (0.5 + 0.5 * sampleFactor));
  const dissentPositions = computeDissent(findings, consensusPosition);
  return { consensusPosition, agreementScore, evidenceStrength, confidence, dissentPositions };
}

/**
 * Build a full, explainable consensus snapshot. Deterministic — pass `now` via
 * opts. ALWAYS includes limitations; NEVER declares truth. Inputs not mutated.
 */
export function buildConsensusSnapshot(
  investigationId: string,
  findings: ConsensusFinding[],
  opts: { now: string },
): ConsensusSnapshot {
  const positions = positionWeights(findings);
  const core = computeConsensus(findings);
  const confidenceDistribution = computeConfidenceDistribution(findings);
  const contributorCount = new Set(findings.map((f) => f.contributorId)).size;

  const explanation: string[] = [];
  if (core.consensusPosition) {
    explanation.push(
      `Consensus candidate "${core.consensusPosition}" leads with ${Math.round((positions[0]?.share ?? 0) * 100)}% of weighted support.`,
    );
    explanation.push(
      `Agreement ${Math.round(core.agreementScore * 100)}% × evidence ${Math.round(core.evidenceStrength * 100)}% × sample factor ` +
        `→ confidence ${Math.round(core.confidence * 100)}%.`,
    );
    explanation.push(
      `Weighting: ${CONSENSUS_WEIGHTS.evidence} evidence · ${CONSENSUS_WEIGHTS.trust} trust · ` +
        `${CONSENSUS_WEIGHTS.accuracy} accuracy · ${CONSENSUS_WEIGHTS.governance} governance, scaled by challenge/review outcomes.`,
    );
    if (core.dissentPositions.length > 0) {
      explanation.push(`${core.dissentPositions.length} dissenting position(s) recorded — not discarded.`);
    }
  } else {
    explanation.push('No findings — no consensus candidate.');
  }

  const limitations: string[] = [];
  if (findings.length < FULL_SAMPLE) {
    limitations.push(
      `Only ${findings.length} finding(s) (below the ${FULL_SAMPLE}-finding floor); confidence is discounted.`,
    );
  }
  if (positions.length === 1 && findings.length > 0) {
    limitations.push('Only one position present — apparent agreement reflects no contest yet, not a resolved debate.');
  }
  limitations.push(
    'Consensus is a weighted CANDIDATE, not truth. It is advisory and requires human governance to be accepted or published.',
  );

  return {
    investigationId,
    consensusPosition: core.consensusPosition,
    agreementScore: core.agreementScore,
    evidenceStrength: core.evidenceStrength,
    confidence: core.confidence,
    positions,
    dissentPositions: core.dissentPositions,
    confidenceDistribution,
    sampleCount: findings.length,
    contributorCount,
    explanation,
    limitations,
    generatedAt: opts.now,
  };
}
