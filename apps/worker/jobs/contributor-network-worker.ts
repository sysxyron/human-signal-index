// =============================================================================
// apps/worker/jobs — contributorNetworkWorkerJob (HSI Phase 25 + 26)
//
// The CONTRIBUTOR INTELLIGENCE loop. Recomputes the network's recognition state
// from the APPEND-ONLY contribution_events + ledgers in fault-isolated steps
// (each wrapped — a failure logs + continues; NEVER throws):
//
//   1. AGGREGATE   — fold contribution_events + XP/credit ledgers into per-user
//                    stats (all-time + rolling windows for leaderboards).
//   2. STATS       — upsert user_contribution_stats (XP, credits, counts,
//                    reputation, xp-rank).
//   3. BADGES      — award newly-earned badges (evaluateBadges; unique-constrained
//                    insert → idempotent).
//   4. RANKS       — recompute rank progress per track (no auto-promotion).
//   5. MISSIONS    — recompute each user mission's status from its progress.
//   6. LEADERBOARD — write quality-weighted snapshots per view × period
//                    (daily/weekly/monthly/all_time).
//   7. TEAMS       — refresh team_contribution_metrics from membership + events.
//
// PURITY: @hsi/contributor-network is pure & deterministic; `now` is INJECTED
// (ctx.runAt). OFFLINE-SAFE: no service-role env → demo computation, no writes.
// GOVERNANCE (hard constraint): NEVER writes public.user_roles, NEVER promotes a
// privileged role, NEVER auto-approves an application/investigation. Recognition
// only — derived deterministically from append-only sources.
//
// SCHEDULING: cron '15 * * * *' (hourly, offset).
// =============================================================================

import {
  missionView, missionTemplate, MISSION_TEMPLATES,
  evaluateBadges, newlyEarnedBadges,
  rankProgress, trackForRole,
  computeReputation, overallReputation,
  rankContributors, rankTeams,
  xpRankFor,
  demoContributors, demoTeams, demoMetrics, demoMissionProgress,
  type ContributionMetrics, type ContributorStat, type LeaderboardView, type QualitySignals, type TeamStat,
} from '@hsi/contributor-network';
import { createServiceRoleClient } from '@hsi/database';
import { logger } from '../src/logger';
import type { Job, JobContext, JobResult } from './types';

export interface ContributorNetworkResult {
  mode: 'db' | 'offline';
  usersAggregated: number;
  statsUpserted: number;
  badgesAwarded: number;
  missionsUpdated: number;
  leaderboardsWritten: number;
  teamsUpdated: number;
}

const LEADERBOARD_VIEWS: LeaderboardView[] = ['top_contributors', 'top_researchers', 'top_reviewers', 'top_curators', 'top_teams'];
const PERIODS: Array<{ key: 'daily' | 'weekly' | 'monthly' | 'all_time'; days: number | null }> = [
  { key: 'daily', days: 1 }, { key: 'weekly', days: 7 }, { key: 'monthly', days: 30 }, { key: 'all_time', days: null },
];

function serviceRoleConfigured(): boolean {
  return Boolean((process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
interface AnyClient { from(table: string): any }
function tryClient(): AnyClient | null {
  if (!serviceRoleConfigured()) return null;
  try { return createServiceRoleClient() as unknown as AnyClient; }
  catch (e) { logger.warn('contributor.serviceRole.unavailable', { error: e instanceof Error ? e.message : String(e) }); return null; }
}

// ---- per-user aggregation (PURE given inputs) -------------------------------
interface EventRow { actor_id: string | null; subject_id: string | null; event_type: string; created_at: string }
interface UserAgg {
  signalsSubmitted: number; evidenceSubmitted: number; reviewsCompleted: number;
  signalsAccepted: number; signalsRejected: number; publications: number; investigationsOwned: number;
}
function emptyAgg(): UserAgg {
  return { signalsSubmitted: 0, evidenceSubmitted: 0, reviewsCompleted: 0, signalsAccepted: 0, signalsRejected: 0, publications: 0, investigationsOwned: 0 };
}

/** Fold events into per-user aggregates, optionally within [since, now]. */
function aggregate(events: EventRow[], sinceMs: number | null, nowMs: number): Map<string, UserAgg> {
  const map = new Map<string, UserAgg>();
  const get = (id: string): UserAgg => { let a = map.get(id); if (!a) { a = emptyAgg(); map.set(id, a); } return a; };
  for (const e of events) {
    const t = Date.parse(e.created_at);
    if (sinceMs !== null && (Number.isNaN(t) || t < sinceMs || t > nowMs)) continue;
    const actor = e.actor_id; const subject = e.subject_id;
    switch (e.event_type) {
      case 'SIGNAL_SUBMITTED': if (actor) get(actor).signalsSubmitted++; break;
      case 'EVIDENCE_SUBMITTED': if (actor) get(actor).evidenceSubmitted++; break;
      case 'SIGNAL_ACCEPTED': if (actor) get(actor).reviewsCompleted++; if (subject) get(subject).signalsAccepted++; break;
      case 'SIGNAL_REJECTED': if (actor) get(actor).reviewsCompleted++; if (subject) get(subject).signalsRejected++; break;
      case 'REPORT_PUBLISHED': if (actor) get(actor).publications++; break;
      case 'INVESTIGATION_ACTIVE': if (actor) get(actor).investigationsOwned++; break;
      default: break;
    }
  }
  return map;
}

function metricsFor(a: UserAgg): ContributionMetrics {
  return {
    accepted_signals: a.signalsAccepted, approved_sources: 0, evidence_packages: a.evidenceSubmitted,
    linked_signals: 0, completed_reviews: a.reviewsCompleted, traceability_days: 0,
    confirmed_early_detections: 0, approved_reports: a.publications, governance_actions: 0,
  };
}
function qualityFor(a: UserAgg): QualitySignals {
  return {
    acceptedSignals: a.signalsAccepted, rejectedSignals: a.signalsRejected,
    reviewAccuracy: 0.5, evidenceQuality: 0.5, traceabilityScore: 0.5,
    consensusAgreement: 0.5, governanceOutcomes: 0.5, publicationQuality: 0.5,
  };
}
function statToContributor(id: string, role: string, xp: number, a: UserAgg, reputation: number): ContributorStat {
  return {
    id, name: id, role: (role as ContributorStat['role']) ?? 'viewer', xp,
    acceptedSignals: a.signalsAccepted, rejectedSignals: a.signalsRejected,
    evidencePackages: a.evidenceSubmitted, reviewsCompleted: a.reviewsCompleted,
    reportsPrepared: a.publications, reputation,
  };
}

function runOffline(now: string): ContributorNetworkResult {
  for (const t of MISSION_TEMPLATES) missionView({ template: t, progress: demoMissionProgress[t.id] ?? {}, now });
  for (const c of demoContributors) { computeReputation(qualityFor(emptyAgg())); rankProgress(trackForRole(c.role), c.xp, c.reputation, demoMetrics); }
  for (const v of LEADERBOARD_VIEWS) v === 'top_teams' ? rankTeams(demoTeams) : rankContributors(demoContributors, v);
  return { mode: 'offline', usersAggregated: demoContributors.length, statsUpserted: demoContributors.length, badgesAwarded: evaluateBadges(demoMetrics).length, missionsUpdated: MISSION_TEMPLATES.length, leaderboardsWritten: LEADERBOARD_VIEWS.length * PERIODS.length, teamsUpdated: demoTeams.length };
}

async function runDb(client: AnyClient, now: string): Promise<ContributorNetworkResult> {
  const result: ContributorNetworkResult = { mode: 'db', usersAggregated: 0, statsUpserted: 0, badgesAwarded: 0, missionsUpdated: 0, leaderboardsWritten: 0, teamsUpdated: 0 };
  const nowMs = Date.parse(now);

  // ---- load events + xp/credit ledgers --------------------------------------
  let events: EventRow[] = [];
  const xpByUser = new Map<string, number>();
  const creditByUser = new Map<string, number>();
  const roleByUser = new Map<string, string>();
  try {
    const { data } = await client.from('contribution_events').select('actor_id, subject_id, event_type, created_at').limit(100000);
    events = (data ?? []) as EventRow[];
  } catch (e) { logger.warn('contributor.events.load.failed', { error: e instanceof Error ? e.message : String(e) }); }
  try {
    const { data } = await client.from('user_xp_ledger').select('user_id, amount').limit(200000);
    for (const r of (data ?? []) as Array<{ user_id: string; amount: number }>) xpByUser.set(r.user_id, (xpByUser.get(r.user_id) ?? 0) + (r.amount ?? 0));
  } catch (e) { logger.warn('contributor.xp.load.failed', { error: e instanceof Error ? e.message : String(e) }); }
  try {
    const { data } = await client.from('intel_credit_ledger').select('user_id, amount').limit(200000);
    for (const r of (data ?? []) as Array<{ user_id: string; amount: number }>) creditByUser.set(r.user_id, (creditByUser.get(r.user_id) ?? 0) + (r.amount ?? 0));
  } catch { /* credits optional */ }
  try {
    const { data } = await client.from('user_roles').select('user_id, roles(name)').limit(200000);
    for (const r of (data ?? []) as Array<{ user_id: string; roles?: { name?: string } | { name?: string }[] }>) {
      const rel = r.roles; const name = Array.isArray(rel) ? rel[0]?.name : rel?.name;
      if (name) roleByUser.set(r.user_id, name); // best-effort (not used for any RBAC decision)
    }
  } catch { /* role labels are advisory only */ }

  const allTime = aggregate(events, null, nowMs);
  result.usersAggregated = allTime.size;

  // ---- per-user stats + reputation + badges ---------------------------------
  for (const [userId, agg] of allTime) {
    const xp = xpByUser.get(userId) ?? 0;
    const credits = creditByUser.get(userId) ?? 0;
    const metrics = metricsFor(agg);
    const reputation = computeReputation(qualityFor(agg));
    const repOverall = overallReputation(reputation);
    const earned = evaluateBadges(metrics);

    try {
      await client.from('user_contribution_stats').upsert({
        user_id: userId, xp, credits,
        signals_submitted: agg.signalsSubmitted, evidence_submitted: agg.evidenceSubmitted,
        reviews_completed: agg.reviewsCompleted, signals_accepted: agg.signalsAccepted,
        signals_rejected: agg.signalsRejected, publications_contributed: agg.publications,
        investigations_owned: agg.investigationsOwned, badges_earned: earned.length,
        xp_rank: xpRankFor(xp).name, reputation_overall: repOverall, computed_at: now,
      }, { onConflict: 'user_id' });
      result.statsUpserted++;
    } catch (e) { logger.warn('contributor.stats.upsert.failed', { userId, error: e instanceof Error ? e.message : String(e) }); }

    // Reputation snapshot (separate Phase-25 table).
    try {
      await client.from('user_reputation_scores').upsert({
        user_id: userId, ...reputation, computed_at: now,
      }, { onConflict: 'user_id' });
    } catch { /* table present since 0029 */ }

    // Award newly-earned badges (idempotent: unique (user_id, badge_id)).
    try {
      const { data: held } = await client.from('user_badges').select('badge_id').eq('user_id', userId);
      const heldIds = ((held ?? []) as Array<{ badge_id: string }>).map((b) => b.badge_id);
      const fresh = newlyEarnedBadges(metrics, heldIds);
      if (fresh.length) {
        await client.from('user_badges').upsert(
          fresh.map((b) => ({ user_id: userId, badge_id: b.badgeId, earned_by_metric: b.earnedByMetric, awarded_at: now })),
          { onConflict: 'user_id,badge_id', ignoreDuplicates: true },
        );
        result.badgesAwarded += fresh.length;
      }
    } catch (e) { logger.warn('contributor.badges.failed', { userId, error: e instanceof Error ? e.message : String(e) }); }

    // Rank progress (recognition only; never writes user_roles).
    try {
      const track = trackForRole(roleByUser.get(userId));
      const trackRep = { viewer: reputation.trust_reputation, research: reputation.research_reputation, review: reputation.review_reputation, curation: reputation.publication_reputation, governance: reputation.governance_reputation }[track];
      const prog = rankProgress(track, xp, trackRep, metrics);
      await client.from('user_ranks').upsert({ user_id: userId, track, rank_name: prog.current.name, rank_level: prog.current.level, computed_at: now }, { onConflict: 'user_id,track' });
    } catch { /* ranks advisory */ }
  }

  // ---- missions -------------------------------------------------------------
  try {
    const { data } = await client.from('user_missions').select('id, template_id, progress, claimed_at, deadline');
    for (const row of (data ?? []) as Array<{ id: string; template_id: string; progress: Record<string, number>; claimed_at: string | null; deadline: string | null }>) {
      const t = missionTemplate(row.template_id); if (!t) continue;
      const v = missionView({ template: t, progress: row.progress ?? {}, claimed: Boolean(row.claimed_at), expiredAt: row.deadline, now });
      await client.from('user_missions').update({ status: v.status }).eq('id', row.id);
      result.missionsUpdated++;
    }
  } catch (e) { logger.warn('contributor.missions.failed', { error: e instanceof Error ? e.message : String(e) }); }

  // ---- leaderboards (view × period) -----------------------------------------
  try {
    for (const period of PERIODS) {
      const since = period.days === null ? null : nowMs - period.days * 86_400_000;
      const agg = period.days === null ? allTime : aggregate(events, since, nowMs);
      const stats: ContributorStat[] = [];
      for (const [userId, a] of agg) {
        const xp = xpByUser.get(userId) ?? 0;
        const rep = overallReputation(computeReputation(qualityFor(a)));
        stats.push(statToContributor(userId, roleByUser.get(userId) ?? 'viewer', xp, a, rep));
      }
      for (const view of LEADERBOARD_VIEWS) {
        const rows = view === 'top_teams' ? [] : rankContributors(stats, view, 100);
        await client.from('leaderboard_snapshots').insert({ view, period: period.key, rows, computed_at: now });
        result.leaderboardsWritten++;
      }
    }
  } catch (e) { logger.warn('contributor.leaderboard.failed', { error: e instanceof Error ? e.message : String(e) }); }

  // ---- team contribution metrics --------------------------------------------
  try {
    const { data: members } = await client.from('team_members').select('team_id, user_id');
    const teamAgg = new Map<string, TeamStat>();
    for (const m of (members ?? []) as Array<{ team_id: string; user_id: string }>) {
      const a = allTime.get(m.user_id); if (!a) continue;
      let t = teamAgg.get(m.team_id);
      if (!t) { t = { id: m.team_id, name: m.team_id, xp: 0, acceptedSignals: 0, evidencePackages: 0, reviewsCompleted: 0, investigationsCompleted: 0, reportsPrepared: 0, escalationsResolved: 0 }; teamAgg.set(m.team_id, t); }
      t.xp += xpByUser.get(m.user_id) ?? 0;
      t.acceptedSignals += a.signalsAccepted; t.evidencePackages += a.evidenceSubmitted;
      t.reviewsCompleted += a.reviewsCompleted; t.reportsPrepared += a.publications;
    }
    for (const [teamId, t] of teamAgg) {
      await client.from('team_contribution_metrics').upsert({
        team_id: teamId, team_xp: t.xp, accepted_signals: t.acceptedSignals, evidence_packages: t.evidencePackages,
        reviews_completed: t.reviewsCompleted, reports_prepared: t.reportsPrepared, computed_at: now,
      }, { onConflict: 'team_id' });
      result.teamsUpdated++;
    }
    // Team leaderboard snapshot (all-time).
    await client.from('leaderboard_snapshots').insert({ view: 'top_teams', period: 'all_time', rows: rankTeams([...teamAgg.values()]), computed_at: now });
  } catch (e) { logger.warn('contributor.teams.failed', { error: e instanceof Error ? e.message : String(e) }); }

  return result;
}

export function makeContributorNetworkJob(): Job {
  return {
    name: 'contributorNetworkWorker',
    description: 'Recompute stats, reputation, badges, ranks, missions, leaderboards, and team metrics from append-only contribution events. Recognition only — never promotes roles.',
    schedule: '15 * * * *',
    run: async (ctx: JobContext): Promise<JobResult> => {
      const now = ctx.runAt;
      const client = tryClient();
      try {
        const res = client ? await runDb(client, now) : runOffline(now);
        logger.info('contributor.network.run', res as unknown as Record<string, unknown>);
        return { job: 'contributorNetworkWorker', ok: true, declaredInputs: { runAt: now, mode: res.mode }, summary: res as unknown as Record<string, unknown> };
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        logger.error('contributor.network.failed', { error });
        return { job: 'contributorNetworkWorker', ok: false, declaredInputs: { runAt: now }, summary: {}, error };
      }
    },
  };
}

export const contributorNetworkWorkerJob: Job = makeContributorNetworkJob();
