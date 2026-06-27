// =============================================================================
// HSI Phase 60.1 — Beta Launch stage + PURE fallback helpers (no I/O, no runtime
// imports of the cached layers). Extracted from `data.ts` so the launch-stage
// mapping and the degraded fallback are unit-testable WITHOUT pulling in the
// cached intelligence layers (which import `next/cache` and cannot load under the
// plain `tsx` test runner). Type-only imports are erased, so they stay safe here.
// =============================================================================

import { degradedReadiness, type ReleaseReadinessData } from '../release-readiness-status';
import type { BetaOperationsData } from '../beta-operations';
import type { BetaLaunchOps } from './persistence';

export interface LaunchStage {
  current: 1 | 2 | 3 | 4;
  label: string;
  range: string;
  nextMilestone: string;
}

export interface BetaLaunchData {
  /** false when the composed readiness data could not be loaded (page shows an empty state). */
  available: boolean;
  /** Non-secret operator-facing reason when unavailable; null on the success path. */
  statusReason: string | null;
  beta: BetaOperationsData;
  release: ReleaseReadinessData;
  ops: BetaLaunchOps;
  stage: LaunchStage;
}

/** PURE: map the active user count to the current launch stage. */
export function stageFor(totalUsers: number): LaunchStage {
  if (totalUsers <= 10) return { current: 1, label: 'Stage 1 — Closed alpha', range: '1–10 users', nextMilestone: 'Reach 10 active users to open Stage 2' };
  if (totalUsers <= 25) return { current: 2, label: 'Stage 2 — Early beta', range: '10–25 users', nextMilestone: 'Reach 25 active users to open the expanded beta' };
  if (totalUsers <= 100) return { current: 3, label: 'Stage 3 — Expanded beta', range: '25–100 users', nextMilestone: 'Stabilize at 100 users before scaling toward 500' };
  return { current: 4, label: 'Stage 4 — Scaling', range: '100–500 users', nextMilestone: 'Add single-flight caching + shared rate-limit store before 1000' };
}

/** PURE: a fully-shaped, zeroed operational layer (used by the degraded fallback). */
export function emptyBetaLaunchOps(): BetaLaunchOps {
  return {
    cohorts: [],
    invites: { summary: { sent: 0, pending: 0, accepted: 0, expired: 0, revoked: 0 }, recent: [], events: [] },
    feedback: { summary: { open: 0, reviewing: 0, planned: 0, completed: 0, total: 0 }, recent: [] },
    onboarding: [],
  };
}

/** PURE: a fully-shaped, zeroed beta-operations read model (used by the fallback). */
export function emptyBetaOperations(): BetaOperationsData {
  return {
    overview: { totalUsers: 0, activeUsers: 0, newThisWeek: 0, researchers: 0, reviewers: 0, admins: 0, contributors: 0, roleDistribution: [] },
    health: { signalsSubmitted: 0, signalsPublished: 0, reportsPublished: 0, reviewsCompleted: 0, sourcesActive: 0, traceability: 0, trendSignals: [], trendPublications: [] },
    activity: { recentSubmissions: 0, recentPublications: 0, recentReviews: 0, recentLogins: null },
    engagement: { dau: null, wau: null, retention: null, participationRate: 0, contributionRate: 0 },
    workload: { reviewBacklog: 0, openInvestigations: 0, pendingPublication: 0, avgTurnaround: '—', queuePressure: 'Low' },
    adoption: { mostActiveRoles: [], mostActiveCategories: [], pageAnalyticsAvailable: false },
    risks: [],
    feedback: { total: 0, open: 0, resolved: 0, available: false },
    summary: { health: 'Unknown', growth: '—', participation: '0%', trust: '—', risk: '—', readiness: 'Unavailable', readinessTone: 'red' },
  };
}

/**
 * PURE: a safe, empty Beta Launch model used when the composed readiness data
 * cannot be loaded (any underlying layer throwing). `available:false` tells the
 * page to render its internal empty/error state instead of crashing the route.
 */
export function degradedBetaLaunch(role: string | null, reason?: string): BetaLaunchData {
  return {
    available: false,
    statusReason: reason ?? 'Beta launch readiness data is temporarily unavailable.',
    beta: emptyBetaOperations(),
    release: degradedReadiness(role),
    ops: emptyBetaLaunchOps(),
    stage: stageFor(0),
  };
}
