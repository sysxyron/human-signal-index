// =============================================================================
// HSI Phase 60 — Beta Launch operational DAL (SERVER-ONLY).
//
// Reads the new cohort/invite/feedback tables (admin console; reads use the
// service-role-preferred client so they work server-side regardless of RLS, on
// an already-admin-gated page). Writes take the caller's RLS admin client (from
// requireAdmin) so the admin policies apply. Everything is env-tolerant and never
// throws — degrades to empty/zero. User/contributor/source metrics are NOT
// duplicated here (the console composes those via the intelligence layer).
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { readPublicClient } from '../public-intelligence';

export type DbResultCode = 'AUTH_REQUIRED' | 'FORBIDDEN' | 'NOT_CONFIGURED' | 'DB_ERROR';
export type DbResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: DbResultCode };

export interface CohortRow {
  id: string;
  name: string;
  code: string | null;
  status: 'active' | 'archived';
  description: string | null;
  createdLabel: string;
  invited: number;
  accepted: number;
  active: number;
  retentionPct: number;
}

export interface InviteSummary { sent: number; pending: number; accepted: number; expired: number; revoked: number }
export interface InviteRow { id: string; email: string; role: string; cohortName: string | null; status: string; sentLabel: string }
export interface InviteEventRow { id: string; event: string; note: string | null; at: string; dateLabel: string }

export interface FeedbackSummary { open: number; reviewing: number; planned: number; completed: number; total: number }
export interface FeedbackItem { id: string; category: string; title: string; status: string; createdLabel: string }

export interface OnboardingStep { label: string; count: number | null; pct: number | null; tracked: boolean }

export interface BetaLaunchOps {
  cohorts: CohortRow[];
  invites: { summary: InviteSummary; recent: InviteRow[]; events: InviteEventRow[] };
  feedback: { summary: FeedbackSummary; recent: FeedbackItem[] };
  onboarding: OnboardingStep[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
function pct(n: number, d: number): number {
  return d <= 0 ? 0 : Math.round((n / d) * 1000) / 10;
}
async function distinctCount(c: SupabaseClient, table: string, col: string): Promise<number> {
  try {
    const { data } = await c.from(table).select(col).limit(5000);
    const set = new Set<string>();
    for (const r of (data ?? []) as unknown as Array<Record<string, unknown>>) {
      const v = r[col];
      if (typeof v === 'string') set.add(v);
    }
    return set.size;
  } catch {
    return 0;
  }
}

/** Load the cohort/invite/feedback/onboarding operational layer (read-only). */
export async function loadBetaLaunchOps(totalUsers: number): Promise<BetaLaunchOps> {
  const empty: BetaLaunchOps = {
    cohorts: [],
    invites: { summary: { sent: 0, pending: 0, accepted: 0, expired: 0, revoked: 0 }, recent: [], events: [] },
    feedback: { summary: { open: 0, reviewing: 0, planned: 0, completed: 0, total: 0 }, recent: [] },
    onboarding: [],
  };
  const c = readPublicClient();
  if (!c) return empty;

  // ---- cohorts (+ in-memory invite/member tallies — no N+1) ----
  let cohorts: CohortRow[] = [];
  try {
    const { data: cRows } = await c.from('beta_cohorts').select('id, name, code, status, description, created_at').order('created_at', { ascending: false }).limit(100);
    const rows = (cRows ?? []) as Array<{ id: string; name: string | null; code: string | null; status: string | null; description: string | null; created_at: string }>;
    const invitesByCohort = new Map<string, { invited: number; accepted: number }>();
    const membersByCohort = new Map<string, number>();
    try {
      const { data: inv } = await c.from('beta_invites').select('cohort_id, status').limit(5000);
      for (const r of (inv ?? []) as Array<{ cohort_id: string | null; status: string | null }>) {
        if (!r.cohort_id) continue;
        const e = invitesByCohort.get(r.cohort_id) ?? { invited: 0, accepted: 0 };
        e.invited += 1;
        if (r.status === 'accepted') e.accepted += 1;
        invitesByCohort.set(r.cohort_id, e);
      }
    } catch { /* ignore */ }
    try {
      const { data: mem } = await c.from('beta_cohort_members').select('cohort_id, status').limit(5000);
      for (const r of (mem ?? []) as Array<{ cohort_id: string | null; status: string | null }>) {
        if (!r.cohort_id || r.status !== 'active') continue;
        membersByCohort.set(r.cohort_id, (membersByCohort.get(r.cohort_id) ?? 0) + 1);
      }
    } catch { /* ignore */ }
    cohorts = rows.map((r) => {
      const inv = invitesByCohort.get(r.id) ?? { invited: 0, accepted: 0 };
      const active = membersByCohort.get(r.id) ?? 0;
      return {
        id: r.id,
        name: r.name ?? 'Cohort',
        code: r.code,
        status: (r.status === 'archived' ? 'archived' : 'active') as 'active' | 'archived',
        description: r.description,
        createdLabel: fmtDate(r.created_at),
        invited: inv.invited,
        accepted: inv.accepted,
        active,
        retentionPct: pct(active, inv.accepted),
      };
    });
  } catch { /* ignore */ }

  // ---- invites ----
  const invites: BetaLaunchOps['invites'] = { summary: { sent: 0, pending: 0, accepted: 0, expired: 0, revoked: 0 }, recent: [], events: [] };
  try {
    const cohortName = new Map(cohorts.map((c2) => [c2.id, c2.name]));
    const { data } = await c.from('beta_invites').select('id, email, role, cohort_id, status, sent_at').order('sent_at', { ascending: false }).limit(200);
    const rows = (data ?? []) as Array<{ id: string; email: string | null; role: string | null; cohort_id: string | null; status: string | null; sent_at: string }>;
    invites.summary.sent = rows.length;
    for (const r of rows) {
      const s = (r.status ?? 'pending') as keyof InviteSummary;
      if (s in invites.summary) (invites.summary as unknown as Record<string, number>)[s] += 1;
    }
    invites.recent = rows.slice(0, 15).map((r) => ({
      id: r.id, email: r.email ?? '—', role: r.role ?? 'viewer',
      cohortName: r.cohort_id ? (cohortName.get(r.cohort_id) ?? null) : null,
      status: r.status ?? 'pending', sentLabel: fmtDate(r.sent_at),
    }));
  } catch { /* ignore */ }
  try {
    const { data } = await c.from('beta_invite_events').select('id, event, note, created_at').order('created_at', { ascending: false }).limit(20);
    invites.events = ((data ?? []) as Array<{ id: string; event: string | null; note: string | null; created_at: string }>).map((r) => ({
      id: r.id, event: r.event ?? 'event', note: r.note, at: r.created_at, dateLabel: fmtDate(r.created_at),
    }));
  } catch { /* ignore */ }

  // ---- feedback ----
  const feedback: BetaLaunchOps['feedback'] = { summary: { open: 0, reviewing: 0, planned: 0, completed: 0, total: 0 }, recent: [] };
  try {
    const { data } = await c.from('beta_feedback').select('id, category, title, status, created_at').order('created_at', { ascending: false }).limit(200);
    const rows = (data ?? []) as Array<{ id: string; category: string | null; title: string | null; status: string | null; created_at: string }>;
    feedback.summary.total = rows.length;
    for (const r of rows) {
      const s = (r.status ?? 'open') as keyof FeedbackSummary;
      if (s !== 'total' && s in feedback.summary) (feedback.summary as unknown as Record<string, number>)[s] += 1;
    }
    feedback.recent = rows.slice(0, 15).map((r) => ({
      id: r.id, category: r.category ?? 'other', title: r.title ?? '(untitled)', status: r.status ?? 'open', createdLabel: fmtDate(r.created_at),
    }));
  } catch { /* ignore */ }

  // ---- onboarding funnel (derivable steps only; honest placeholders else) ----
  const submitters = await distinctCount(c, 'signal_submissions', 'submitter_id');
  const reviewers = await distinctCount(c, 'hsin_signal_reviews', 'reviewer_id');
  const onboarding: OnboardingStep[] = [
    { label: 'Account created', count: totalUsers, pct: 100, tracked: true },
    { label: 'Profile completed', count: null, pct: null, tracked: false },
    { label: 'First login', count: null, pct: null, tracked: false },
    { label: 'First signal submitted', count: submitters, pct: pct(submitters, totalUsers), tracked: true },
    { label: 'First review completed', count: reviewers, pct: pct(reviewers, totalUsers), tracked: true },
    { label: 'First publication viewed', count: null, pct: null, tracked: false },
  ];

  return { cohorts, invites, feedback, onboarding };
}

// ---- writes (admin RLS client passed in from requireAdmin) ------------------

function fail(e: unknown): { ok: false; error: string; code: DbResultCode } {
  return { ok: false, error: e instanceof Error ? e.message : 'Operation failed.', code: 'DB_ERROR' };
}

export async function createCohortDal(db: SupabaseClient, input: { name: string; code?: string; description?: string }, actorId: string): Promise<DbResult<{ id: string }>> {
  try {
    const { data, error } = await db.from('beta_cohorts').insert({ name: input.name, code: input.code ?? null, description: input.description ?? null, created_by: actorId }).select('id').single();
    if (error) return fail(error);
    return { ok: true, data: { id: (data as { id: string }).id } };
  } catch (e) { return fail(e); }
}

export async function archiveCohortDal(db: SupabaseClient, id: string): Promise<DbResult<{ id: string }>> {
  try {
    const { error } = await db.from('beta_cohorts').update({ status: 'archived', updated_at: new Date().toISOString() }).eq('id', id);
    if (error) return fail(error);
    return { ok: true, data: { id } };
  } catch (e) { return fail(e); }
}

export async function assignUserToCohortDal(db: SupabaseClient, input: { cohortId: string; userId: string }, actorId: string): Promise<DbResult<{ ok: true }>> {
  try {
    const { error } = await db.from('beta_cohort_members').upsert({ cohort_id: input.cohortId, user_id: input.userId, status: 'active', added_by: actorId }, { onConflict: 'cohort_id,user_id' });
    if (error) return fail(error);
    return { ok: true, data: { ok: true } };
  } catch (e) { return fail(e); }
}

export async function sendInviteDal(db: SupabaseClient, input: { email: string; role?: string; cohortId?: string }, actorId: string): Promise<DbResult<{ id: string }>> {
  try {
    const expires = new Date(Date.now() + 14 * 86_400_000).toISOString();
    const { data, error } = await db.from('beta_invites').insert({ email: input.email, role: input.role ?? 'viewer', cohort_id: input.cohortId ?? null, invited_by: actorId, expires_at: expires }).select('id').single();
    if (error) return fail(error);
    const id = (data as { id: string }).id;
    await db.from('beta_invite_events').insert({ invite_id: id, event: 'sent', actor_id: actorId }).then(() => undefined, () => undefined);
    return { ok: true, data: { id } };
  } catch (e) { return fail(e); }
}

export async function resendInviteDal(db: SupabaseClient, id: string, actorId: string): Promise<DbResult<{ id: string }>> {
  try {
    const { error } = await db.from('beta_invites').update({ sent_at: new Date().toISOString(), status: 'pending' }).eq('id', id);
    if (error) return fail(error);
    await db.from('beta_invite_events').insert({ invite_id: id, event: 'resent', actor_id: actorId }).then(() => undefined, () => undefined);
    return { ok: true, data: { id } };
  } catch (e) { return fail(e); }
}

export async function revokeInviteDal(db: SupabaseClient, id: string, actorId: string): Promise<DbResult<{ id: string }>> {
  try {
    const { error } = await db.from('beta_invites').update({ status: 'revoked' }).eq('id', id);
    if (error) return fail(error);
    await db.from('beta_invite_events').insert({ invite_id: id, event: 'revoked', actor_id: actorId }).then(() => undefined, () => undefined);
    return { ok: true, data: { id } };
  } catch (e) { return fail(e); }
}

export async function submitFeedbackDal(db: SupabaseClient, input: { category: string; title: string; body?: string }, userId: string): Promise<DbResult<{ id: string }>> {
  try {
    const { data, error } = await db.from('beta_feedback').insert({ user_id: userId, category: input.category, title: input.title, body: input.body ?? null }).select('id').single();
    if (error) return fail(error);
    return { ok: true, data: { id: (data as { id: string }).id } };
  } catch (e) { return fail(e); }
}

export async function setFeedbackStatusDal(db: SupabaseClient, id: string, status: string): Promise<DbResult<{ id: string }>> {
  try {
    const { error } = await db.from('beta_feedback').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) return fail(error);
    return { ok: true, data: { id } };
  } catch (e) { return fail(e); }
}
