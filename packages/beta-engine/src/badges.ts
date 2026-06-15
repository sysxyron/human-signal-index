// =============================================================================
// Recognition badges (Deliverable 19). PURE. Awarded automatically when a tester
// crosses a measurable threshold — recognition only, never access.
// =============================================================================

import type { BetaBadgeDef, BetaBadgeKey, TesterStats } from './types';

export const BETA_BADGES: BetaBadgeDef[] = [
  { key: 'found_bug', name: 'Found Bug', description: 'Reported a verified issue.' },
  { key: 'power_tester', name: 'Power Tester', description: 'Completed 10 missions.' },
  { key: 'elite_researcher', name: 'Elite Researcher', description: '25 accepted signals.' },
  { key: 'review_specialist', name: 'Review Specialist', description: '50 reviews completed.' },
  { key: 'governance_advisor', name: 'Governance Advisor', description: '10 governance actions.' },
];

const THRESHOLDS: Record<BetaBadgeKey, (s: TesterStats) => boolean> = {
  found_bug: (s) => s.issuesReported >= 1,
  power_tester: (s) => s.missionsCompleted >= 10,
  elite_researcher: (s) => s.signalsAccepted >= 25,
  review_specialist: (s) => s.reviewsCompleted >= 50,
  governance_advisor: (s) => s.governanceActions >= 10,
};

/** Which recognition badges the tester currently qualifies for. PURE. */
export function evaluateBetaBadges(stats: TesterStats): BetaBadgeKey[] {
  return BETA_BADGES.map((b) => b.key).filter((k) => THRESHOLDS[k](stats));
}

/** Newly-earned badges = qualified now minus already-held. */
export function newBetaBadges(stats: TesterStats, held: string[]): BetaBadgeKey[] {
  const have = new Set(held);
  return evaluateBetaBadges(stats).filter((k) => !have.has(k));
}

export function betaBadge(key: string): BetaBadgeDef | undefined {
  return BETA_BADGES.find((b) => b.key === key);
}
