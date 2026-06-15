// =============================================================================
// Quality scoring — PURE + DETERMINISTIC. Every score is 0..100. With no history
// a score is NEUTRAL (50), so a brand-new contributor is neither trusted nor
// distrusted. Volume never raises a quality score — only the ratio of GOOD
// outcomes (decided by others) does, which is what makes authority quality-based.
// =============================================================================

import type { ReviewBreakdown, TrustInputs, TrustScores } from './types';

const NEUTRAL = 50;
const clamp = (n: number): number => (n < 0 ? 0 : n > 100 ? 100 : Math.round(n));
const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/** Deliverable 2 — signal accuracy = accepted / submitted (neutral with no data). */
export function signalAccuracy(i: Pick<TrustInputs, 'signalsSubmitted' | 'signalsAccepted' | 'signalsRejected'>): number {
  const decided = i.signalsAccepted + i.signalsRejected;
  // Prefer accepted/submitted; fall back to accepted/decided; neutral if neither.
  const denom = i.signalsSubmitted > 0 ? i.signalsSubmitted : decided;
  if (denom <= 0) return NEUTRAL;
  return clamp((i.signalsAccepted / denom) * 100);
}

/** Deliverable 3 — review accuracy = agreement with the final governance outcome. */
export function reviewAccuracy(i: Pick<TrustInputs, 'reviewAgreements' | 'reviewDisagreements'>): ReviewBreakdown {
  const total = i.reviewAgreements + i.reviewDisagreements;
  if (total <= 0) return { agreementPct: 0, disagreementPct: 0, score: NEUTRAL };
  const agreementPct = clamp((i.reviewAgreements / total) * 100);
  return { agreementPct, disagreementPct: 100 - agreementPct, score: agreementPct };
}

/** Deliverable 4 — publication quality: accepted ratio + traceability + governance. */
export function publicationQuality(i: Pick<TrustInputs, 'publicationsApproved' | 'publicationsRejected' | 'publicationTraceability' | 'governanceApprovalRate'>): number {
  const decided = i.publicationsApproved + i.publicationsRejected;
  if (decided <= 0 && i.publicationTraceability <= 0) return NEUTRAL;
  const acceptRatio = decided > 0 ? i.publicationsApproved / decided : 0.5;
  const score = 0.5 * acceptRatio + 0.3 * clamp01(i.publicationTraceability) + 0.2 * clamp01(i.governanceApprovalRate);
  return clamp(score * 100);
}

/** Deliverable 5 — reliability: consistency + completion, penalised by abandon/overdue. */
export function reliability(i: Pick<TrustInputs, 'investigationsCompleted' | 'investigationsAbandoned' | 'overdueAssignments' | 'activeWindows' | 'totalWindows'>): number {
  const finished = i.investigationsCompleted + i.investigationsAbandoned;
  const completionRate = finished > 0 ? i.investigationsCompleted / finished : 0.5; // neutral with no data
  const consistency = i.totalWindows > 0 ? clamp01(i.activeWindows / i.totalWindows) : 0.5;
  // Overdue penalty saturates: each overdue costs, capped at 0.4 total.
  const overduePenalty = Math.min(0.4, i.overdueAssignments * 0.05);
  const base = 0.6 * completionRate + 0.4 * consistency;
  return clamp((base - overduePenalty) * 100);
}

/** Phase 28 — investigation IMPACT: share of work that produced real outcomes. */
export function impactScore(i: Pick<TrustInputs, 'investigationsCompleted' | 'acceptedFindings' | 'governanceActions' | 'publicationsDelivered'>): number {
  if (i.investigationsCompleted <= 0 && i.acceptedFindings <= 0 && i.governanceActions <= 0 && i.publicationsDelivered <= 0) return NEUTRAL;
  const outcomes = i.acceptedFindings * 1 + i.governanceActions * 1.5 + i.publicationsDelivered * 2;
  const denom = Math.max(1, i.investigationsCompleted) * 2; // 2 = a "full impact" weight per completed investigation
  return clamp(clamp01(outcomes / denom) * 100);
}

/** Phase 28 — governance EFFECTIVENESS: decisions confirmed by later outcomes. */
export function governanceEffectiveness(i: Pick<TrustInputs, 'governanceConfirmed' | 'governanceDecisions'>): number {
  if (i.governanceDecisions <= 0) return NEUTRAL;
  return clamp((i.governanceConfirmed / i.governanceDecisions) * 100);
}

/**
 * Weights for the authority model (Deliverable 9 — real inputs, no placeholder).
 * Sum to 1. Authority now blends trust, accuracy, reliability, publication quality,
 * AND investigation impact. Deterministic.
 */
export const AUTHORITY_WEIGHTS = { trust: 0.3, accuracy: 0.2, reliability: 0.2, publicationQuality: 0.15, impact: 0.15 } as const;

/** Weights for the trust model (trustworthiness of a contributor's output). */
export const TRUST_WEIGHTS = { accuracy: 0.6, reliability: 0.4 } as const;

/** Compute the full score set from inputs. PURE + DETERMINISTIC. */
export function computeTrust(i: TrustInputs): TrustScores {
  const sig = signalAccuracy(i);
  const rev = reviewAccuracy(i).score;
  const pub = publicationQuality(i);
  const rel = reliability(i);
  const impact = impactScore(i);
  const governance = governanceEffectiveness(i);
  const accuracy = clamp((sig + rev) / 2);
  const trust = clamp(TRUST_WEIGHTS.accuracy * accuracy + TRUST_WEIGHTS.reliability * rel);
  const authority = clamp(
    AUTHORITY_WEIGHTS.trust * trust +
    AUTHORITY_WEIGHTS.accuracy * accuracy +
    AUTHORITY_WEIGHTS.reliability * rel +
    AUTHORITY_WEIGHTS.publicationQuality * pub +
    AUTHORITY_WEIGHTS.impact * impact,
  );
  return { signalAccuracy: sig, reviewAccuracy: rev, publicationQuality: pub, reliability: rel, impact, governanceEffectiveness: governance, accuracy, trust, authority };
}
