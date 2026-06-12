// =============================================================================
// @hsi/executive-intelligence — the STRATEGIC PRIORITY engine.
//
// computePriorityScore blends urgency, impact, confidence, and evidence with
// category modifiers (risk, opportunity, trust, consensus, governance) into a
// 0..100 score. rankPriority orders the items. Every priority is EXPLAINABLE —
// it enumerates the numbers + the reasoning — and carries explicit limitations.
//
// WEIGHTS (documented, base components sum to 1):
//   0.30 urgency · 0.35 impact · 0.20 confidence · 0.15 evidence.
// Category modifiers add up to +0.4 of headroom (risk/opportunity/low-trust/
// contested-consensus/governance-pending), then the whole is mapped to 0..100.
// =============================================================================

import type {
  AttentionLevel,
  PriorityInput,
  StrategicPriority,
} from './types';

export const PRIORITY_WEIGHTS = { urgency: 0.3, impact: 0.35, confidence: 0.2, evidence: 0.15 };
const NEUTRAL = 0.5;

export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
export function round(n: number, dp = 2): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

/** 0..1 urgency (defaults neutral). */
export function computeUrgency(input: PriorityInput): number {
  if (input.urgency !== undefined) return clamp01(input.urgency);
  // Derive from category: contested consensus + pending governance + critical risk are urgent.
  let u = NEUTRAL;
  if (input.governancePending) u = Math.max(u, 0.7);
  if (input.riskScore !== undefined) u = Math.max(u, clamp01(input.riskScore));
  if (input.consensusAgreement !== undefined && input.consensusAgreement < 0.5) u = Math.max(u, 0.65);
  return round(u, 4);
}

/** 0..1 impact (defaults neutral; raised by risk/opportunity/low-trust). */
export function computeImpact(input: PriorityInput): number {
  if (input.impact !== undefined) return clamp01(input.impact);
  let i = NEUTRAL;
  if (input.riskScore !== undefined) i = Math.max(i, clamp01(input.riskScore));
  if (input.opportunityScore !== undefined) i = Math.max(i, clamp01(input.opportunityScore));
  if (input.trustScore !== undefined && input.trustScore < 40) i = Math.max(i, 0.7);
  return round(i, 4);
}

/** 0..1 confidence weight (defaults neutral). */
export function computeConfidenceWeight(input: PriorityInput): number {
  return round(input.confidence !== undefined ? clamp01(input.confidence) : NEUTRAL, 4);
}

/** 0..1 evidence weight (defaults neutral). */
export function computeEvidenceWeight(input: PriorityInput): number {
  return round(input.evidenceStrength !== undefined ? clamp01(input.evidenceStrength) : NEUTRAL, 4);
}

/** The category modifier (0..0.4) reflecting risk/opportunity/trust/consensus/governance. */
function categoryModifier(input: PriorityInput): { value: number; reasons: string[] } {
  let mod = 0;
  const reasons: string[] = [];
  if (input.riskScore !== undefined && input.riskScore > 0) {
    mod += 0.12 * clamp01(input.riskScore);
    reasons.push(`risk ${Math.round(clamp01(input.riskScore) * 100)}%`);
  }
  if (input.opportunityScore !== undefined && input.opportunityScore > 0) {
    mod += 0.1 * clamp01(input.opportunityScore);
    reasons.push(`opportunity ${Math.round(clamp01(input.opportunityScore) * 100)}%`);
  }
  if (input.trustScore !== undefined && input.trustScore < 50) {
    const lowTrust = (50 - input.trustScore) / 50;
    mod += 0.08 * clamp01(lowTrust);
    reasons.push(`low trust ${Math.round(input.trustScore)}/100`);
  }
  if (input.consensusAgreement !== undefined && input.consensusAgreement < 0.6) {
    const contest = (0.6 - input.consensusAgreement) / 0.6;
    mod += 0.06 * clamp01(contest);
    reasons.push(`contested consensus (${Math.round(input.consensusAgreement * 100)}% agreement)`);
  }
  if (input.governancePending) {
    mod += 0.04;
    reasons.push('governance decision pending');
  }
  return { value: Math.min(0.4, mod), reasons };
}

/** Compute a 0..100 priority score. Deterministic. */
export function computePriorityScore(input: PriorityInput): number {
  const urgency = computeUrgency(input);
  const impact = computeImpact(input);
  const confidence = computeConfidenceWeight(input);
  const evidence = computeEvidenceWeight(input);
  const base =
    PRIORITY_WEIGHTS.urgency * urgency +
    PRIORITY_WEIGHTS.impact * impact +
    PRIORITY_WEIGHTS.confidence * confidence +
    PRIORITY_WEIGHTS.evidence * evidence;
  const { value: modifier } = categoryModifier(input);
  return round(clamp01(base + modifier) * 100);
}

/** Map a 0..100 priority score to an attention level. */
export function attentionForScore(score: number): AttentionLevel {
  if (score >= 75) return 'urgent';
  if (score >= 55) return 'elevated';
  if (score >= 40) return 'notable';
  return 'routine';
}

/** Build the explanation lines for a priority. */
export function buildPriorityExplanation(input: PriorityInput): string[] {
  const urgency = computeUrgency(input);
  const impact = computeImpact(input);
  const confidence = computeConfidenceWeight(input);
  const evidence = computeEvidenceWeight(input);
  const { reasons } = categoryModifier(input);
  const lines = [
    `Urgency ${Math.round(urgency * 100)}% × ${PRIORITY_WEIGHTS.urgency}, impact ${Math.round(impact * 100)}% × ${PRIORITY_WEIGHTS.impact}.`,
    `Confidence ${Math.round(confidence * 100)}% × ${PRIORITY_WEIGHTS.confidence}, evidence ${Math.round(evidence * 100)}% × ${PRIORITY_WEIGHTS.evidence}.`,
  ];
  if (reasons.length > 0) lines.push(`Category modifiers: ${reasons.join('; ')}.`);
  return lines;
}

/** Build the limitations for a priority. */
function buildPriorityLimitations(input: PriorityInput): string[] {
  const limitations: string[] = [];
  const absent = ['urgency', 'impact', 'confidence', 'evidenceStrength'].filter((k) => input[k as keyof PriorityInput] === undefined);
  if (absent.length > 0) limitations.push(`${absent.length} signal(s) (${absent.join(', ')}) defaulted to a neutral 50%.`);
  limitations.push('Priority is advisory and ranks attention only — it never decides or acts. Human review required.');
  return limitations;
}

function recommendationFor(input: PriorityInput, level: AttentionLevel): string {
  const verb = level === 'urgent' ? 'Review immediately' : level === 'elevated' ? 'Review soon' : level === 'notable' ? 'Schedule a review' : 'Monitor';
  switch (input.kind) {
    case 'risk': return `${verb}: assess the risk and decide on mitigation (advisory).`;
    case 'opportunity': return `${verb}: evaluate whether to pursue the opportunity (advisory).`;
    case 'governance': return `${verb}: a governance decision is pending and needs a human.`;
    case 'consensus': return `${verb}: the consensus is contested — route to governance.`;
    case 'forecast': return `${verb}: a forecast is shifting — verify assumptions + invalidation criteria.`;
    case 'warning': return `${verb}: an early warning is active — acknowledge or resolve it.`;
    case 'trust': return `${verb}: trust has changed — consider recalibration governance.`;
    default: return `${verb}: investigate further. Advisory only.`;
  }
}

/** Rank a set of priority inputs into explainable StrategicPriorities (high→low). */
export function rankPriority(inputs: PriorityInput[]): StrategicPriority[] {
  const scored = inputs.map((input) => {
    const score = computePriorityScore(input);
    const level = attentionForScore(score);
    return {
      id: input.id,
      kind: input.kind,
      title: input.title,
      score,
      urgency: computeUrgency(input),
      impact: computeImpact(input),
      confidenceWeight: computeConfidenceWeight(input),
      evidenceWeight: computeEvidenceWeight(input),
      rank: 0,
      attentionLevel: level,
      recommendation: recommendationFor(input, level),
      explanation: buildPriorityExplanation(input),
      limitations: buildPriorityLimitations(input),
      ...(input.entityRef ? { entityRef: input.entityRef } : {}),
    } satisfies StrategicPriority;
  });
  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return scored.map((p, i) => ({ ...p, rank: i + 1 }));
}
