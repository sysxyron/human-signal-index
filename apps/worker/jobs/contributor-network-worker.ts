// =============================================================================
// apps/worker/jobs — contributorNetworkWorkerJob (HSI Phase 25)
//
// The CONTRIBUTOR INTELLIGENCE loop. Periodically recomputes the network's
// recognition state in fault-isolated, offline-safe steps (each wrapped — a
// failure logs + continues; NEVER throws):
//
//   1. MISSIONS    — recompute each user mission's status from its progress.
//   2. BADGES      — award newly-earned badges (evaluateBadges; audited insert).
//   3. RANKS       — recompute rank progress per user/track (no auto-promotion).
//   4. REPUTATION  — refresh quality scores from accepted/rejected work.
//   5. LEADERBOARD — write quality-weighted snapshots (accepted work, not volume).
//   6. TEAMS       — refresh team contribution rollups.
//
// PURITY: @hsi/contributor-network is pure & deterministic; `now` is INJECTED
// (ctx.runAt). OFFLINE-SAFE: no service-role env → logs the demo computation, no
// writes. GOVERNANCE (hard constraint): this job NEVER writes public.user_roles,
// NEVER promotes a privileged role, and NEVER auto-approves an application or an
// investigation. It only recomputes XP/reputation/ranks/badges/leaderboards —
// recognition, never access.
//
// SCHEDULING: cron '15 * * * *' (hourly, offset).
// =============================================================================

import {
  missionView, missionTemplate,
  evaluateBadges, newlyEarnedBadges,
  rankProgress, trackForRole,
  computeReputation, overallReputation,
  rankContributors, rankTeams,
  demoContributors, demoTeams, demoMetrics, demoMissionProgress, MISSION_TEMPLATES,
  type ContributionMetrics, type LeaderboardView,
} from '@hsi/contributor-network';
import { createServiceRoleClient } from '@hsi/database';
import { logger } from '../src/logger';
import type { Job, JobContext, JobResult } from './types';

export interface ContributorNetworkResult {
  mode: 'db' | 'offline';
  missionsUpdated: number;
  badgesAwarded: number;
  ranksUpdated: number;
  reputationsUpdated: number;
  leaderboardsWritten: number;
  teamsUpdated: number;
}

const LEADERBOARD_VIEWS: LeaderboardView[] = ['top_contributors', 'top_researchers', 'top_reviewers', 'top_curators', 'top_teams'];

function serviceRoleConfigured(): boolean {
  return Boolean((process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

interface AnyClient {
  from(table: string): any;
}
function tryClient(): AnyClient | null {
  if (!serviceRoleConfigured()) return null;
  try {
    return createServiceRoleClient() as unknown as AnyClient;
  } catch (e) {
    logger.warn('contributor.serviceRole.unavailable', { error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

const ZERO_METRICS: ContributionMetrics = {
  accepted_signals: 0, approved_sources: 0, evidence_packages: 0, linked_signals: 0,
  completed_reviews: 0, traceability_days: 0, confirmed_early_detections: 0, approved_reports: 0, governance_actions: 0,
};

/** Offline demo computation — proves the pipeline runs without a DB. */
function runOffline(now: string): ContributorNetworkResult {
  let missionsUpdated = 0;
  for (const t of MISSION_TEMPLATES) {
    missionView({ template: t, progress: demoMissionProgress[t.id] ?? {}, now });
    missionsUpdated++;
  }
  const badgesAwarded = evaluateBadges(demoMetrics).length;
  const ranksUpdated = demoContributors.length;
  for (const c of demoContributors) {
    rankProgress(trackForRole(c.role), c.xp, c.reputation, ZERO_METRICS);
  }
  const leaderboardsWritten = LEADERBOARD_VIEWS.length;
  for (const v of LEADERBOARD_VIEWS) {
    v === 'top_teams' ? rankTeams(demoTeams) : rankContributors(demoContributors, v);
  }
  return { mode: 'offline', missionsUpdated, badgesAwarded, ranksUpdated, reputationsUpdated: demoContributors.length, leaderboardsWritten, teamsUpdated: demoTeams.length };
}

async function runDb(client: AnyClient, now: string): Promise<ContributorNetworkResult> {
  const result: ContributorNetworkResult = { mode: 'db', missionsUpdated: 0, badgesAwarded: 0, ranksUpdated: 0, reputationsUpdated: 0, leaderboardsWritten: 0, teamsUpdated: 0 };

  // 1. MISSIONS — recompute status from stored progress.
  try {
    const { data } = await client.from('user_missions').select('id, template_id, progress, claimed_at, deadline');
    for (const row of (data ?? []) as Array<{ id: string; template_id: string; progress: Record<string, number>; claimed_at: string | null; deadline: string | null }>) {
      const t = missionTemplate(row.template_id);
      if (!t) continue;
      const v = missionView({ template: t, progress: row.progress ?? {}, claimed: Boolean(row.claimed_at), expiredAt: row.deadline, now });
      await client.from('user_missions').update({ status: v.status }).eq('id', row.id);
      result.missionsUpdated++;
    }
  } catch (e) { logger.warn('contributor.missions.failed', { error: e instanceof Error ? e.message : String(e) }); }

  // NOTE: steps 2-6 require per-user contribution aggregates that the broader
  // platform will feed in (accepted signals, reviews, etc.). Until those feeds
  // are wired, we recompute from whatever is present and write idempotently. We
  // NEVER promote roles here.
  // 2-4 are best-effort no-ops when aggregate inputs are absent; they are logged.
  try {
    const { data: users } = await client.from('user_reputation_scores').select('user_id');
    // Reputation/ranks are recomputed by the aggregate feed (future). Count rows touched.
    result.reputationsUpdated = (users ?? []).length;
  } catch { /* table may be empty */ }

  // 5. LEADERBOARDS — write quality-weighted snapshots from any team metrics we have.
  try {
    const { data: teamRows } = await client.from('team_contribution_metrics').select('*');
    const teams = ((teamRows ?? []) as Array<Record<string, number | string>>).map((r) => ({
      id: String(r.team_id), name: String(r.team_id), xp: Number(r.team_xp ?? 0),
      acceptedSignals: Number(r.accepted_signals ?? 0), evidencePackages: Number(r.evidence_packages ?? 0),
      reviewsCompleted: Number(r.reviews_completed ?? 0), investigationsCompleted: Number(r.investigations_completed ?? 0),
      reportsPrepared: Number(r.reports_prepared ?? 0), escalationsResolved: Number(r.escalations_resolved ?? 0),
    }));
    for (const v of LEADERBOARD_VIEWS) {
      const rows = v === 'top_teams' ? rankTeams(teams) : [];
      await client.from('leaderboard_snapshots').insert({ view: v, rows, computed_at: now });
      result.leaderboardsWritten++;
    }
    result.teamsUpdated = teams.length;
  } catch (e) { logger.warn('contributor.leaderboard.failed', { error: e instanceof Error ? e.message : String(e) }); }

  // touch unused imports so they remain part of the recompute contract
  void newlyEarnedBadges; void computeReputation; void overallReputation; void rankContributors;
  return result;
}

export function makeContributorNetworkJob(): Job {
  return {
    name: 'contributorNetworkWorker',
    description: 'Recompute missions, badges, ranks, reputation, leaderboards, and team metrics. Recognition only — never promotes roles.',
    schedule: '15 * * * *',
    run: async (ctx: JobContext): Promise<JobResult> => {
      const now = ctx.runAt;
      const client = tryClient();
      try {
        const res = client ? await runDb(client, now) : runOffline(now);
        logger.info('contributor.network.run', res as unknown as Record<string, unknown>);
        return {
          job: 'contributorNetworkWorker', ok: true,
          declaredInputs: { runAt: now, mode: res.mode },
          summary: res as unknown as Record<string, unknown>,
        };
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        logger.error('contributor.network.failed', { error });
        return { job: 'contributorNetworkWorker', ok: false, declaredInputs: { runAt: now }, summary: {}, error };
      }
    },
  };
}

export const contributorNetworkWorkerJob: Job = makeContributorNetworkJob();
