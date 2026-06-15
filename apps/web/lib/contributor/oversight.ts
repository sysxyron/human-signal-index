'use server';

// =============================================================================
// HSI Phase 26 — admin contribution OVERSIGHT (Deliverable 12). READ-ONLY. Lets
// admins monitor the contributor network: top contributors, reputation anomalies,
// suspicious growth, recent badge unlocks, and rank changes. There is NO manual
// XP editing here — awards are only ever produced by the audited recorder.
// =============================================================================

import { requireAdmin, supabaseConfigured, notConfigured, adminFail, type DbResult } from '@/lib/admin/guard';

export interface TopContributor { userId: string; email: string | null; xp: number; credits: number; xpRank: string; reputation: number; signalsAccepted: number; reviewsCompleted: number; badges: number }
export interface Anomaly { userId: string; email: string | null; reason: string; xp: number; reputation: number }
export interface GrowthFlag { userId: string; email: string | null; eventsLast24h: number }
export interface BadgeUnlock { userId: string; email: string | null; badgeId: string; awardedAt: string }
export interface RankRow { userId: string; email: string | null; track: string; rankName: string; computedAt: string | null }

export interface ContributionMonitoring {
  topContributors: TopContributor[];
  anomalies: Anomaly[];
  suspiciousGrowth: GrowthFlag[];
  recentBadges: BadgeUnlock[];
  recentRanks: RankRow[];
}

// Heuristics (advisory only — never auto-act).
const ANOMALY_MIN_XP = 1000;
const ANOMALY_MAX_REP = 35;
const GROWTH_EVENTS_24H = 50;

const DEMO: ContributionMonitoring = {
  topContributors: [
    { userId: 'u5', email: 'jin@example.com', xp: 5400, credits: 180, xpRank: 'Expert', reputation: 88, signalsAccepted: 110, reviewsCompleted: 22, badges: 4 },
    { userId: 'u1', email: 'ada@example.com', xp: 2150, credits: 95, xpRank: 'Specialist', reputation: 78, signalsAccepted: 64, reviewsCompleted: 12, badges: 3 },
  ],
  anomalies: [{ userId: 'u9', email: 'spike@example.com', reason: 'High XP, low reputation', xp: 1800, reputation: 22 }],
  suspiciousGrowth: [{ userId: 'u9', email: 'spike@example.com', eventsLast24h: 140 }],
  recentBadges: [{ userId: 'u5', email: 'jin@example.com', badgeId: 'signal_veteran', awardedAt: '2026-06-13T10:00:00Z' }],
  recentRanks: [{ userId: 'u5', email: 'jin@example.com', track: 'research', rankName: 'Senior Researcher', computedAt: '2026-06-13T11:00:00Z' }],
};

function email(rel: unknown): string | null {
  const r = Array.isArray(rel) ? rel[0] : rel;
  return (r as { email?: string } | null)?.email ?? null;
}

export async function getContributionMonitoringAction(): Promise<DbResult<ContributionMonitoring> & { demo?: boolean }> {
  if (!supabaseConfigured()) return { ...notConfigured(), demo: true } as DbResult<ContributionMonitoring> & { demo?: boolean };
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const db = gate.ctx.db;
  try {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const [statsRes, badgeRes, rankRes, eventRes] = await Promise.all([
      db.from('user_contribution_stats').select('user_id, xp, credits, xp_rank, reputation_overall, signals_accepted, reviews_completed, badges_earned, users(email)').order('xp', { ascending: false }).limit(50),
      db.from('user_badges').select('user_id, badge_id, awarded_at, users(email)').order('awarded_at', { ascending: false }).limit(20),
      db.from('user_ranks').select('user_id, track, rank_name, computed_at, users(email)').order('computed_at', { ascending: false }).limit(20),
      db.from('contribution_events').select('actor_id').gte('created_at', since).limit(100000),
    ]);

    const stats = (statsRes.data ?? []) as Array<Record<string, unknown>>;
    const topContributors: TopContributor[] = stats.slice(0, 20).map((s) => ({
      userId: String(s.user_id), email: email(s.users), xp: Number(s.xp ?? 0), credits: Number(s.credits ?? 0),
      xpRank: String(s.xp_rank ?? 'Observer'), reputation: Number(s.reputation_overall ?? 0),
      signalsAccepted: Number(s.signals_accepted ?? 0), reviewsCompleted: Number(s.reviews_completed ?? 0), badges: Number(s.badges_earned ?? 0),
    }));
    const anomalies: Anomaly[] = stats
      .filter((s) => Number(s.xp ?? 0) >= ANOMALY_MIN_XP && Number(s.reputation_overall ?? 0) <= ANOMALY_MAX_REP)
      .map((s) => ({ userId: String(s.user_id), email: email(s.users), reason: 'High XP, low reputation', xp: Number(s.xp ?? 0), reputation: Number(s.reputation_overall ?? 0) }));

    // Suspicious growth — many events from one actor in the last 24h.
    const counts = new Map<string, number>();
    for (const r of (eventRes.data ?? []) as Array<{ actor_id: string | null }>) {
      if (r.actor_id) counts.set(r.actor_id, (counts.get(r.actor_id) ?? 0) + 1);
    }
    const emailByUser = new Map(stats.map((s) => [String(s.user_id), email(s.users)]));
    const suspiciousGrowth: GrowthFlag[] = [...counts.entries()]
      .filter(([, n]) => n >= GROWTH_EVENTS_24H)
      .sort((a, b) => b[1] - a[1])
      .map(([userId, n]) => ({ userId, email: emailByUser.get(userId) ?? null, eventsLast24h: n }));

    const recentBadges: BadgeUnlock[] = ((badgeRes.data ?? []) as Array<Record<string, unknown>>).map((b) => ({ userId: String(b.user_id), email: email(b.users), badgeId: String(b.badge_id), awardedAt: String(b.awarded_at) }));
    const recentRanks: RankRow[] = ((rankRes.data ?? []) as Array<Record<string, unknown>>).map((r) => ({ userId: String(r.user_id), email: email(r.users), track: String(r.track), rankName: String(r.rank_name), computedAt: (r.computed_at as string) ?? null }));

    return { ok: true, data: { topContributors, anomalies, suspiciousGrowth, recentBadges, recentRanks } };
  } catch (e) {
    return adminFail(e);
  }
}

export async function getContributionMonitoringDemo(): Promise<ContributionMonitoring> {
  return DEMO;
}
