'use server';

// =============================================================================
// HSI Phase 32 — beta tester DAL. Testers self-serve their whole journey (join /
// onboard / missions / report issues / feedback / earn recognition) via SELF RLS
// — NO admin intervention. Privileged ROLE advancement still uses admin-approved
// role_applications (Phase 25); nothing here grants a role. Offline → demo.
// =============================================================================

import {
  COHORTS, isCohortKey, canTransitionStatus, assignMissions, testerProgress, isProgramComplete,
  npsScore, cohortAnalytics, evaluateBetaBadges, newBetaBadges, BETA_BADGES,
  type CohortKey, type IssueCategory, type IssueSeverity, type TesterStatus, type TesterStats,
} from '@hsi/beta-engine';
import { MISSION_TEMPLATES } from '@hsi/contributor-network';
import { createClient, getUser } from '@/lib/supabase/server';
import { loadHighestRole } from '@/lib/auth/get-session-role';
import { requireAdmin, supabaseConfigured, adminFail, type DbResult } from '@/lib/admin/guard';
import { contributorConfigured, type ContribResult } from '@/lib/contributor/options';

const AVAILABLE = MISSION_TEMPLATES.map((m) => ({ id: m.id, role: m.role, title: m.title }));

export interface TesterDashboard {
  joined: boolean;
  status: TesterStatus;
  cohort: string | null;
  role: string | null;
  progress: { completionPct: number; assignedMissions: number; completedMissions: number; xp: number };
  missions: Array<{ id: string; title: string }>;
  badges: string[];
  issuesReported: number;
}

function demoDashboard(): TesterDashboard {
  return {
    joined: true, status: 'active', cohort: 'research', role: 'researcher',
    progress: { completionPct: 60, assignedMissions: 5, completedMissions: 3, xp: 240 },
    missions: assignMissions(AVAILABLE, { role: 'researcher', completedIds: [], rankLevel: 2, badgeCount: 1 }).map((m) => ({ id: m.id, title: m.title })),
    badges: ['found_bug', 'power_tester'], issuesReported: 3,
  };
}

/** Cohort list (Deliverable 2). */
export async function listCohortsAction(): Promise<ContribResult<typeof COHORTS>> {
  return { ok: true, data: COHORTS };
}

/** Tester self-service dashboard (Deliverables 5, 7, 10). */
export async function getTesterDashboardAction(): Promise<ContribResult<TesterDashboard>> {
  if (!contributorConfigured()) return { ok: true, demo: true, data: demoDashboard() };
  try {
    const user = await getUser();
    if (!user) return { ok: false, code: 'AUTH_REQUIRED' };
    const db = createClient();
    const role = await loadHighestRole(db, user.id);

    const { data: tester } = await db.from('beta_testers').select('status, cohort_id, beta_cohorts(key)').eq('user_id', user.id).maybeSingle();
    if (!tester) {
      return { ok: true, data: { joined: false, status: 'pending', cohort: null, role, progress: { completionPct: 0, assignedMissions: 0, completedMissions: 0, xp: 0 }, missions: [], badges: [], issuesReported: 0 } };
    }
    const rel = (tester as { beta_cohorts?: { key?: string } | { key?: string }[] }).beta_cohorts;
    const cohort = Array.isArray(rel) ? rel[0]?.key ?? null : rel?.key ?? null;

    const [{ data: missions }, { data: stats }, { data: badges }, { count: issueCount }] = await Promise.all([
      db.from('user_missions').select('template_id, status').eq('user_id', user.id),
      db.from('user_contribution_stats').select('xp').eq('user_id', user.id).maybeSingle(),
      db.from('tester_badges').select('badge_key').eq('user_id', user.id),
      db.from('beta_issues').select('id', { count: 'exact', head: true }).eq('reporter_id', user.id),
    ]);
    const missionRows = (missions ?? []) as Array<{ template_id: string; status: string }>;
    const completedIds = missionRows.filter((m) => m.status === 'completed' || m.status === 'claimed').map((m) => m.template_id);
    const assigned = assignMissions(AVAILABLE, { role: role ?? 'viewer', completedIds, rankLevel: 1, badgeCount: (badges ?? []).length });
    const prog = testerProgress({ assignedMissions: Math.max(assigned.length + completedIds.length, missionRows.length || assigned.length), completedMissions: completedIds.length, xp: Number((stats as { xp?: number } | null)?.xp ?? 0) });

    return { ok: true, data: {
      joined: true, status: (tester as { status: TesterStatus }).status, cohort, role,
      progress: { completionPct: prog.completionPct, assignedMissions: prog.assignedMissions, completedMissions: prog.completedMissions, xp: prog.xp },
      missions: assigned.map((m) => ({ id: m.id, title: m.title })),
      badges: ((badges ?? []) as Array<{ badge_key: string }>).map((b) => b.badge_key),
      issuesReported: issueCount ?? 0,
    } };
  } catch { return { ok: false, code: 'DB_ERROR' }; }
}

/** Self-service: join a cohort (status → active; no admin needed). Deliverable 4. */
export async function joinCohortAction(cohortKey: string): Promise<ContribResult<{ status: TesterStatus }>> {
  if (!supabaseConfigured()) return { ok: false, code: 'NOT_CONFIGURED' };
  if (!isCohortKey(cohortKey)) return { ok: false, code: 'DB_ERROR', error: 'Unknown cohort.' };
  try {
    const user = await getUser();
    if (!user) return { ok: false, code: 'AUTH_REQUIRED' };
    const db = createClient();
    const { data: cohort } = await db.from('beta_cohorts').select('id').eq('key', cohortKey).maybeSingle();
    const cohortId = (cohort as { id?: string } | null)?.id ?? null;
    const now = new Date().toISOString();
    const { error } = await db.from('beta_testers').upsert({ user_id: user.id, cohort_id: cohortId, status: 'active', joined_at: now }, { onConflict: 'user_id' });
    if (error) return { ok: false, code: 'DB_ERROR', error: error.message };
    await db.from('tester_activity').insert({ user_id: user.id, action: 'joined_cohort', metadata: { cohort: cohortKey } });
    return { ok: true, data: { status: 'active' } };
  } catch { return { ok: false, code: 'DB_ERROR' }; }
}

/** Self-service: report an issue (Deliverables 11-13). */
export async function reportIssueAction(input: { category: IssueCategory; severity: IssueSeverity; title: string; description?: string; route?: string }): Promise<ContribResult<{ id: string }>> {
  if (!supabaseConfigured()) return { ok: false, code: 'NOT_CONFIGURED' };
  if (!input.title || input.title.trim().length === 0) return { ok: false, code: 'DB_ERROR', error: 'A title is required.' };
  try {
    const user = await getUser();
    if (!user) return { ok: false, code: 'AUTH_REQUIRED' };
    const db = createClient();
    const { data, error } = await db.from('beta_issues').insert({ reporter_id: user.id, category: input.category, severity: input.severity, title: input.title.trim(), description: input.description ?? null, route: input.route ?? null }).select('id').single();
    if (error) return { ok: false, code: 'DB_ERROR', error: error.message };
    await db.from('tester_activity').insert({ user_id: user.id, action: 'reported_issue', metadata: { category: input.category, severity: input.severity } });
    await awardRecognitionAction(); // a reported issue may unlock "Found Bug"
    return { ok: true, data: { id: String((data as { id: string }).id) } };
  } catch { return { ok: false, code: 'DB_ERROR' }; }
}

/** Self-service: submit feedback + NPS (Deliverables 15, 16). */
export async function submitFeedbackAction(input: { category?: string; message?: string; nps?: number }): Promise<ContribResult<{ ok: true }>> {
  if (!supabaseConfigured()) return { ok: false, code: 'NOT_CONFIGURED' };
  try {
    const user = await getUser();
    if (!user) return { ok: false, code: 'AUTH_REQUIRED' };
    const db = createClient();
    const nps = typeof input.nps === 'number' && input.nps >= 0 && input.nps <= 10 ? input.nps : null;
    const { error } = await db.from('tester_feedback').insert({ user_id: user.id, category: input.category ?? null, message: input.message ?? null, nps_score: nps });
    if (error) return { ok: false, code: 'DB_ERROR', error: error.message };
    await db.from('tester_activity').insert({ user_id: user.id, action: 'submitted_feedback', metadata: { nps } });
    return { ok: true, data: { ok: true } };
  } catch { return { ok: false, code: 'DB_ERROR' }; }
}

/** Self-service: auto-award recognition badges the tester now qualifies for. */
export async function awardRecognitionAction(): Promise<ContribResult<{ awarded: string[] }>> {
  if (!supabaseConfigured()) return { ok: true, data: { awarded: [] } };
  try {
    const user = await getUser();
    if (!user) return { ok: false, code: 'AUTH_REQUIRED' };
    const db = createClient();
    const [{ data: stats }, { data: held }, { count: issues }, { data: missions }] = await Promise.all([
      db.from('user_contribution_stats').select('signals_accepted, reviews_completed').eq('user_id', user.id).maybeSingle(),
      db.from('tester_badges').select('badge_key').eq('user_id', user.id),
      db.from('beta_issues').select('id', { count: 'exact', head: true }).eq('reporter_id', user.id),
      db.from('user_missions').select('status').eq('user_id', user.id),
    ]);
    const s = (stats ?? {}) as Record<string, number>;
    const completedMissions = ((missions ?? []) as Array<{ status: string }>).filter((m) => m.status === 'completed' || m.status === 'claimed').length;
    const tStats: TesterStats = { issuesReported: issues ?? 0, missionsCompleted: completedMissions, signalsAccepted: Number(s.signals_accepted ?? 0), reviewsCompleted: Number(s.reviews_completed ?? 0), governanceActions: 0 };
    const fresh = newBetaBadges(tStats, ((held ?? []) as Array<{ badge_key: string }>).map((b) => b.badge_key));
    if (fresh.length) {
      await db.from('tester_badges').upsert(fresh.map((k) => ({ user_id: user.id, badge_key: k })), { onConflict: 'user_id,badge_key', ignoreDuplicates: true });
    }
    return { ok: true, data: { awarded: fresh } };
  } catch { return { ok: false, code: 'DB_ERROR' }; }
}

/** Self-service: claim completion + certificate when all missions are done. Deliverable 18. */
export async function claimCompletionAction(): Promise<ContribResult<{ completed: boolean }>> {
  if (!supabaseConfigured()) return { ok: false, code: 'NOT_CONFIGURED' };
  try {
    const user = await getUser();
    if (!user) return { ok: false, code: 'AUTH_REQUIRED' };
    const db = createClient();
    const { data: tester } = await db.from('beta_testers').select('status, cohort_id').eq('user_id', user.id).maybeSingle();
    if (!tester) return { ok: false, code: 'DB_ERROR', error: 'Join a cohort first.' };
    const status = (tester as { status: TesterStatus }).status;
    const dash = await getTesterDashboardAction();
    if (!dash.ok) return { ok: false, code: 'DB_ERROR' };
    const prog = testerProgress({ assignedMissions: dash.data.progress.assignedMissions, completedMissions: dash.data.progress.completedMissions, xp: dash.data.progress.xp });
    if (!isProgramComplete(prog)) return { ok: true, data: { completed: false } };
    if (!canTransitionStatus(status, 'completed')) return { ok: true, data: { completed: status === 'completed' } };
    await db.from('beta_testers').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('user_id', user.id);
    await db.from('tester_certificates').upsert({ user_id: user.id, cohort_id: (tester as { cohort_id: string | null }).cohort_id }, { onConflict: 'user_id', ignoreDuplicates: true });
    await db.from('tester_activity').insert({ user_id: user.id, action: 'completed_program' });
    return { ok: true, data: { completed: true } };
  } catch { return { ok: false, code: 'DB_ERROR' }; }
}

// ---- admin beta operations (Deliverables 14, 20-23) -----------------------
export interface BetaIssueRow { id: string; category: string; severity: string; title: string; status: string; reporter: string | null; at: string }
export interface BetaOps {
  issues: BetaIssueRow[];
  analytics: { activationRate: number; retentionRate: number; completionRate: number; missionCompletionRate: number };
  nps: { score: number; responses: number };
  cohorts: Array<{ key: string; testers: number }>;
}

const DEMO_OPS: BetaOps = {
  issues: [
    { id: 'i1', category: 'ui', severity: 'medium', title: 'Sidebar overflow on mobile', status: 'open', reporter: 'tester@example.com', at: '2026-06-13T10:00:00Z' },
    { id: 'i2', category: 'permissions', severity: 'high', title: 'Reviewer cannot open queue', status: 'triaged', reporter: 'rev@example.com', at: '2026-06-12T10:00:00Z' },
  ],
  analytics: { activationRate: 70, retentionRate: 64, completionRate: 15, missionCompletionRate: 62 },
  nps: { score: 40, responses: 10 },
  cohorts: [{ key: 'research', testers: 18 }, { key: 'reviewer', testers: 12 }],
};

/** ADMIN: beta operations center (issue queue + analytics + NPS). Deliverable 21. */
export async function getBetaOpsAction(): Promise<DbResult<BetaOps> & { demo?: boolean }> {
  if (!supabaseConfigured()) return { ok: true, data: DEMO_OPS, demo: true };
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const db = gate.ctx.db;
  try {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const [{ data: issues }, { data: testers }, { data: feedback }, { data: cohorts }, { data: activity }] = await Promise.all([
      db.from('beta_issues').select('id, category, severity, title, status, reporter_id, created_at, users:reporter_id(email)').order('created_at', { ascending: false }).limit(50),
      db.from('beta_testers').select('status, cohort_id'),
      db.from('tester_feedback').select('nps_score').not('nps_score', 'is', null),
      db.from('beta_cohorts').select('id, key'),
      db.from('tester_activity').select('user_id, created_at').gte('created_at', since),
    ]);
    const issueRows: BetaIssueRow[] = ((issues ?? []) as Array<Record<string, unknown>>).map((r) => {
      const rel = r.users as { email?: string } | { email?: string }[] | null;
      const email = Array.isArray(rel) ? rel[0]?.email ?? null : rel?.email ?? null;
      return { id: String(r.id), category: String(r.category), severity: String(r.severity), title: String(r.title), status: String(r.status), reporter: email, at: String(r.created_at) };
    });
    const tRows = (testers ?? []) as Array<{ status: string; cohort_id: string | null }>;
    const total = tRows.length;
    const active = tRows.filter((t) => t.status === 'active').length;
    const completed = tRows.filter((t) => t.status === 'completed').length;
    const activeUsers = new Set(((activity ?? []) as Array<{ user_id: string }>).map((a) => a.user_id));
    const analytics = cohortAnalytics({ total, invited: tRows.filter((t) => t.status === 'invited').length, active, completed, activeLastPeriod: activeUsers.size, missionsAssigned: Math.max(total, 1), missionsCompleted: completed });
    const nps = npsScore(((feedback ?? []) as Array<{ nps_score: number }>).map((f) => f.nps_score));
    const cohortById = new Map(((cohorts ?? []) as Array<{ id: string; key: string }>).map((c) => [c.id, c.key]));
    const cohortCounts = new Map<string, number>();
    for (const t of tRows) { const k = t.cohort_id ? cohortById.get(t.cohort_id) ?? 'unknown' : 'unassigned'; cohortCounts.set(k, (cohortCounts.get(k) ?? 0) + 1); }
    return { ok: true, data: { issues: issueRows, analytics, nps: { score: nps.score, responses: nps.responses }, cohorts: [...cohortCounts.entries()].map(([key, testersN]) => ({ key, testers: testersN })) } };
  } catch (e) { return adminFail(e); }
}

/** ADMIN: update an issue's status (review queue, Deliverable 14). */
export async function updateIssueStatusAction(id: string, status: string): Promise<DbResult<{ id: string }>> {
  if (!supabaseConfigured()) return { ok: false, error: 'Not configured.', code: 'NOT_CONFIGURED' };
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  try {
    const { error } = await gate.ctx.db.from('beta_issues').update({ status, resolved_by: gate.ctx.user.id }).eq('id', id);
    if (error) return adminFail(error);
    return { ok: true, data: { id } };
  } catch (e) { return adminFail(e); }
}

void BETA_BADGES; void evaluateBetaBadges; // re-exported for UI labels
