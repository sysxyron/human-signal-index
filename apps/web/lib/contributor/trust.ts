'use server';

// =============================================================================
// HSI Phase 27 — trust DAL. Reads the worker-computed trust_profiles / history
// for the authority page, profile integration, team trust metrics, and admin
// trust monitoring. READ-ONLY. Trust/authority are recognition only — never an
// RBAC role. Offline → deterministic demo from the pure @hsi/trust-graph engine.
// =============================================================================

import {
  computeTrust, levelForAuthority, nextLevel, contributorInsights, NEUTRAL_INPUTS,
  demoContributorTrust, demoHighTrust,
  type TrustScores, type ContributorInsights,
} from '@hsi/trust-graph';
import { createClient, getUser } from '@/lib/supabase/server';
import { requireAdmin, supabaseConfigured, notConfigured, adminFail, type DbResult } from '@/lib/admin/guard';
import { contributorConfigured, type ContribResult } from './options';

export interface MyTrust {
  scores: TrustScores;
  level: string;
  nextLevel: { name: string; authorityToNext: number } | null;
  agreementPct: number;
  disagreementPct: number;
  insights: ContributorInsights;
  history: Array<{ previousAuthority: number | null; newAuthority: number | null; reason: string | null; at: string }>;
}

function fromScores(scores: TrustScores, agreementPct = 0, disagreementPct = 0): Omit<MyTrust, 'history'> {
  const next = nextLevel(scores.authority);
  return {
    scores, level: levelForAuthority(scores.authority).name,
    nextLevel: next ? { name: next.level.name, authorityToNext: next.authorityToNext } : null,
    agreementPct, disagreementPct, insights: contributorInsights(scores),
  };
}

/** The signed-in user's trust profile + recent history. */
export async function getMyTrustAction(): Promise<ContribResult<MyTrust>> {
  if (!contributorConfigured()) {
    return { ok: true, demo: true, data: { ...fromScores(computeTrust(demoHighTrust), 90, 10), history: [
      { previousAuthority: 68, newAuthority: 74, reason: 'Recomputed from contribution events.', at: '2026-06-13T11:00:00Z' },
      { previousAuthority: null, newAuthority: 68, reason: 'Initial trust computation.', at: '2026-06-10T11:00:00Z' },
    ] } };
  }
  try {
    const user = await getUser();
    if (!user) return { ok: false, code: 'AUTH_REQUIRED' };
    const db = createClient();
    const { data: p } = await db.from('trust_profiles').select('*').eq('user_id', user.id).maybeSingle();
    const { data: h } = await db.from('trust_history').select('previous_authority, new_authority, reason, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20);
    const history = ((h ?? []) as Array<Record<string, unknown>>).map((r) => ({
      previousAuthority: (r.previous_authority as number) ?? null, newAuthority: (r.new_authority as number) ?? null,
      reason: (r.reason as string) ?? null, at: String(r.created_at),
    }));
    if (!p) {
      // No profile computed yet → neutral (worker will populate on next run).
      return { ok: true, data: { ...fromScores(computeTrust(NEUTRAL_INPUTS)), history } };
    }
    const row = p as Record<string, number | string>;
    const scores: TrustScores = {
      signalAccuracy: Number(row.signal_accuracy ?? 50), reviewAccuracy: Number(row.review_accuracy ?? 50),
      publicationQuality: Number(row.publication_quality ?? 50), reliability: Number(row.reliability ?? 50),
      impact: Number(row.impact_score ?? 50), governanceEffectiveness: Number(row.governance_effectiveness ?? 50),
      accuracy: Number(row.accuracy ?? 50), trust: Number(row.trust_score ?? 50), authority: Number(row.authority_score ?? 50),
    };
    return { ok: true, data: { ...fromScores(scores, Number(row.agreement_pct ?? 0), Number(row.disagreement_pct ?? 0)), history } };
  } catch {
    return { ok: false, code: 'DB_ERROR' };
  }
}

export interface TeamTrust { team: string; members: number; avgTrust: number; avgReliability: number; avgAuthority: number }

/** Team trust metrics (Deliverable 12). researcher+ (RLS: trust_profiles read). */
export async function getTeamTrustAction(): Promise<ContribResult<TeamTrust[]>> {
  if (!contributorConfigured()) {
    const byTeam = new Map<string, { t: number; r: number; a: number; n: number }>();
    for (const c of demoContributorTrust) {
      const s = computeTrust(c.inputs);
      const e = byTeam.get(c.team) ?? { t: 0, r: 0, a: 0, n: 0 };
      e.t += s.trust; e.r += s.reliability; e.a += s.authority; e.n++; byTeam.set(c.team, e);
    }
    return { ok: true, demo: true, data: [...byTeam.entries()].map(([team, e]) => ({ team, members: e.n, avgTrust: Math.round(e.t / e.n), avgReliability: Math.round(e.r / e.n), avgAuthority: Math.round(e.a / e.n) })) };
  }
  try {
    const user = await getUser();
    if (!user) return { ok: false, code: 'AUTH_REQUIRED' };
    const db = createClient();
    const { data: members } = await db.from('team_members').select('user_id, teams(name)');
    const { data: profiles } = await db.from('trust_profiles').select('user_id, trust_score, reliability, authority_score');
    const profById = new Map(((profiles ?? []) as Array<Record<string, number | string>>).map((p) => [String(p.user_id), p]));
    const byTeam = new Map<string, { t: number; r: number; a: number; n: number }>();
    for (const m of (members ?? []) as Array<{ user_id: string; teams?: { name?: string } | { name?: string }[] }>) {
      const rel = m.teams; const team = Array.isArray(rel) ? rel[0]?.name : rel?.name;
      const prof = profById.get(m.user_id);
      if (!team || !prof) continue;
      const e = byTeam.get(team) ?? { t: 0, r: 0, a: 0, n: 0 };
      e.t += Number(prof.trust_score ?? 0); e.r += Number(prof.reliability ?? 0); e.a += Number(prof.authority_score ?? 0); e.n++; byTeam.set(team, e);
    }
    return { ok: true, data: [...byTeam.entries()].map(([team, e]) => ({ team, members: e.n, avgTrust: Math.round(e.t / e.n), avgReliability: Math.round(e.r / e.n), avgAuthority: Math.round(e.a / e.n) })) };
  } catch {
    return { ok: false, code: 'DB_ERROR' };
  }
}

export interface TrustMover { userId: string; email: string | null; delta: number; newAuthority: number; at: string }
export interface AuthorityRanking { userId: string; email: string | null; authority: number; trust: number; level: string }
export interface TrustChange { userId: string; email: string | null; previousTrust: number | null; newTrust: number | null; previousAuthority: number | null; newAuthority: number | null; reason: string | null; at: string }
export interface TrustMonitoring { rapidIncreases: TrustMover[]; rapidDecreases: TrustMover[]; rankings: AuthorityRanking[]; recentChanges: TrustChange[] }

const RAPID_DELTA = 15;

const DEMO_MONITORING: TrustMonitoring = {
  rapidIncreases: [{ userId: 'u7', email: 'fast@example.com', delta: 28, newAuthority: 72, at: '2026-06-13T10:00:00Z' }],
  rapidDecreases: [{ userId: 'u9', email: 'drop@example.com', delta: -22, newAuthority: 31, at: '2026-06-13T09:00:00Z' }],
  rankings: demoContributorTrust.map((c) => { const s = computeTrust(c.inputs); return { userId: c.id, email: `${c.name.split(' ')[0].toLowerCase()}@example.com`, authority: s.authority, trust: s.trust, level: levelForAuthority(s.authority).name }; }).sort((a, b) => b.authority - a.authority),
  recentChanges: [
    { userId: 'u7', email: 'fast@example.com', previousTrust: 60, newTrust: 71, previousAuthority: 44, newAuthority: 72, reason: 'Recomputed from contribution events.', at: '2026-06-13T10:00:00Z' },
    { userId: 'u9', email: 'drop@example.com', previousTrust: 48, newTrust: 33, previousAuthority: 53, newAuthority: 31, reason: 'Recomputed from contribution events.', at: '2026-06-13T09:00:00Z' },
  ],
};

/** ADMIN: trust monitoring (rapid moves + authority rankings). Read-only. */
export async function getTrustMonitoringAction(): Promise<DbResult<TrustMonitoring> & { demo?: boolean }> {
  if (!supabaseConfigured()) return { ok: true, data: DEMO_MONITORING, demo: true };
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const db = gate.ctx.db;
  try {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const [histRes, profRes] = await Promise.all([
      db.from('trust_history').select('user_id, previous_trust, new_trust, previous_authority, new_authority, reason, created_at, users(email)').gte('created_at', since).order('created_at', { ascending: false }).limit(500),
      db.from('trust_profiles').select('user_id, authority_score, trust_score, trust_level, users(email)').order('authority_score', { ascending: false }).limit(50),
    ]);
    const email = (rel: unknown): string | null => { const r = Array.isArray(rel) ? rel[0] : rel; return (r as { email?: string } | null)?.email ?? null; };
    const hist = (histRes.data ?? []) as Array<Record<string, unknown>>;
    const movers: TrustMover[] = hist
      .map((r) => ({ userId: String(r.user_id), email: email(r.users), delta: Number(r.new_authority ?? 0) - Number(r.previous_authority ?? r.new_authority ?? 0), newAuthority: Number(r.new_authority ?? 0), at: String(r.created_at) }));
    const rapidIncreases = movers.filter((m) => m.delta >= RAPID_DELTA).slice(0, 20);
    const rapidDecreases = movers.filter((m) => m.delta <= -RAPID_DELTA).slice(0, 20);
    const recentChanges: TrustChange[] = hist.slice(0, 30).map((r) => ({
      userId: String(r.user_id), email: email(r.users),
      previousTrust: (r.previous_trust as number) ?? null, newTrust: (r.new_trust as number) ?? null,
      previousAuthority: (r.previous_authority as number) ?? null, newAuthority: (r.new_authority as number) ?? null,
      reason: (r.reason as string) ?? null, at: String(r.created_at),
    }));
    const rankings: AuthorityRanking[] = ((profRes.data ?? []) as Array<Record<string, unknown>>).map((p) => ({ userId: String(p.user_id), email: email(p.users), authority: Number(p.authority_score ?? 0), trust: Number(p.trust_score ?? 0), level: String(p.trust_level ?? 'Observer') }));
    return { ok: true, data: { rapidIncreases, rapidDecreases, rankings, recentChanges } };
  } catch (e) {
    return adminFail(e);
  }
}
