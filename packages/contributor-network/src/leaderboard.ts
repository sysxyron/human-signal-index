// =============================================================================
// Leaderboards — QUALITY-WEIGHTED. We deliberately rank on ACCEPTED contributions
// and reputation, never raw submission counts, so spam cannot climb the board.
// rejected signals reduce the score. Pure + deterministic; stable tie-breaks.
// =============================================================================

import type {
  ContributorStat, LeaderboardRow, LeaderboardView, TeamStat,
} from './types';
import { acceptanceRatio } from './reputation';

/**
 * Quality-weighted contributor score. Components are all ACCEPTED/quality work:
 *   accepted signals, evidence packages, reviews, reports — each scaled by the
 *   contributor's acceptance ratio and reputation. Rejected signals apply a
 *   penalty. Raw submissions are NOT counted, so spamming earns nothing.
 */
export function contributorScore(s: ContributorStat): number {
  const accept = acceptanceRatio(s.acceptedSignals, s.rejectedSignals); // 0..1
  const repFactor = 0.5 + (s.reputation / 100) * 0.5; // 0.5..1.0
  const base =
    s.acceptedSignals * 10 +
    s.evidencePackages * 50 +
    s.reviewsCompleted * 40 +
    s.reportsPrepared * 100;
  const penalty = s.rejectedSignals * 5;
  const score = (base * accept * repFactor) - penalty;
  return Math.max(0, Math.round(score));
}

/** Does a contributor qualify for a role-specific leaderboard view? */
function matchesView(s: ContributorStat, view: LeaderboardView): boolean {
  switch (view) {
    case 'top_researchers': return s.role === 'researcher';
    case 'top_reviewers': return s.role === 'reviewer';
    case 'top_curators': return s.role === 'curator';
    case 'top_contributors': return true;
    case 'top_teams': return true; // handled by rankTeams
  }
}

/** Rank contributors for a view. Stable: ties break by reputation, then id. */
export function rankContributors(stats: ContributorStat[], view: LeaderboardView, limit = 50): LeaderboardRow[] {
  const rows = stats
    .filter((s) => matchesView(s, view))
    .map((s) => ({ id: s.id, name: s.name, score: contributorScore(s), xp: s.xp, reputation: s.reputation }))
    .sort((a, b) => b.score - a.score || b.reputation - a.reputation || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map((r, i) => ({ rank: i + 1, ...r }));
  return rows;
}

/** Team score: quality-weighted aggregate of completed/accepted work. */
export function teamScore(t: TeamStat): number {
  return Math.max(0, Math.round(
    t.acceptedSignals * 10 +
    t.evidencePackages * 50 +
    t.reviewsCompleted * 40 +
    t.investigationsCompleted * 100 +
    t.reportsPrepared * 100 +
    t.escalationsResolved * 30,
  ));
}

export function rankTeams(teams: TeamStat[], limit = 50): LeaderboardRow[] {
  return teams
    .map((t) => ({ id: t.id, name: t.name, score: teamScore(t), xp: t.xp, reputation: 0 }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map((r, i) => ({ rank: i + 1, ...r }));
}
