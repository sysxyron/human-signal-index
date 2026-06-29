'use server';

// =============================================================================
// HSI Phase 36 — tenant operations DAL: org context helpers, self-service org
// creation, invitations, and org-scoped leaderboard / analytics / health.
//
// Provisioning that must bypass RLS (creating an org + the creator's first
// membership; accepting an invite into a new org) uses the SERVER-ONLY service
// role (same pattern as Phase-24B IAM) — never client code. Org membership is
// org-scoped and NEVER writes public.user_roles. All mutations audited.
// =============================================================================

import { createClient, getUser } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/admin/guard';
import { toUserMessage } from '@/lib/errors/domain-error';
import { logError } from '@/lib/errors/format-error';
import { validateOrgName } from '@/lib/validation/name';
import { requireOrganization, type OrgResult } from './organizations';
import { canAcceptInvite, INVITE_TTL_MS } from './invitations';
import type { MembershipRole } from './membership';

// ---- context helpers (B) ---------------------------------------------------
export async function getCurrentOrganization(): Promise<{ id: string; slug: string; name: string } | null> {
  const ctx = await requireOrganization();
  return ctx.ok ? { id: ctx.data.org.id, slug: ctx.data.org.slug, name: ctx.data.org.name } : null;
}
export async function getCurrentOrganizationId(): Promise<string | null> {
  return (await getCurrentOrganization())?.id ?? null;
}

function configured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  return url.trim().length > 0 && key.trim().length > 0 && !/127\.0\.0\.1:54321|anon-placeholder/.test(`${url}${key}`);
}
function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || `org-${Date.now()}`;
}

// ---- self-service creation (E) — service role (server-only) -----------------
export async function createOrganizationAction(input: { name: string; description?: string }): Promise<OrgResult<{ id: string; slug: string }>> {
  if (!configured()) return { ok: false, code: 'NOT_CONFIGURED' };
  // Centralized name validation — rejects HTML/script/XSS payloads with a friendly
  // message instead of storing them (security hotfix). Never mutates silently.
  const nameCheck = validateOrgName(input.name);
  if (!nameCheck.ok) {
    logError('org/createOrganization', `rejected organization name (reason=${nameCheck.reason})`);
    return { ok: false, code: 'DB_ERROR', error: nameCheck.message };
  }
  const cleanName = nameCheck.value;
  try {
    const user = await getUser();
    if (!user) return { ok: false, code: 'AUTH_REQUIRED' };
    const svc = await getServiceClient();
    if (!svc) return { ok: false, code: 'NOT_CONFIGURED', error: 'Organization creation requires the server service-role key.' };
    let slug = slugify(cleanName);
    // ensure unique slug
    const { data: existing } = await svc.from('organizations').select('id').eq('slug', slug).maybeSingle();
    if (existing) slug = `${slug}-${Math.floor(Date.now() % 100000)}`;
    const { data: org, error } = await svc.from('organizations').insert({ name: cleanName, slug, description: input.description ?? null, status: 'active' }).select('id, slug').single();
    if (error || !org) { if (error) logError('org/createOrganization', error); return { ok: false, code: 'DB_ERROR', error: error ? toUserMessage(error) : 'Could not create the organization.' }; }
    const orgId = String((org as { id: string }).id);
    await svc.from('organization_members').insert({ organization_id: orgId, user_id: user.id, membership_role: 'owner' });
    await svc.from('organization_audit_log').insert({ organization_id: orgId, actor: user.id, action: 'organization_created', metadata: { slug } });
    return { ok: true, data: { id: orgId, slug: String((org as { slug: string }).slug) } };
  } catch { return { ok: false, code: 'DB_ERROR' }; }
}

// ---- invitations (F) -------------------------------------------------------
export async function createInvitationAction(orgId: string, email: string, role: MembershipRole): Promise<OrgResult<{ token: string }>> {
  if (!configured()) return { ok: false, code: 'NOT_CONFIGURED' };
  if (!email.includes('@')) return { ok: false, code: 'DB_ERROR', error: 'A valid email is required.' };
  try {
    const user = await getUser();
    if (!user) return { ok: false, code: 'AUTH_REQUIRED' };
    const db = createClient(); // org-admin RLS permits insert into organization_invitations
    const token = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/-/g, '');
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
    const { error } = await db.from('organization_invitations').insert({ organization_id: orgId, email: email.trim().toLowerCase(), membership_role: role, token, invited_by: user.id, expires_at: expiresAt });
    if (error) {
      logError('org/createInvitation', error);
      // RLS rejection → FORBIDDEN; all messages mapped (never the raw SQL/RLS text).
      const isRls = (error.message ?? '').includes('row-level security');
      return { ok: false, code: isRls ? 'FORBIDDEN' : 'DB_ERROR', error: isRls ? 'You do not have permission to invite members to this organization.' : toUserMessage(error) };
    }
    await db.from('organization_audit_log').insert({ organization_id: orgId, actor: user.id, action: 'invitation_created', metadata: { email, role } });
    return { ok: true, data: { token } };
  } catch { return { ok: false, code: 'DB_ERROR' }; }
}

export interface InvitePreview { organizationName: string; role: string; email: string; state: 'valid' | 'expired' | 'accepted' | 'not_found' }
export async function getInvitationAction(token: string): Promise<OrgResult<InvitePreview>> {
  if (!configured()) return { ok: true, demo: true, data: { organizationName: 'Demo Org', role: 'contributor', email: 'you@example.com', state: 'valid' } };
  try {
    const user = await getUser();
    const svc = await getServiceClient();
    if (!svc) return { ok: false, code: 'NOT_CONFIGURED' };
    const { data } = await svc.from('organization_invitations').select('email, membership_role, expires_at, accepted_at, organizations(name)').eq('token', token).maybeSingle();
    const inv = data as { email: string; membership_role: string; expires_at: string; accepted_at: string | null; organizations?: { name?: string } | { name?: string }[] } | null;
    const now = Date.now();
    const state = !inv ? 'not_found' : inv.accepted_at ? 'accepted' : (Date.parse(inv.expires_at) <= now ? 'expired' : 'valid');
    const rel = inv?.organizations; const orgName = Array.isArray(rel) ? rel[0]?.name : rel?.name;
    return { ok: true, data: { organizationName: orgName ?? 'Organization', role: inv?.membership_role ?? 'contributor', email: inv?.email ?? '', state } };
  } catch { return { ok: false, code: 'DB_ERROR' }; }
}

export async function acceptInvitationAction(token: string): Promise<OrgResult<{ organizationId: string }>> {
  if (!configured()) return { ok: false, code: 'NOT_CONFIGURED' };
  try {
    const user = await getUser();
    if (!user) return { ok: false, code: 'AUTH_REQUIRED' };
    const svc = await getServiceClient();
    if (!svc) return { ok: false, code: 'NOT_CONFIGURED', error: 'Invitation acceptance requires the server service-role key.' };
    const { data } = await svc.from('organization_invitations').select('id, organization_id, email, membership_role, expires_at, accepted_at').eq('token', token).maybeSingle();
    const inv = data as { id: string; organization_id: string; email: string; membership_role: MembershipRole; expires_at: string; accepted_at: string | null } | null;
    if (!canAcceptInvite(inv ? { email: inv.email, expiresAt: inv.expires_at, acceptedAt: inv.accepted_at } : null, user.email ?? null, Date.now())) {
      return { ok: false, code: 'FORBIDDEN', error: 'This invitation is invalid, expired, already used, or for a different email.' };
    }
    const orgId = inv!.organization_id;
    await svc.from('organization_members').upsert({ organization_id: orgId, user_id: user.id, membership_role: inv!.membership_role }, { onConflict: 'organization_id,user_id' });
    await svc.from('organization_invitations').update({ accepted_at: new Date().toISOString(), accepted_by: user.id }).eq('id', inv!.id);
    await svc.from('organization_audit_log').insert({ organization_id: orgId, actor: user.id, action: 'invitation_accepted', target_user: user.id, metadata: { role: inv!.membership_role } });
    return { ok: true, data: { organizationId: orgId } };
  } catch { return { ok: false, code: 'DB_ERROR' }; }
}

// ---- org leaderboard (D) ---------------------------------------------------
export interface OrgLeaderRow { id: string; score: number; secondary: number }
export async function getOrgLeaderboardAction(view: string): Promise<OrgResult<{ view: string; rows: OrgLeaderRow[] }>> {
  const ctx = await requireOrganization();
  if (!ctx.ok) return ctx;
  const v = ['contributors', 'reviewers', 'researchers', 'authorities', 'impact'].includes(view) ? view : 'contributors';
  if (ctx.demo) return { ok: true, demo: true, data: { view: v, rows: [{ id: 'u1', score: 86, secondary: 12 }, { id: 'u2', score: 74, secondary: 9 }] } };
  try {
    const db = createClient();
    const orgId = ctx.data.org.id;
    if (v === 'authorities') {
      const { data } = await db.from('trust_profiles').select('user_id, authority_score, trust_score').eq('organization_id', orgId).order('authority_score', { ascending: false }).limit(50);
      return { ok: true, data: { view: v, rows: ((data ?? []) as Array<Record<string, number>>).map((r) => ({ id: String(r.user_id), score: Number(r.authority_score ?? 0), secondary: Number(r.trust_score ?? 0) })) } };
    }
    if (v === 'impact') {
      const { data } = await db.from('entity_impact').select('entity_id, impact_score, outcomes_count').eq('entity_kind', 'contributor').order('impact_score', { ascending: false }).limit(50);
      return { ok: true, data: { view: v, rows: ((data ?? []) as Array<Record<string, number>>).map((r) => ({ id: String(r.entity_id), score: Number(r.impact_score ?? 0), secondary: Number(r.outcomes_count ?? 0) })) } };
    }
    const { data } = await db.from('user_contribution_stats').select('user_id, xp, reviews_completed, signals_accepted').eq('organization_id', orgId).order('xp', { ascending: false }).limit(50);
    const rows = ((data ?? []) as Array<Record<string, number>>).map((r) => ({ id: String(r.user_id), score: Number(r.xp ?? 0), secondary: v === 'reviewers' ? Number(r.reviews_completed ?? 0) : Number(r.signals_accepted ?? 0) }));
    return { ok: true, data: { view: v, rows } };
  } catch { return { ok: false, code: 'DB_ERROR' }; }
}

// ---- org analytics (H) + health (I) ----------------------------------------
export interface OrgAnalytics { members: number; investigations: number; publications: number; avgTrust: number; avgAuthority: number; outcomes: number }
export async function getOrgAnalyticsAction(): Promise<OrgResult<OrgAnalytics>> {
  const ctx = await requireOrganization();
  if (!ctx.ok) return ctx;
  if (ctx.demo) return { ok: true, demo: true, data: { members: 24, investigations: 12, publications: 6, avgTrust: 74, avgAuthority: 71, outcomes: 18 } };
  try {
    const db = createClient(); const orgId = ctx.data.org.id;
    const count = async (t: string): Promise<number> => { try { const { count: c } = await db.from(t).select('*', { count: 'exact', head: true }).eq('organization_id', orgId); return c ?? 0; } catch { return 0; } };
    const [members, investigations, publications, outcomes] = await Promise.all([count('organization_members'), count('investigations'), count('hsin_publications'), count('outcome_events')]);
    let avgTrust = 0; let avgAuthority = 0;
    try { const { data } = await db.from('trust_profiles').select('trust_score, authority_score').eq('organization_id', orgId); const rows = (data ?? []) as Array<{ trust_score: number; authority_score: number }>; if (rows.length) { avgTrust = Math.round(rows.reduce((s, r) => s + Number(r.trust_score ?? 0), 0) / rows.length); avgAuthority = Math.round(rows.reduce((s, r) => s + Number(r.authority_score ?? 0), 0) / rows.length); } } catch { /* */ }
    return { ok: true, data: { members, investigations, publications, avgTrust, avgAuthority, outcomes } };
  } catch { return { ok: false, code: 'DB_ERROR' }; }
}

export interface OrgHealth { activeContributors: number; reviewThroughput: number; publicationThroughput: number; governanceActivity: number; workerFreshnessMins: number | null }
export async function getOrgHealthAction(): Promise<OrgResult<OrgHealth>> {
  const ctx = await requireOrganization();
  if (!ctx.ok) return ctx;
  if (ctx.demo) return { ok: true, demo: true, data: { activeContributors: 18, reviewThroughput: 42, publicationThroughput: 6, governanceActivity: 9, workerFreshnessMins: 15 } };
  try {
    const db = createClient(); const orgId = ctx.data.org.id;
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const countSince = async (t: string, col = 'created_at'): Promise<number> => { try { const { count: c } = await db.from(t).select('*', { count: 'exact', head: true }).eq('organization_id', orgId).gte(col, since); return c ?? 0; } catch { return 0; } };
    const [reviewThroughput, governanceActivity] = await Promise.all([countSince('contribution_events'), countSince('outcome_events')]);
    let activeContributors = 0; let publicationThroughput = 0; let freshness: number | null = null;
    try { const { count } = await db.from('user_contribution_stats').select('*', { count: 'exact', head: true }).eq('organization_id', orgId); activeContributors = count ?? 0; } catch { /* */ }
    try { const { count } = await db.from('hsin_publications').select('*', { count: 'exact', head: true }).eq('organization_id', orgId); publicationThroughput = count ?? 0; } catch { /* */ }
    try { const { data } = await db.from('trust_profiles').select('computed_at').eq('organization_id', orgId).order('computed_at', { ascending: false }).limit(1).maybeSingle(); const at = (data as { computed_at?: string } | null)?.computed_at; if (at) freshness = Math.round((Date.now() - Date.parse(at)) / 60000); } catch { /* */ }
    return { ok: true, data: { activeContributors, reviewThroughput, publicationThroughput, governanceActivity, workerFreshnessMins: freshness } };
  } catch { return { ok: false, code: 'DB_ERROR' }; }
}
