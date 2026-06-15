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
import {
  computeTrust, reviewAccuracy, levelForAuthority, impactScore, teamEffectiveness, type TrustInputs,
} from '@hsi/trust-graph';
import {
  investigationImpact, publicationReach, contributorImpact, cleanAttribution,
  type AttributionEdge, type OutcomeType,
} from '@hsi/outcome-attribution';
import {
  computeGraphHealth, type LineageEdge, type LineageNode,
} from '@hsi/lineage';
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
  trustProfilesUpserted: number;
  trustHistoryAppended: number;
  outcomeEventsWritten: number;
  attributionEdgesWritten: number;
  entityImpactUpserted: number;
  lineageLinksBackfilled: number;
  graphHealthScore: number;
}

// ---- REAL operational outcomes (Phase 28) ---------------------------------
interface UserOutcomes {
  reviewAgreements: number; reviewDisagreements: number;
  publicationsApproved: number; publicationsRejected: number; publicationTraceability: number; governanceApprovalRate: number;
  investigationsOpened: number; investigationsCompleted: number; investigationsAbandoned: number;
  acceptedFindings: number; governanceActions: number; publicationsDelivered: number;
  governanceConfirmed: number; governanceDecisions: number;
}
function emptyOutcomes(): UserOutcomes {
  return { reviewAgreements: 0, reviewDisagreements: 0, publicationsApproved: 0, publicationsRejected: 0, publicationTraceability: 0, governanceApprovalRate: 0, investigationsOpened: 0, investigationsCompleted: 0, investigationsAbandoned: 0, acceptedFindings: 0, governanceActions: 0, publicationsDelivered: 0, governanceConfirmed: 0, governanceDecisions: 0 };
}

/**
 * Build trust-graph inputs from a user's contribution aggregate + REAL outcomes
 * (Phase 28). Review accuracy, publication quality, completion, impact, and
 * governance effectiveness are now derived from source tables — no placeholders.
 * (Consistency windows remain neutral; completion is the dominant reliability input.)
 * Self-validation is already excluded (the recorder blocks self-accept).
 */
function trustInputsFor(agg: UserAgg, o: UserOutcomes): TrustInputs {
  return {
    signalsSubmitted: agg.signalsSubmitted, signalsAccepted: agg.signalsAccepted, signalsRejected: agg.signalsRejected,
    reviewAgreements: o.reviewAgreements, reviewDisagreements: o.reviewDisagreements,
    publicationsApproved: o.publicationsApproved || agg.publications, publicationsRejected: o.publicationsRejected,
    publicationTraceability: o.publicationTraceability, governanceApprovalRate: o.governanceApprovalRate,
    investigationsOpened: o.investigationsOpened, investigationsCompleted: o.investigationsCompleted || agg.investigationsOwned, investigationsAbandoned: o.investigationsAbandoned,
    overdueAssignments: 0, activeWindows: 0, totalWindows: 0,
    acceptedFindings: o.acceptedFindings, governanceActions: o.governanceActions, publicationsDelivered: o.publicationsDelivered,
    governanceConfirmed: o.governanceConfirmed, governanceDecisions: o.governanceDecisions,
  };
}

/**
 * Load real operational outcomes per user from the source tables. Best-effort:
 * any failed query leaves that dimension neutral. This is also the historical
 * BACKFILL — it reads source records directly, not only contribution_events.
 */
async function loadOutcomes(client: AnyClient): Promise<Map<string, UserOutcomes>> {
  const map = new Map<string, UserOutcomes>();
  const get = (id: string): UserOutcomes => { let o = map.get(id); if (!o) { o = emptyOutcomes(); map.set(id, o); } return o; };

  const govByInv = new Map<string, string>();
  const invStatus = new Map<string, string>();
  try {
    const { data: govs } = await client.from('investigation_governance_decisions').select('investigation_id, decided_by, decision, created_at').order('created_at', { ascending: true });
    for (const g of (govs ?? []) as Array<{ investigation_id: string; decided_by: string | null; decision: string }>) govByInv.set(g.investigation_id, g.decision);
    // Investigations → completion + impact (per owner).
    const { data: invs } = await client.from('investigations').select('id, owner_id, status');
    for (const inv of (invs ?? []) as Array<{ id: string; owner_id: string | null; status: string }>) {
      invStatus.set(inv.id, inv.status);
      if (!inv.owner_id) continue;
      const o = get(inv.owner_id);
      o.investigationsOpened++;
      const completed = inv.status === 'published' || inv.status === 'publication_ready';
      if (completed) { o.investigationsCompleted++; o.acceptedFindings++; }
      if (inv.status === 'archived') o.investigationsAbandoned++;
      if (inv.status === 'published') o.publicationsDelivered++;
      if (govByInv.has(inv.id)) o.governanceActions++;
    }
    // Governance effectiveness per decider (decision confirmed by final status).
    for (const g of (govs ?? []) as Array<{ investigation_id: string; decided_by: string | null; decision: string }>) {
      if (!g.decided_by) continue;
      const o = get(g.decided_by);
      o.governanceDecisions++;
      const published = invStatus.get(g.investigation_id) === 'published';
      if ((g.decision === 'cleared' && published) || (g.decision !== 'cleared' && !published)) o.governanceConfirmed++;
    }
  } catch (e) { logger.warn('contributor.outcomes.investigations.failed', { error: e instanceof Error ? e.message : String(e) }); }

  // Review accuracy: reviewer decision vs the investigation's governance outcome.
  try {
    const { data: reviews } = await client.from('investigation_reviews').select('investigation_id, reviewer_id, decision');
    for (const r of (reviews ?? []) as Array<{ investigation_id: string; reviewer_id: string | null; decision: string }>) {
      if (!r.reviewer_id) continue;
      const gov = govByInv.get(r.investigation_id);
      if (!gov) continue; // no final outcome yet → not scorable
      const o = get(r.reviewer_id);
      if ((r.decision === 'approve') === (gov === 'cleared')) o.reviewAgreements++; else o.reviewDisagreements++;
    }
  } catch (e) { logger.warn('contributor.outcomes.reviews.failed', { error: e instanceof Error ? e.message : String(e) }); }

  // Publication quality per creator (state + trust_score + evidence completeness).
  try {
    const { data: pubs } = await client.from('hsin_publications').select('created_by, state, trust_score, evidence_count');
    const agg = new Map<string, { app: number; rej: number; tr: number; ev: number; n: number }>();
    for (const p of (pubs ?? []) as Array<{ created_by: string | null; state: string; trust_score: number | null; evidence_count: number | null }>) {
      if (!p.created_by) continue;
      const e = agg.get(p.created_by) ?? { app: 0, rej: 0, tr: 0, ev: 0, n: 0 };
      if (p.state === 'APPROVED' || p.state === 'PUBLISHED') e.app++;
      if (p.state === 'RETRACTED') e.rej++;
      e.tr += Number(p.trust_score ?? 0); e.ev += (Number(p.evidence_count ?? 0) > 0 ? 1 : 0); e.n++;
      agg.set(p.created_by, e);
    }
    for (const [uid, e] of agg) {
      const o = get(uid);
      o.publicationsApproved = e.app; o.publicationsRejected = e.rej;
      o.publicationTraceability = e.n > 0 ? (e.tr / e.n) / 100 : 0;
      o.governanceApprovalRate = e.n > 0 ? e.ev / e.n : 0; // evidence completeness
    }
  } catch (e) { logger.warn('contributor.outcomes.publications.failed', { error: e instanceof Error ? e.message : String(e) }); }

  return map;
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
/** Map measurable mission step keys to real aggregate counts (Phase 28). Unmapped
 *  steps keep their stored progress; mapped steps take max(stored, real). */
function deriveMissionProgress(stepKeys: string[], a: UserAgg, stored: Record<string, number>): Record<string, number> {
  const real: Record<string, number> = {
    signals: a.signalsSubmitted, evidence: a.evidenceSubmitted, reviews: a.reviewsCompleted,
    investigation: a.investigationsOwned, reports: a.publications, drafts: a.publications,
  };
  const out: Record<string, number> = { ...stored };
  for (const key of stepKeys) {
    if (key in real) out[key] = Math.max(stored[key] ?? 0, real[key]);
  }
  return out;
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
  for (const c of demoContributors) computeTrust(trustInputsFor({ signalsSubmitted: c.acceptedSignals + c.rejectedSignals, signalsAccepted: c.acceptedSignals, signalsRejected: c.rejectedSignals, reviewsCompleted: c.reviewsCompleted, evidenceSubmitted: c.evidencePackages, publications: c.reportsPrepared, investigationsOwned: 0 }, emptyOutcomes()));
  return { mode: 'offline', usersAggregated: demoContributors.length, statsUpserted: demoContributors.length, badgesAwarded: evaluateBadges(demoMetrics).length, missionsUpdated: MISSION_TEMPLATES.length, leaderboardsWritten: LEADERBOARD_VIEWS.length * PERIODS.length, teamsUpdated: demoTeams.length, trustProfilesUpserted: demoContributors.length, trustHistoryAppended: 0, outcomeEventsWritten: 0, attributionEdgesWritten: 0, entityImpactUpserted: 0, lineageLinksBackfilled: 0, graphHealthScore: 0 };
}

async function runDb(client: AnyClient, now: string): Promise<ContributorNetworkResult> {
  const result: ContributorNetworkResult = { mode: 'db', usersAggregated: 0, statsUpserted: 0, badgesAwarded: 0, missionsUpdated: 0, leaderboardsWritten: 0, teamsUpdated: 0, trustProfilesUpserted: 0, trustHistoryAppended: 0, outcomeEventsWritten: 0, attributionEdgesWritten: 0, entityImpactUpserted: 0, lineageLinksBackfilled: 0, graphHealthScore: 0 };
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
  // Phase 28 — real operational outcomes (also the historical backfill source).
  const outcomes = await loadOutcomes(client).catch(() => new Map<string, UserOutcomes>());
  // Process the UNION of users with activity OR with operational outcomes.
  const allUserIds = new Set<string>([...allTime.keys(), ...outcomes.keys()]);
  result.usersAggregated = allUserIds.size;
  const trustByUser = new Map<string, { authority: number; trust: number }>();

  // ---- per-user stats + reputation + badges + trust -------------------------
  for (const userId of allUserIds) {
    const agg = allTime.get(userId) ?? emptyAgg();
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

    // ---- TRUST GRAPH (Phase 27 + 28) — quality scores from REAL outcomes ----
    try {
      const inputs = trustInputsFor(agg, outcomes.get(userId) ?? emptyOutcomes());
      const scores = computeTrust(inputs);
      const rev = reviewAccuracy(inputs);
      const level = levelForAuthority(scores.authority).name;
      trustByUser.set(userId, { authority: scores.authority, trust: scores.trust });

      // Read prior authority to detect a change for the append-only history.
      const { data: prior } = await client.from('trust_profiles').select('trust_score, authority_score').eq('user_id', userId).maybeSingle();
      const prevTrust = (prior as { trust_score?: number } | null)?.trust_score ?? null;
      const prevAuthority = (prior as { authority_score?: number } | null)?.authority_score ?? null;

      await client.from('trust_profiles').upsert({
        user_id: userId,
        signal_accuracy: scores.signalAccuracy, review_accuracy: scores.reviewAccuracy,
        publication_quality: scores.publicationQuality, reliability: scores.reliability,
        impact_score: scores.impact, governance_effectiveness: scores.governanceEffectiveness,
        accuracy: scores.accuracy, trust_score: scores.trust, authority_score: scores.authority,
        trust_level: level, agreement_pct: rev.agreementPct, disagreement_pct: rev.disagreementPct, computed_at: now,
      }, { onConflict: 'user_id' });
      result.trustProfilesUpserted++;

      if (prevAuthority === null || prevAuthority !== scores.authority || prevTrust !== scores.trust) {
        await client.from('trust_history').insert({
          user_id: userId, previous_trust: prevTrust, new_trust: scores.trust,
          previous_authority: prevAuthority, new_authority: scores.authority,
          reason: prevAuthority === null ? 'Initial trust computation.' : 'Recomputed from contribution events.',
        });
        result.trustHistoryAppended++;
      }
    } catch (e) { logger.warn('contributor.trust.failed', { userId, error: e instanceof Error ? e.message : String(e) }); }
  }

  // ---- missions (Phase 28: advance progress from REAL outcomes) -------------
  try {
    const { data } = await client.from('user_missions').select('id, user_id, template_id, progress, claimed_at, deadline');
    for (const row of (data ?? []) as Array<{ id: string; user_id: string; template_id: string; progress: Record<string, number>; claimed_at: string | null; deadline: string | null }>) {
      const t = missionTemplate(row.template_id); if (!t) continue;
      const agg = allTime.get(row.user_id) ?? emptyAgg();
      const progress = deriveMissionProgress(t.steps.map((s) => s.key), agg, row.progress ?? {});
      const v = missionView({ template: t, progress, claimed: Boolean(row.claimed_at), expiredAt: row.deadline, now });
      await client.from('user_missions').update({ progress, status: v.status }).eq('id', row.id);
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

  // ---- team effectiveness + domain/global authority boards (Phase 28) --------
  try {
    const { data: members } = await client.from('team_members').select('user_id, teams(key)');
    const domainMembers = new Map<string, string[]>(); // domain key → user ids
    for (const m of (members ?? []) as Array<{ user_id: string; teams?: { key?: string } | { key?: string }[] }>) {
      const rel = m.teams; const key = Array.isArray(rel) ? rel[0]?.key : rel?.key;
      if (!key) continue;
      const list = domainMembers.get(key) ?? []; list.push(m.user_id); domainMembers.set(key, list);
    }

    // Global authority board.
    const globalRows = [...trustByUser.entries()]
      .map(([id, s]) => ({ id, name: id, score: s.authority, xp: xpByUser.get(id) ?? 0, reputation: s.trust }))
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 100)
      .map((r, i) => ({ rank: i + 1, ...r }));
    await client.from('leaderboard_snapshots').insert({ view: 'global', period: 'all_time', rows: globalRows, computed_at: now });
    result.leaderboardsWritten++;

    // Per-domain authority boards + team effectiveness.
    for (const domain of ['research', 'review', 'governance', 'security'] as const) {
      const ids = domainMembers.get(domain) ?? [];
      const rows = ids
        .map((id) => ({ id, name: id, score: trustByUser.get(id)?.authority ?? 50, xp: xpByUser.get(id) ?? 0, reputation: trustByUser.get(id)?.trust ?? 50 }))
        .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 100)
        .map((r, i) => ({ rank: i + 1, ...r }));
      await client.from('leaderboard_snapshots').insert({ view: domain, period: 'all_time', rows, computed_at: now });
      result.leaderboardsWritten++;

      // Effectiveness from members' real outcomes.
      let accN = 0, accD = 0, comp = 0, comC = 0, completedTot = 0, found = 0, gov = 0, pubs = 0;
      for (const id of ids) {
        const a = allTime.get(id); const o = outcomes.get(id);
        if (a) { accN += a.signalsAccepted; accD += a.signalsAccepted + a.signalsRejected; }
        if (o) { comp += o.investigationsCompleted; comC += o.investigationsCompleted + o.investigationsAbandoned; completedTot += o.investigationsCompleted; found += o.acceptedFindings; gov += o.governanceActions; pubs += o.publicationsDelivered; }
      }
      const acceptance = accD > 0 ? Math.round((accN / accD) * 100) : 50;
      const completion = comC > 0 ? Math.round((comp / comC) * 100) : 50;
      const impact = impactScore({ investigationsCompleted: completedTot, acceptedFindings: found, governanceActions: gov, publicationsDelivered: pubs });
      const eff = teamEffectiveness({ acceptance, completion, impact });
      await client.from('team_effectiveness').upsert({ team_key: domain, effectiveness_score: eff, acceptance, completion, impact, members: ids.length, computed_at: now }, { onConflict: 'team_key' });
    }
  } catch (e) { logger.warn('contributor.effectiveness.failed', { error: e instanceof Error ? e.message : String(e) }); }

  // ---- OUTCOME ATTRIBUTION (Phase 29) — chains + impact + backfill -----------
  await runOutcomeAttribution(client, now, result);

  // ---- INTELLIGENCE LINEAGE (Phase 30) — backfill links + graph health -------
  await runLineage(client, now, result);

  return result;
}

/**
 * OUTCOME ATTRIBUTION (Phase 29) — backfill attribution chains + impact from the
 * existing investigations / governance decisions / publications, then materialize
 * entity_impact + outcome_events (idempotent) + impact_history. Anti-gaming:
 * cleanAttribution() removes self-loops/cycles/duplicates/self-attribution; UNIQUE
 * idempotency keys prevent duplicate outcomes/edges. NEVER writes user_roles.
 */
async function runOutcomeAttribution(client: AnyClient, now: string, result: ContributorNetworkResult): Promise<void> {
  const edges: AttributionEdge[] = [];
  const outcomeRows: Array<{ outcome_type: OutcomeType; entity_kind: string; entity_id: string; actor_id: string | null; team_key: string | null; impact_weight: number; reason: string; idempotency_key: string }> = [];
  // Per-contributor outcome tallies for contributor impact.
  const byContributor = new Map<string, { vf: number; ga: number; pubs: number; outcomes: number }>();
  const cTally = (id: string) => { let t = byContributor.get(id); if (!t) { t = { vf: 0, ga: 0, pubs: 0, outcomes: 0 }; byContributor.set(id, t); } return t; };

  const govByInv = new Map<string, { decision: string; decider: string | null }>();
  const invImpactRows: Array<{ id: string; owner: string | null; teamId: string | null; status: string }> = [];

  // Phase 30 upgrade — use MATERIALIZED lineage links instead of inferred chains.
  try {
    const { data: sigLinks } = await client.from('investigation_signals').select('signal_id, investigation_id').limit(50000);
    for (const r of (sigLinks ?? []) as Array<{ signal_id: string; investigation_id: string }>) {
      edges.push({ origin: { type: 'signal', id: r.signal_id }, destination: { type: 'investigation', id: r.investigation_id }, relationship: 'signal_to_investigation', weight: 0.8 });
    }
    const { data: pubLinks } = await client.from('investigation_publications').select('investigation_id, publication_id').limit(50000);
    for (const r of (pubLinks ?? []) as Array<{ investigation_id: string; publication_id: string }>) {
      edges.push({ origin: { type: 'investigation', id: r.investigation_id }, destination: { type: 'publication', id: r.publication_id }, relationship: 'investigation_to_publication', weight: 0.9 });
    }
  } catch (e) { logger.warn('outcome.lineageLinks.failed', { error: e instanceof Error ? e.message : String(e) }); }

  try {
    const { data: govs } = await client.from('investigation_governance_decisions').select('investigation_id, decided_by, decision, created_at').order('created_at', { ascending: true });
    for (const g of (govs ?? []) as Array<{ investigation_id: string; decided_by: string | null; decision: string }>) govByInv.set(g.investigation_id, { decision: g.decision, decider: g.decided_by });

    const { data: invs } = await client.from('investigations').select('id, owner_id, team_id, status');
    for (const inv of (invs ?? []) as Array<{ id: string; owner_id: string | null; team_id: string | null; status: string }>) {
      invImpactRows.push({ id: inv.id, owner: inv.owner_id, teamId: inv.team_id, status: inv.status });
      const completed = inv.status === 'published' || inv.status === 'publication_ready';
      const gov = govByInv.get(inv.id);
      if (completed) {
        const type: OutcomeType = inv.status === 'published' ? 'INVESTIGATION_COMPLETED' : 'VERIFIED_FINDING';
        outcomeRows.push({ outcome_type: type, entity_kind: 'investigation', entity_id: inv.id, actor_id: inv.owner_id, team_key: inv.team_id, impact_weight: 1, reason: `Investigation ${inv.status}.`, idempotency_key: `inv:${inv.id}:${type}` });
        edges.push({ origin: { type: 'investigation', id: inv.id }, destination: { type: 'outcome', id: `inv-${inv.id}` }, relationship: 'investigation_to_outcome', weight: inv.status === 'published' ? 1 : 0.7, originOwner: inv.owner_id, destinationOwner: inv.owner_id });
        if (inv.owner_id) {
          edges.push({ origin: { type: 'contributor', id: inv.owner_id }, destination: { type: 'outcome', id: `inv-${inv.id}` }, relationship: 'contributor_to_outcome', weight: 0.6, originOwner: inv.owner_id, destinationOwner: gov?.decider ?? null });
          const t = cTally(inv.owner_id); t.vf += inv.status === 'publication_ready' ? 1 : 0; t.outcomes++;
        }
      }
      if (gov && gov.decision === 'cleared') {
        outcomeRows.push({ outcome_type: 'GOVERNANCE_ACTION', entity_kind: 'investigation', entity_id: inv.id, actor_id: gov.decider, team_key: inv.team_id, impact_weight: 0.9, reason: 'Governance cleared.', idempotency_key: `gov:${inv.id}:cleared` });
        if (gov.decider) {
          edges.push({ origin: { type: 'contributor', id: gov.decider }, destination: { type: 'outcome', id: `gov-${inv.id}` }, relationship: 'contributor_to_outcome', weight: 0.5, originOwner: gov.decider, destinationOwner: inv.owner_id });
          const t = cTally(gov.decider); t.ga++; t.outcomes++;
        }
      }
    }
  } catch (e) { logger.warn('outcome.investigations.failed', { error: e instanceof Error ? e.message : String(e) }); }

  // Publications → reach + outcomes.
  const pubImpactRows: Array<{ id: string; quality: number; evidence: number; published: boolean }> = [];
  try {
    const { data: pubs } = await client.from('hsin_publications').select('id, created_by, state, trust_score, evidence_count');
    for (const p of (pubs ?? []) as Array<{ id: string; created_by: string | null; state: string; trust_score: number | null; evidence_count: number | null }>) {
      const published = p.state === 'PUBLISHED';
      pubImpactRows.push({ id: p.id, quality: Number(p.trust_score ?? 0), evidence: Number(p.evidence_count ?? 0), published });
      if (published) {
        outcomeRows.push({ outcome_type: 'PUBLICATION_RELEASED', entity_kind: 'publication', entity_id: p.id, actor_id: p.created_by, team_key: 'curation', impact_weight: 0.7, reason: 'Publication released.', idempotency_key: `pub:${p.id}:released` });
        edges.push({ origin: { type: 'publication', id: p.id }, destination: { type: 'outcome', id: `pub-${p.id}` }, relationship: 'publication_to_outcome', weight: 1, originOwner: p.created_by, destinationOwner: p.created_by });
        if (p.created_by) {
          edges.push({ origin: { type: 'contributor', id: p.created_by }, destination: { type: 'outcome', id: `pub-${p.id}` }, relationship: 'contributor_to_outcome', weight: 0.7, originOwner: p.created_by, destinationOwner: null });
          const t = cTally(p.created_by); t.pubs++; t.outcomes++;
        }
      }
    }
  } catch (e) { logger.warn('outcome.publications.failed', { error: e instanceof Error ? e.message : String(e) }); }

  // Anti-gaming pass before persisting credit edges.
  const cleaned = cleanAttribution(edges);

  // Persist attribution_ledger (idempotent).
  try {
    for (const e of cleaned.clean) {
      const key = `${e.origin.type}:${e.origin.id}->${e.destination.type}:${e.destination.id}:${e.relationship}`;
      await client.from('attribution_ledger').upsert({
        origin_kind: e.origin.type, origin_id: e.origin.id, destination_kind: e.destination.type, destination_id: e.destination.id,
        relationship: e.relationship, weight: e.weight, origin_owner: isUuid(e.originOwner) ? e.originOwner : null, destination_owner: isUuid(e.destinationOwner) ? e.destinationOwner : null, idempotency_key: key,
      }, { onConflict: 'idempotency_key', ignoreDuplicates: true });
      result.attributionEdgesWritten++;
    }
  } catch (e) { logger.warn('outcome.ledger.failed', { error: e instanceof Error ? e.message : String(e) }); }

  // Persist outcome_events (idempotent).
  try {
    for (const o of outcomeRows) {
      await client.from('outcome_events').upsert({ ...o, actor_id: isUuid(o.actor_id) ? o.actor_id : null }, { onConflict: 'idempotency_key', ignoreDuplicates: true });
      result.outcomeEventsWritten++;
    }
  } catch (e) { logger.warn('outcome.events.failed', { error: e instanceof Error ? e.message : String(e) }); }

  // Materialize entity_impact (+ impact_history on change).
  const upsertImpact = async (kind: string, id: string, score: number, extras: Record<string, number | string | null>): Promise<void> => {
    try {
      const { data: prior } = await client.from('entity_impact').select('impact_score').eq('entity_kind', kind).eq('entity_id', id).maybeSingle();
      const prev = (prior as { impact_score?: number } | null)?.impact_score ?? null;
      await client.from('entity_impact').upsert({ entity_kind: kind, entity_id: id, impact_score: score, computed_at: now, ...extras }, { onConflict: 'entity_kind,entity_id' });
      result.entityImpactUpserted++;
      if (prev === null || prev !== score) {
        await client.from('impact_history').insert({ entity_kind: kind, entity_id: id, previous_score: prev, new_score: score, reason: prev === null ? 'Initial impact computation.' : 'Recomputed from outcomes.' });
      }
    } catch (e) { logger.warn('outcome.impact.failed', { kind, id, error: e instanceof Error ? e.message : String(e) }); }
  };

  for (const inv of invImpactRows) {
    const completed = inv.status === 'published' || inv.status === 'publication_ready';
    const score = investigationImpact({ acceptedFindings: completed ? 1 : 0, governanceActions: govByInv.get(inv.id)?.decision === 'cleared' ? 1 : 0, publications: inv.status === 'published' ? 1 : 0, realOutcomes: completed ? 1 : 0 });
    await upsertImpact('investigation', inv.id, score, { team_key: inv.teamId, verified_findings: inv.status === 'publication_ready' ? 1 : 0, governance_actions: govByInv.get(inv.id)?.decision === 'cleared' ? 1 : 0, publications: inv.status === 'published' ? 1 : 0, outcomes_count: completed ? 1 : 0 });
  }
  for (const p of pubImpactRows) {
    const score = publicationReach({ published: p.published, publicationQuality: p.quality, traceability: p.quality, evidenceVolume: p.evidence, outcomesProduced: p.published ? 1 : 0 });
    await upsertImpact('publication', p.id, score, { publications: 1, outcomes_count: p.published ? 1 : 0 });
  }
  for (const [uid, t] of byContributor) {
    const attributedWeight = cleaned.clean.filter((e) => e.relationship === 'contributor_to_outcome' && e.origin.id === uid).reduce((s, e) => s + e.weight, 0);
    const score = contributorImpact({ verifiedFindings: t.vf, governanceActions: t.ga, publicationsDriven: t.pubs, outcomesCreated: t.outcomes, attributedWeight });
    await upsertImpact('contributor', uid, score, { verified_findings: t.vf, governance_actions: t.ga, publications: t.pubs, outcomes_count: t.outcomes });
  }
}

function isUuid(v: string | null | undefined): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/**
 * INTELLIGENCE LINEAGE (Phase 30) — BACKFILL the derivable links + compute graph
 * health. publication_evidence is materialized from the research-runs pipeline
 * (evidence_sources.research_run_id ⋈ hsin_publications.run_id). The lineage
 * graph (link tables + outcome events) feeds graph_health. NEVER writes user_roles.
 */
async function runLineage(client: AnyClient, now: string, result: ContributorNetworkResult): Promise<void> {
  const N = (kind: LineageNode['kind'], id: string): LineageNode => ({ kind, id });
  const edges: LineageEdge[] = [];

  // 1. BACKFILL publication_evidence from research-runs (the real, derivable link).
  try {
    const { data: pubs } = await client.from('hsin_publications').select('id, run_id');
    const runToPubs = new Map<string, string[]>();
    for (const p of (pubs ?? []) as Array<{ id: string; run_id: string | null }>) {
      if (!p.run_id) continue;
      const list = runToPubs.get(p.run_id) ?? []; list.push(p.id); runToPubs.set(p.run_id, list);
    }
    if (runToPubs.size > 0) {
      const { data: evi } = await client.from('evidence_sources').select('id, research_run_id');
      for (const e of (evi ?? []) as Array<{ id: string; research_run_id: string | null }>) {
        const pubIds = e.research_run_id ? runToPubs.get(e.research_run_id) : undefined;
        if (!pubIds) continue;
        for (const pubId of pubIds) {
          await client.from('publication_evidence').upsert({ publication_id: pubId, evidence_id: e.id }, { onConflict: 'publication_id,evidence_id', ignoreDuplicates: true });
          result.lineageLinksBackfilled++;
        }
      }
    }
  } catch (e) { logger.warn('lineage.backfill.failed', { error: e instanceof Error ? e.message : String(e) }); }

  // 2. Build the lineage graph from the materialized link tables + outcomes.
  const load = async (table: string, build: (r: Record<string, unknown>) => LineageEdge) => {
    try { const { data } = await client.from(table).select('*').limit(50000); for (const r of (data ?? []) as Array<Record<string, unknown>>) edges.push(build(r)); } catch { /* optional */ }
  };
  await load('investigation_signals', (r) => ({ from: N('signal', String(r.signal_id)), to: N('investigation', String(r.investigation_id)), relation: 'signal_to_investigation' }));
  await load('investigation_publications', (r) => ({ from: N('investigation', String(r.investigation_id)), to: N('publication', String(r.publication_id)), relation: 'investigation_to_publication' }));
  await load('investigation_evidence', (r) => ({ from: N('investigation', String(r.investigation_id)), to: N('evidence', String(r.evidence_id)), relation: 'investigation_to_evidence' }));
  await load('publication_evidence', (r) => ({ from: N('publication', String(r.publication_id)), to: N('evidence', String(r.evidence_id)), relation: 'publication_to_evidence' }));
  await load('outcome_events', (r) => ({ from: N(String(r.entity_kind) as LineageNode['kind'], String(r.entity_id)), to: N('outcome', String(r.id)), relation: String(r.entity_kind) === 'publication' ? 'publication_to_outcome' : 'investigation_to_outcome' }));

  // 3. Compute + store graph health (Deliverable 23/24).
  try {
    const health = computeGraphHealth(edges);
    result.graphHealthScore = health.healthScore;
    await client.from('graph_health').insert({
      node_count: health.nodeCount, edge_count: health.edgeCount, orphan_count: health.orphanCount,
      broken_chain_count: health.brokenChainCount, cycle_count: health.cycleCount,
      chain_completeness: health.chainCompleteness, average_trace_depth: health.averageTraceDepth,
      coverage: health.coverage, health_score: health.healthScore, computed_at: now,
    });
  } catch (e) { logger.warn('lineage.health.failed', { error: e instanceof Error ? e.message : String(e) }); }
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
