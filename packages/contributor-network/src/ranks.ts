// =============================================================================
// Ranks — role-specific PROGRESSION ladders. Advancement is based on XP +
// reputation + badge requirements + (sometimes) admin approval. A rank NEVER
// bypasses RBAC: it is a recognition tier, not a permission. The high ranks that
// imply real authority are flagged requiresAdminApproval — the engine only
// reports ELIGIBILITY; an admin still performs the role assignment via IAM.
// =============================================================================

import type { ContributionMetrics, RankDef, RankProgress, RankTrack, ReputationCategory } from './types';
import { evaluateBadges } from './badges';

/** Which reputation category gates each track. */
export const TRACK_REPUTATION: Record<RankTrack, ReputationCategory> = {
  viewer: 'trust_reputation',
  research: 'research_reputation',
  review: 'review_reputation',
  curation: 'publication_reputation',
  governance: 'governance_reputation',
};

/** Ordered rank ladders. Levels are 1-based; minXp ascending within a track. */
export const RANK_TRACKS: Record<RankTrack, RankDef[]> = {
  viewer: [
    { track: 'viewer', name: 'Viewer', level: 1, minXp: 0, minReputation: 0, requiresAdminApproval: false, badgeRequirements: [] },
    { track: 'viewer', name: 'Contributor', level: 2, minXp: 100, minReputation: 40, requiresAdminApproval: false, badgeRequirements: [] },
    { track: 'viewer', name: 'Trusted Contributor', level: 3, minXp: 400, minReputation: 60, requiresAdminApproval: true, badgeRequirements: ['signal_hunter'] },
  ],
  research: [
    { track: 'research', name: 'Researcher I', level: 1, minXp: 0, minReputation: 0, requiresAdminApproval: false, badgeRequirements: [] },
    { track: 'research', name: 'Researcher II', level: 2, minXp: 500, minReputation: 50, requiresAdminApproval: false, badgeRequirements: ['signal_hunter'] },
    { track: 'research', name: 'Senior Researcher', level: 3, minXp: 1500, minReputation: 65, requiresAdminApproval: true, badgeRequirements: ['evidence_builder'] },
    { track: 'research', name: 'Lead Researcher', level: 4, minXp: 3500, minReputation: 75, requiresAdminApproval: true, badgeRequirements: ['pattern_detector'] },
    { track: 'research', name: 'Principal Researcher', level: 5, minXp: 7000, minReputation: 85, requiresAdminApproval: true, badgeRequirements: ['signal_veteran'] },
  ],
  review: [
    { track: 'review', name: 'Reviewer', level: 1, minXp: 0, minReputation: 0, requiresAdminApproval: false, badgeRequirements: [] },
    { track: 'review', name: 'Senior Reviewer', level: 2, minXp: 1500, minReputation: 65, requiresAdminApproval: true, badgeRequirements: ['fact_checker'] },
    { track: 'review', name: 'Chief Reviewer', level: 3, minXp: 4000, minReputation: 80, requiresAdminApproval: true, badgeRequirements: ['fact_checker'] },
  ],
  curation: [
    { track: 'curation', name: 'Curator', level: 1, minXp: 0, minReputation: 0, requiresAdminApproval: false, badgeRequirements: [] },
    { track: 'curation', name: 'Senior Curator', level: 2, minXp: 2000, minReputation: 70, requiresAdminApproval: true, badgeRequirements: ['publication_builder'] },
    { track: 'curation', name: 'Editorial Lead', level: 3, minXp: 5000, minReputation: 82, requiresAdminApproval: true, badgeRequirements: ['publication_builder'] },
  ],
  governance: [
    { track: 'governance', name: 'Governance Member', level: 1, minXp: 0, minReputation: 0, requiresAdminApproval: true, badgeRequirements: [] },
    { track: 'governance', name: 'Senior Governance Member', level: 2, minXp: 2500, minReputation: 75, requiresAdminApproval: true, badgeRequirements: ['governance_steward'] },
    { track: 'governance', name: 'Council Member', level: 3, minXp: 6000, minReputation: 88, requiresAdminApproval: true, badgeRequirements: ['governance_steward'] },
  ],
};

/** Map an RBAC role to its primary rank track. */
export function trackForRole(role: string | null | undefined): RankTrack {
  switch (role) {
    case 'researcher': return 'research';
    case 'reviewer': return 'review';
    case 'curator': return 'curation';
    case 'admin': return 'governance';
    default: return 'viewer';
  }
}

/**
 * Resolve the current rank + next-rank requirements for a contributor on a track.
 * Current rank = highest rank whose XP + reputation + badge requirements are met
 * (admin-approval ranks still appear as "current" only when explicitly granted —
 * here we report eligibility; callers pass `grantedLevel` for approval-gated ranks).
 */
export function rankProgress(
  track: RankTrack,
  xp: number,
  reputation: number,
  metrics: ContributionMetrics,
  grantedLevel = 1,
): RankProgress {
  const ladder = RANK_TRACKS[track];
  const earned = new Set(evaluateBadges(metrics).map((b) => b.badgeId));

  const meetsAutomatic = (r: RankDef): boolean =>
    xp >= r.minXp && reputation >= r.minReputation && r.badgeRequirements.every((b) => earned.has(b));

  // Current = highest contiguous rank the user actually holds: automatic ranks they
  // qualify for, or approval-gated ranks up to grantedLevel.
  let current = ladder[0];
  for (const r of ladder) {
    const ok = r.requiresAdminApproval ? r.level <= grantedLevel && meetsAutomatic(r) : meetsAutomatic(r);
    if (ok) current = r; else break;
  }

  const next = ladder.find((r) => r.level === current.level + 1) ?? null;
  const missingBadges = next ? next.badgeRequirements.filter((b) => !earned.has(b)) : [];
  return {
    current,
    next,
    xpToNext: next ? Math.max(0, next.minXp - xp) : 0,
    reputationToNext: next ? Math.max(0, next.minReputation - reputation) : 0,
    missingBadges,
    needsAdminApproval: next ? next.requiresAdminApproval : false,
  };
}
