// =============================================================================
// Impact + effectiveness scoring (Deliverables 3–8). PURE + DETERMINISTIC.
// All scores are 0..100. Counts are converted to 0..100 by SATURATION so a few
// high-quality outcomes score well and raw volume cannot dominate.
// =============================================================================

import type {
  ContributorImpactInputs, ImpactInputs, InvestigationImpactInputs,
  PublicationReachInputs, SignalEffectiveness, SignalEffectivenessInputs, TeamImpactInputs,
} from './types';

const clamp = (n: number): number => (n < 0 ? 0 : n > 100 ? 100 : Math.round(n));
const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);
/** Saturating count → 0..100: `per` units reaches 100. */
const sat = (count: number, per: number): number => clamp(Math.min(1, Math.max(0, count) / per) * 100);
const rate = (num: number, den: number): number => (den <= 0 ? 0 : clamp((num / den) * 100));

/**
 * IMPACT SCORE (Deliverable 3) — 0..100.
 *
 *   findingsScore   = saturate(acceptedFindings, 5)      // 5 findings → 100
 *   governanceScore = saturate(governanceActions, 4)     // 4 actions  → 100
 *   impact = 0.25*findingsScore + 0.20*governanceScore + 0.20*publicationQuality
 *          + 0.15*traceability + 0.10*evidenceQuality + 0.10*(verificationLevel*100)
 *
 * Weights sum to 1. A purely-active contributor with no accepted/verified work
 * scores low; quality + verified outcomes dominate.
 */
export const IMPACT_WEIGHTS = {
  findings: 0.25, governance: 0.2, publicationQuality: 0.2, traceability: 0.15, evidenceQuality: 0.1, verification: 0.1,
} as const;

export function impactScore(i: ImpactInputs): number {
  const findingsScore = sat(i.acceptedFindings, 5);
  const governanceScore = sat(i.governanceActions, 4);
  return clamp(
    IMPACT_WEIGHTS.findings * findingsScore +
    IMPACT_WEIGHTS.governance * governanceScore +
    IMPACT_WEIGHTS.publicationQuality * clamp(i.publicationQuality) +
    IMPACT_WEIGHTS.traceability * clamp(i.traceability) +
    IMPACT_WEIGHTS.evidenceQuality * clamp(i.evidenceQuality) +
    IMPACT_WEIGHTS.verification * clamp01(i.verificationLevel) * 100,
  );
}

/** SIGNAL EFFECTIVENESS (Deliverable 4) — conversion funnel from submission to outcome. */
export function signalEffectiveness(i: SignalEffectivenessInputs): SignalEffectiveness {
  const investigationRate = rate(i.ledToInvestigation, i.signalsSubmitted);
  const findingRate = rate(i.ledToAcceptedFinding, i.signalsSubmitted);
  const publicationRate = rate(i.ledToPublication, i.signalsSubmitted);
  const governanceRate = rate(i.ledToGovernanceAction, i.signalsSubmitted);
  const verifiedRate = rate(i.ledToVerifiedOutcome, i.signalsSubmitted);
  // Headline: verified + governance outcomes weigh most; investigation least.
  const score = clamp(0.15 * investigationRate + 0.2 * findingRate + 0.2 * publicationRate + 0.2 * governanceRate + 0.25 * verifiedRate);
  return { investigationRate, findingRate, publicationRate, governanceRate, verifiedRate, score };
}

/** INVESTIGATION IMPACT (Deliverable 5). */
export function investigationImpact(i: InvestigationImpactInputs): number {
  return clamp(
    0.3 * sat(i.acceptedFindings, 3) +
    0.25 * sat(i.governanceActions, 2) +
    0.2 * sat(i.publications, 2) +
    0.25 * sat(i.realOutcomes, 3),
  );
}

/** CONTRIBUTOR IMPACT (Deliverable 6) — outcomes created, NOT activity volume. */
export function contributorImpact(i: ContributorImpactInputs): number {
  return clamp(
    0.3 * sat(i.verifiedFindings, 5) +
    0.2 * sat(i.governanceActions, 4) +
    0.2 * sat(i.publicationsDriven, 4) +
    0.15 * sat(i.outcomesCreated, 6) +
    0.15 * clamp01(i.attributedWeight / 10) * 100, // attributed weight saturates at 10
  );
}

/** TEAM IMPACT (Deliverable 7) — aggregate outcomes, normalised per member. */
export function teamImpact(i: TeamImpactInputs): number {
  const perMember = Math.max(1, i.members);
  return clamp(
    0.3 * sat(i.verifiedFindings / perMember, 2) +
    0.25 * sat(i.governanceActions / perMember, 1.5) +
    0.2 * sat(i.publications / perMember, 1.5) +
    0.25 * sat(i.outcomesCreated / perMember, 2.5),
  );
}

/** PUBLICATION REACH (Deliverable 8). Unpublished work has a low ceiling. */
export function publicationReach(i: PublicationReachInputs): number {
  const base = clamp(
    0.3 * clamp(i.publicationQuality) +
    0.25 * clamp(i.traceability) +
    0.2 * sat(i.evidenceVolume, 8) +
    0.25 * sat(i.outcomesProduced, 3),
  );
  return i.published ? base : Math.round(base * 0.4); // drafts can't have full reach
}
