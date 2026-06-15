// =============================================================================
// Contributor INSIGHTS (Deliverable 13) + TEAM effectiveness (Deliverable 10).
// PURE — derives plain-English strengths/weaknesses from the score set, and a
// team effectiveness score from acceptance/completion/impact.
// =============================================================================

import type { TrustScores } from './types';

const STRONG = 70;
const WEAK = 45;

export interface ContributorInsights {
  strengths: string[];
  weaknesses: string[];
}

/** Map score dimensions to human strength/weakness labels. */
export function contributorInsights(s: TrustScores): ContributorInsights {
  const dims: Array<{ value: number; strong: string; weak: string }> = [
    { value: s.reviewAccuracy, strong: 'Strong Reviewer', weak: 'Review Accuracy' },
    { value: s.signalAccuracy, strong: 'Strong Signal Hunter', weak: 'Signal Accuracy' },
    { value: s.publicationQuality, strong: 'Strong Publisher', weak: 'Publication Quality' },
    { value: s.impact, strong: 'Strong Investigator', weak: 'Investigation Impact' },
    { value: s.reliability, strong: 'Reliable Contributor', weak: 'Completion / Reliability' },
  ];
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  for (const d of dims) {
    if (d.value >= STRONG) strengths.push(d.strong);
    else if (d.value < WEAK) weaknesses.push(d.weak);
  }
  return { strengths, weaknesses };
}

export interface TeamEffectivenessInput {
  acceptance: number; // 0..100 — accepted-work rate
  completion: number; // 0..100 — investigation completion rate
  impact: number; // 0..100 — outcome impact
}

/** Team effectiveness = weighted blend of acceptance, completion, impact (0..100). */
export function teamEffectiveness(i: TeamEffectivenessInput): number {
  const clamp = (n: number): number => (n < 0 ? 0 : n > 100 ? 100 : Math.round(n));
  return clamp(0.4 * i.acceptance + 0.3 * i.completion + 0.3 * i.impact);
}
