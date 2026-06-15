'use server';

// =============================================================================
// HSI Phase 35 — organization DAL. Org-scoped reads via RLS (members see their
// orgs; platform admins see all). Member management is gated by ORG membership
// role (owner/administrator) OR platform admin — never by global RBAC, and never
// touching user_roles. Every mutation is audited to organization_audit_log
// (append-only). No service-role key in app code. Offline → demo.
// =============================================================================

import { cookies } from 'next/headers';
import { createClient, getUser } from '@/lib/supabase/server';
import { loadHighestRole } from '@/lib/auth/get-session-role';
import { hasRole } from '@/lib/security/rbac-audit';
import { canManageMembers, canRemoveMember, highestMembership, type MembershipRole } from './membership';

const ORG_COOKIE = 'hsi_org';
const DEFAULT_ORG = { id: '00000000-0000-0000-0000-000000000001', slug: 'default', name: 'Human Signal Index' };

export interface Organization { id: string; slug: string; name: string; description: string | null; logoUrl: string | null; status: string }
export interface OrgMember { userId: string; email: string | null; membershipRole: MembershipRole; joinedAt: string }
export type OrgResult<T> = { ok: true; data: T; demo?: boolean } | { ok: false; code: 'AUTH_REQUIRED' | 'FORBIDDEN' | 'NOT_CONFIGURED' | 'DB_ERROR'; error?: string };

function configured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  return url.trim().length > 0 && key.trim().length > 0 && !/127\.0\.0\.1:54321|anon-placeholder/.test(`${url}${key}`);
}
function mapOrg(r: Record<string, unknown>): Organization {
  return { id: String(r.id), slug: String(r.slug), name: String(r.name), description: (r.description as string) ?? null, logoUrl: (r.logo_url as string) ?? null, status: String(r.status ?? 'active') };
}
async function isPlatformAdmin(db: ReturnType<typeof createClient>, userId: string): Promise<boolean> {
  return hasRole((await loadHighestRole(db, userId)) ?? undefined, 'admin');
}
async function auditOrg(db: ReturnType<typeof createClient>, orgId: string, actor: string, action: string, targetUser: string | null, metadata?: Record<string, unknown>): Promise<void> {
  try { await db.from('organization_audit_log').insert({ organization_id: orgId, actor, action, target_user: targetUser, metadata: metadata ?? {} }); } catch { /* best-effort */ }
}

/** The orgs the signed-in user belongs to (+ their membership role). */
export async function getUserOrganizations(): Promise<OrgResult<Array<Organization & { membershipRole: MembershipRole }>>> {
  if (!configured()) return { ok: true, demo: true, data: [{ ...DEFAULT_ORG, description: 'Default platform organization.', logoUrl: null, status: 'active', membershipRole: 'administrator' }] };
  try {
    const user = await getUser();
    if (!user) return { ok: false, code: 'AUTH_REQUIRED' };
    const db = createClient();
    const { data, error } = await db.from('organization_members').select('membership_role, organizations(*)').eq('user_id', user.id);
    if (error) return { ok: false, code: 'DB_ERROR', error: error.message };
    const orgs = ((data ?? []) as Array<Record<string, unknown>>).map((r) => {
      const rel = r.organizations as Record<string, unknown> | Record<string, unknown>[] | null;
      const o = Array.isArray(rel) ? rel[0] : rel;
      return o ? { ...mapOrg(o), membershipRole: r.membership_role as MembershipRole } : null;
    }).filter((x): x is Organization & { membershipRole: MembershipRole } => x !== null);
    return { ok: true, data: orgs };
  } catch { return { ok: false, code: 'DB_ERROR' }; }
}

export async function getOrganization(id: string): Promise<OrgResult<Organization>> {
  if (!configured()) return { ok: true, demo: true, data: { ...DEFAULT_ORG, description: null, logoUrl: null, status: 'active' } };
  try {
    const db = createClient();
    const { data, error } = await db.from('organizations').select('*').eq('id', id).maybeSingle();
    if (error || !data) return { ok: false, code: 'DB_ERROR', error: error?.message };
    return { ok: true, data: mapOrg(data as Record<string, unknown>) };
  } catch { return { ok: false, code: 'DB_ERROR' }; }
}

export async function getOrganizationBySlug(slug: string): Promise<OrgResult<Organization>> {
  if (!configured()) return { ok: true, demo: true, data: { ...DEFAULT_ORG, description: null, logoUrl: null, status: 'active' } };
  try {
    const db = createClient();
    const { data, error } = await db.from('organizations').select('*').eq('slug', slug).maybeSingle();
    if (error || !data) return { ok: false, code: 'DB_ERROR', error: error?.message };
    return { ok: true, data: mapOrg(data as Record<string, unknown>) };
  } catch { return { ok: false, code: 'DB_ERROR' }; }
}

export async function getOrganizationMembers(orgId: string): Promise<OrgResult<OrgMember[]>> {
  if (!configured()) return { ok: true, demo: true, data: [{ userId: 'u1', email: 'owner@example.com', membershipRole: 'owner', joinedAt: '2026-06-01T00:00:00Z' }] };
  try {
    const db = createClient();
    const { data, error } = await db.from('organization_members').select('user_id, membership_role, joined_at, users(email)').eq('organization_id', orgId).order('joined_at');
    if (error) return { ok: false, code: 'DB_ERROR', error: error.message };
    return { ok: true, data: ((data ?? []) as Array<Record<string, unknown>>).map((r) => {
      const rel = r.users as { email?: string } | { email?: string }[] | null;
      const email = Array.isArray(rel) ? rel[0]?.email ?? null : rel?.email ?? null;
      return { userId: String(r.user_id), email, membershipRole: r.membership_role as MembershipRole, joinedAt: String(r.joined_at) };
    }) };
  } catch { return { ok: false, code: 'DB_ERROR' }; }
}

/** Resolve the caller's CURRENT organization (cookie → validated membership → first). */
export async function requireOrganization(): Promise<OrgResult<{ org: Organization; membershipRole: MembershipRole; platformAdmin: boolean }>> {
  if (!configured()) return { ok: true, demo: true, data: { org: { ...DEFAULT_ORG, description: null, logoUrl: null, status: 'active' }, membershipRole: 'administrator', platformAdmin: true } };
  try {
    const user = await getUser();
    if (!user) return { ok: false, code: 'AUTH_REQUIRED' };
    const db = createClient();
    const platformAdmin = await isPlatformAdmin(db, user.id);
    const mineRes = await getUserOrganizations();
    const mine = mineRes.ok ? mineRes.data : [];
    if (mine.length === 0) {
      // Not a member of any org yet → default org (read-only context).
      const def = await getOrganization(DEFAULT_ORG.id);
      if (!def.ok) return def;
      return { ok: true, data: { org: def.data, membershipRole: 'contributor', platformAdmin } };
    }
    const wanted = cookies().get(ORG_COOKIE)?.value;
    const chosen = (wanted && mine.find((o) => o.slug === wanted)) || mine[0];
    return { ok: true, data: { org: { id: chosen.id, slug: chosen.slug, name: chosen.name, description: chosen.description, logoUrl: chosen.logoUrl, status: chosen.status }, membershipRole: chosen.membershipRole, platformAdmin } };
  } catch { return { ok: false, code: 'DB_ERROR' }; }
}

/** Persist the selected organization (workspace switcher). */
export async function setCurrentOrganizationAction(slug: string): Promise<OrgResult<{ slug: string }>> {
  try {
    cookies().set(ORG_COOKIE, slug, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 });
    return { ok: true, data: { slug } };
  } catch { return { ok: false, code: 'DB_ERROR' }; }
}

// ---- member management (org-admin or platform admin; audited) ---------------
async function requireOrgManage(orgId: string): Promise<{ ok: true; db: ReturnType<typeof createClient>; userId: string } | { ok: false; code: 'AUTH_REQUIRED' | 'FORBIDDEN' | 'NOT_CONFIGURED' }> {
  if (!configured()) return { ok: false, code: 'NOT_CONFIGURED' };
  const user = await getUser();
  if (!user) return { ok: false, code: 'AUTH_REQUIRED' };
  const db = createClient();
  if (await isPlatformAdmin(db, user.id)) return { ok: true, db, userId: user.id };
  const { data } = await db.from('organization_members').select('membership_role').eq('organization_id', orgId).eq('user_id', user.id);
  const role = highestMembership(((data ?? []) as Array<{ membership_role: string }>).map((r) => r.membership_role));
  if (!canManageMembers(role)) return { ok: false, code: 'FORBIDDEN' };
  return { ok: true, db, userId: user.id };
}

export async function inviteMemberAction(orgId: string, email: string, membershipRole: MembershipRole): Promise<OrgResult<{ userId: string }>> {
  const gate = await requireOrgManage(orgId);
  if (!gate.ok) return gate;
  try {
    const { data: u } = await gate.db.from('users').select('id').eq('email', email).maybeSingle();
    if (!u) return { ok: false, code: 'DB_ERROR', error: 'No account with that email. The user must sign up first.' };
    const uid = String((u as { id: string }).id);
    const { error } = await gate.db.from('organization_members').upsert({ organization_id: orgId, user_id: uid, membership_role: membershipRole }, { onConflict: 'organization_id,user_id' });
    if (error) return { ok: false, code: 'DB_ERROR', error: error.message };
    await auditOrg(gate.db, orgId, gate.userId, 'member_invited', uid, { membershipRole });
    return { ok: true, data: { userId: uid } };
  } catch { return { ok: false, code: 'DB_ERROR' }; }
}

export async function changeMemberRoleAction(orgId: string, userId: string, membershipRole: MembershipRole): Promise<OrgResult<{ userId: string }>> {
  const gate = await requireOrgManage(orgId);
  if (!gate.ok) return gate;
  try {
    const { error } = await gate.db.from('organization_members').update({ membership_role: membershipRole }).eq('organization_id', orgId).eq('user_id', userId);
    if (error) return { ok: false, code: 'DB_ERROR', error: error.message };
    await auditOrg(gate.db, orgId, gate.userId, 'member_role_changed', userId, { membershipRole });
    return { ok: true, data: { userId } };
  } catch { return { ok: false, code: 'DB_ERROR' }; }
}

export async function removeMemberAction(orgId: string, userId: string): Promise<OrgResult<{ userId: string }>> {
  const gate = await requireOrgManage(orgId);
  if (!gate.ok) return gate;
  try {
    const { data: members } = await gate.db.from('organization_members').select('user_id, membership_role').eq('organization_id', orgId);
    const rows = (members ?? []) as Array<{ user_id: string; membership_role: string }>;
    const target = rows.find((r) => r.user_id === userId);
    if (!target) return { ok: false, code: 'DB_ERROR', error: 'Not a member.' };
    const ownerCount = rows.filter((r) => r.membership_role === 'owner').length;
    if (!canRemoveMember(target.membership_role, ownerCount)) return { ok: false, code: 'FORBIDDEN', error: 'Cannot remove the only owner.' };
    const { error } = await gate.db.from('organization_members').delete().eq('organization_id', orgId).eq('user_id', userId);
    if (error) return { ok: false, code: 'DB_ERROR', error: error.message };
    await auditOrg(gate.db, orgId, gate.userId, 'member_removed', userId);
    return { ok: true, data: { userId } };
  } catch { return { ok: false, code: 'DB_ERROR' }; }
}

// ---- org dashboard (E) -----------------------------------------------------
export interface OrgDashboard { org: Organization; members: number; contributors: number; investigations: number; publications: number; avgTrust: number; membershipRole: MembershipRole; platformAdmin: boolean }
export async function getOrgDashboardAction(): Promise<OrgResult<OrgDashboard>> {
  const ctx = await requireOrganization();
  if (!ctx.ok) return ctx;
  if (ctx.demo) return { ok: true, demo: true, data: { org: ctx.data.org, members: 24, contributors: 18, investigations: 12, publications: 6, avgTrust: 74, membershipRole: ctx.data.membershipRole, platformAdmin: ctx.data.platformAdmin } };
  try {
    const db = createClient();
    const orgId = ctx.data.org.id;
    const count = async (table: string): Promise<number> => { try { const { count: c } = await db.from(table).select('*', { count: 'exact', head: true }).eq('organization_id', orgId); return c ?? 0; } catch { return 0; } };
    const [members, investigations, publications] = await Promise.all([count('organization_members'), count('investigations'), count('hsin_publications')]);
    let avgTrust = 0;
    try { const { data } = await db.from('trust_profiles').select('trust_score').eq('organization_id', orgId); const rows = (data ?? []) as Array<{ trust_score: number }>; avgTrust = rows.length ? Math.round(rows.reduce((s, r) => s + Number(r.trust_score ?? 0), 0) / rows.length) : 0; } catch { /* */ }
    return { ok: true, data: { org: ctx.data.org, members, contributors: members, investigations, publications, avgTrust, membershipRole: ctx.data.membershipRole, platformAdmin: ctx.data.platformAdmin } };
  } catch { return { ok: false, code: 'DB_ERROR' }; }
}

// ---- platform admin oversight (J) ------------------------------------------
export interface OrgOversightRow { id: string; slug: string; name: string; status: string; members: number; publications: number }
export async function listOrganizationsAction(): Promise<OrgResult<OrgOversightRow[]>> {
  if (!configured()) return { ok: true, demo: true, data: [{ id: DEFAULT_ORG.id, slug: 'default', name: 'Human Signal Index', status: 'active', members: 24, publications: 6 }] };
  try {
    const user = await getUser();
    if (!user) return { ok: false, code: 'AUTH_REQUIRED' };
    const db = createClient();
    if (!(await isPlatformAdmin(db, user.id))) return { ok: false, code: 'FORBIDDEN' };
    const { data, error } = await db.from('organizations').select('*').order('created_at');
    if (error) return { ok: false, code: 'DB_ERROR', error: error.message };
    const rows: OrgOversightRow[] = [];
    for (const o of (data ?? []) as Array<Record<string, unknown>>) {
      const org = mapOrg(o);
      const memberCount = await db.from('organization_members').select('*', { count: 'exact', head: true }).eq('organization_id', org.id);
      const pubCount = await db.from('hsin_publications').select('*', { count: 'exact', head: true }).eq('organization_id', org.id);
      rows.push({ id: org.id, slug: org.slug, name: org.name, status: org.status, members: memberCount.count ?? 0, publications: pubCount.count ?? 0 });
    }
    return { ok: true, data: rows };
  } catch { return { ok: false, code: 'DB_ERROR' }; }
}
