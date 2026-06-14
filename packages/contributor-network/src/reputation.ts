// =============================================================================
// Reputation — represents QUALITY (separate from XP/activity). A contributor can
// have high XP but low reputation. Each category is 0..100 and is EXPLAINABLE:
// computeReputation() returns the score plus the factors that produced it.
// =============================================================================

import type { QualitySignals, ReputationCategory, ReputationScores } from './types';

export const REPUTATION_CATEGORIES: ReputationCategory[] = [
  'research_reputation',
  'review_reputation',
  'publication_reputation',
  'governance_reputation',
  'trust_reputation',
];

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);
const pct = (n: number): number => Math.round(clamp01(n) * 100);

/** Acceptance ratio of submitted signals (0..1); neutral 0.5 when no history. */
export function acceptanceRatio(accepted: number, rejected: number): number {
  const total = accepted + rejected;
  if (total <= 0) return 0.5;
  return accepted / total;
}

export interface ReputationExplanation {
  category: ReputationCategory;
  score: number;
  factors: Array<{ label: string; weight: number; value: number }>;
}

/**
 * Compute the five reputation scores from quality signals. Pure + deterministic.
 * Weights are fixed; each factor is a 0..1 quality value.
 */
export function computeReputation(q: QualitySignals): ReputationScores {
  const accept = acceptanceRatio(q.acceptedSignals, q.rejectedSignals);
  return {
    research_reputation: pct(0.4 * accept + 0.35 * clamp01(q.evidenceQuality) + 0.25 * clamp01(q.traceabilityScore)),
    review_reputation: pct(0.7 * clamp01(q.reviewAccuracy) + 0.3 * clamp01(q.consensusAgreement)),
    publication_reputation: pct(0.6 * clamp01(q.publicationQuality) + 0.4 * clamp01(q.traceabilityScore)),
    governance_reputation: pct(0.6 * clamp01(q.governanceOutcomes) + 0.4 * clamp01(q.consensusAgreement)),
    trust_reputation: pct(0.4 * clamp01(q.traceabilityScore) + 0.3 * accept + 0.3 * clamp01(q.evidenceQuality)),
  };
}

/** Explain a single category's score (which factors, weights, values). */
export function explainReputation(category: ReputationCategory, q: QualitySignals): ReputationExplanation {
  const accept = acceptanceRatio(q.acceptedSignals, q.rejectedSignals);
  const map: Record<ReputationCategory, Array<{ label: string; weight: number; value: number }>> = {
    research_reputation: [
      { label: 'Signal acceptance', weight: 0.4, value: accept },
      { label: 'Evidence quality', weight: 0.35, value: clamp01(q.evidenceQuality) },
      { label: 'Traceability', weight: 0.25, value: clamp01(q.traceabilityScore) },
    ],
    review_reputation: [
      { label: 'Review accuracy', weight: 0.7, value: clamp01(q.reviewAccuracy) },
      { label: 'Consensus agreement', weight: 0.3, value: clamp01(q.consensusAgreement) },
    ],
    publication_reputation: [
      { label: 'Publication quality', weight: 0.6, value: clamp01(q.publicationQuality) },
      { label: 'Traceability', weight: 0.4, value: clamp01(q.traceabilityScore) },
    ],
    governance_reputation: [
      { label: 'Governance outcomes', weight: 0.6, value: clamp01(q.governanceOutcomes) },
      { label: 'Consensus agreement', weight: 0.4, value: clamp01(q.consensusAgreement) },
    ],
    trust_reputation: [
      { label: 'Traceability', weight: 0.4, value: clamp01(q.traceabilityScore) },
      { label: 'Signal acceptance', weight: 0.3, value: accept },
      { label: 'Evidence quality', weight: 0.3, value: clamp01(q.evidenceQuality) },
    ],
  };
  const factors = map[category];
  return { category, score: computeReputation(q)[category], factors };
}

/** Single headline quality score (mean of the five categories), 0..100. */
export function overallReputation(scores: ReputationScores): number {
  const vals = REPUTATION_CATEGORIES.map((c) => scores[c]);
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}
