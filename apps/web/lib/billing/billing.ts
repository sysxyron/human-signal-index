'use server';

// =============================================================================
// HSI Phase 37 — billing / entitlements DAL (NO payments). Resolves a plan's
// entitlements (DB rows + @hsi/entitlements defaults), exposes feature gates per
// organization, and manages org settings / branding (org-admin) + plan catalog
// (platform admin). Every mutation audited (subscription_audit_log, append-only).
// Org-isolated; no service-role in app; no RBAC/auth/user_roles changes.
// =============================================================================

import {
  defaultEntitlements, hasFeature, getLimit, requireFeature, PLAN_DEFS, planDef,
  type Entitlement, type FeatureKey, type PlanSlug, type FeatureCheck,
} from '@hsi/entitlements';
import { createClient, getUser } from '@/lib/supabase/server';
import { requireAdmin, supabaseConfigured, notConfigured, adminFail, type DbResult } from '@/lib/admin/guard';
import { requireOrganization } from '@/lib/org/organizations';

type Db = ReturnType<typeof createClient>;

function configured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  return url.trim().length > 0 && key.trim().length > 0 && !/127\.0\.0\.1:54321|anon-placeholder/.test(`${url}${key}`);
}
async function auditSub(db: Db, orgId: string | null, actor: string, action: string, previous: unknown, next: unknown): Promise<void> {
  try { await db.from('subscription_audit_log').insert({ organization_id: orgId, actor, action, previous_value: previous ?? null, new_value: next ?? null }); } catch { /* best-effort */ }
}

/** Resolve a plan's entitlements: DB rows merged over engine defaults. */
async function resolveEntitlements(db: Db, planId: string | null, slug: PlanSlug): Promise<Entitlement[]> {
  const base = defaultEntitlements(slug);
  if (!planId) return base;
  try {
    const { data } = await db.from('feature_entitlements').select('feature_key, enabled, limit_value').eq('plan_id', planId);
    const rows = (data ?? []) as Array<{ feature_key: string; enabled: boolean; limit_value: number | null }>;
    if (rows.length === 0) return base;
    const map = new Map(base.map((e) => [e.featureKey, e]));
    for (const r of rows) map.set(r.feature_key as FeatureKey, { featureKey: r.feature_key as FeatureKey, enabled: r.enabled, limitValue: r.limit_value });
    return [...map.values()];
  } catch { return base; }
}

export interface OrgBilling {
  planSlug: PlanSlug; planName: string; status: string;
  entitlements: Entitlement[];
  usage: { investigations: number; publications: number; contributors: number; evidenceItems: number; storageBytes: number; workerExecutions: number };
}

/** Current org's plan + status + entitlements + usage (Deliverable G). */
export async function getOrgBillingAction(): Promise<DbResult<OrgBilling> & { demo?: boolean }> {
  const ctx = await requireOrganization();
  if (!ctx.ok) return { ok: false, error: ctx.error ?? 'Organization unavailable.', code: ctx.code };
  if (ctx.demo) return { ok: true, demo: true, data: { planSlug: 'community', planName: 'Community', status: 'active', entitlements: defaultEntitlements('community'), usage: { investigations: 12, publications: 6, contributors: 24, evidenceItems: 88, storageBytes: 4096000, workerExecutions: 320 } } };
  try {
    const db = createClient(); const orgId = ctx.data.org.id;
    const { data: sub } = await db.from('organization_subscriptions').select('status, plans(id, slug, name)').eq('organization_id', orgId).maybeSingle();
    const rel = (sub as { plans?: { id?: string; slug?: string; name?: string } | { id?: string; slug?: string; name?: string }[] } | null)?.plans;
    const plan = Array.isArray(rel) ? rel[0] : rel;
    const slug = (plan?.slug as PlanSlug) ?? 'community';
    const entitlements = await resolveEntitlements(db, plan?.id ?? null, slug);
    const { data: u } = await db.from('organization_usage').select('*').eq('organization_id', orgId).maybeSingle();
    const usage = (u ?? {}) as Record<string, number>;
    return { ok: true, data: {
      planSlug: slug, planName: plan?.name ?? planDef(slug)?.name ?? 'Community', status: (sub as { status?: string } | null)?.status ?? 'active',
      entitlements,
      usage: { investigations: Number(usage.investigations_created ?? 0), publications: Number(usage.publications_created ?? 0), contributors: Number(usage.contributors ?? 0), evidenceItems: Number(usage.evidence_items ?? 0), storageBytes: Number(usage.storage_usage_bytes ?? 0), workerExecutions: Number(usage.worker_executions ?? 0) },
    } };
  } catch { return { ok: false, error: 'Billing unavailable.', code: 'DB_ERROR' }; }
}

// ---- usage tracking (Deliverable D) — framework DAL helper -----------------
const USAGE_COLUMNS = ['investigations_created', 'publications_created', 'contributors', 'evidence_items', 'storage_usage_bytes', 'worker_executions'] as const;
export type UsageColumn = (typeof USAGE_COLUMNS)[number];

/**
 * Set absolute usage counters for the current org (additive framework; not wired
 * into create paths yet, so it never blocks Community defaults). Upserts a single
 * organization_usage row. Org-isolated (RLS), no audit (operational counters).
 */
export async function recordOrgUsageAction(values: Partial<Record<UsageColumn, number>>): Promise<DbResult<{ ok: true }>> {
  if (!configured()) return notConfigured();
  const ctx = await requireOrganization();
  if (!ctx.ok) return { ok: false, error: 'No organization.', code: 'DB_ERROR' };
  try {
    const db = createClient(); const orgId = ctx.data.org.id;
    const row: Record<string, unknown> = { organization_id: orgId };
    for (const k of USAGE_COLUMNS) if (typeof values[k] === 'number') row[k] = Math.max(0, Math.floor(values[k] as number));
    const { error } = await db.from('organization_usage').upsert(row, { onConflict: 'organization_id' });
    if (error) return adminFail(error);
    return { ok: true, data: { ok: true } };
  } catch (e) { return adminFail(e); }
}

// ---- feature gates per organization (Deliverable E/F) — framework -----------
async function currentOrgEntitlements(): Promise<Entitlement[]> {
  const b = await getOrgBillingAction();
  return b.ok ? b.data.entitlements : defaultEntitlements('community');
}
export async function hasFeatureForOrg(key: FeatureKey): Promise<boolean> { return hasFeature(await currentOrgEntitlements(), key); }
export async function getLimitForOrg(key: FeatureKey): Promise<number | null> { return getLimit(await currentOrgEntitlements(), key); }
export async function requireFeatureForOrg(key: FeatureKey): Promise<FeatureCheck> { return requireFeature(await currentOrgEntitlements(), key); }

// ---- org settings (Deliverable H) — org-admin, audited ---------------------
export interface OrgSettings { name: string; description: string; logoUrl: string; contactEmail: string; website: string; supportEmail: string }
export async function getOrgSettingsAction(): Promise<DbResult<OrgSettings & { canManage: boolean }> & { demo?: boolean }> {
  const ctx = await requireOrganization();
  if (!ctx.ok) return { ok: false, error: ctx.error ?? 'Organization unavailable.', code: ctx.code };
  const canManage = ctx.data.membershipRole === 'owner' || ctx.data.membershipRole === 'administrator' || ctx.data.platformAdmin;
  if (ctx.demo) return { ok: true, demo: true, data: { name: ctx.data.org.name, description: 'Default platform organization.', logoUrl: '', contactEmail: 'contact@hsi.example', website: 'https://hsi.example', supportEmail: 'support@hsi.example', canManage } };
  try {
    const db = createClient();
    const { data } = await db.from('organizations').select('name, description, logo_url, contact_email, website, support_email').eq('id', ctx.data.org.id).maybeSingle();
    const r = (data ?? {}) as Record<string, string>;
    return { ok: true, data: { name: r.name ?? ctx.data.org.name, description: r.description ?? '', logoUrl: r.logo_url ?? '', contactEmail: r.contact_email ?? '', website: r.website ?? '', supportEmail: r.support_email ?? '', canManage } };
  } catch { return { ok: false, error: 'Settings unavailable.', code: 'DB_ERROR' }; }
}
export async function saveOrgSettingsAction(input: OrgSettings): Promise<DbResult<{ ok: true }>> {
  if (!configured()) return notConfigured();
  const ctx = await requireOrganization();
  if (!ctx.ok) return { ok: false, error: 'No organization.', code: 'DB_ERROR' };
  const user = await getUser();
  if (!user) return { ok: false, error: 'Sign in.', code: 'AUTH_REQUIRED' };
  if (!(ctx.data.membershipRole === 'owner' || ctx.data.membershipRole === 'administrator' || ctx.data.platformAdmin)) return { ok: false, error: 'Organization admins only.', code: 'FORBIDDEN' };
  try {
    const db = createClient(); const orgId = ctx.data.org.id;
    const { data: prev } = await db.from('organizations').select('name, description, logo_url, contact_email, website, support_email').eq('id', orgId).maybeSingle();
    const row = { name: input.name, description: input.description, logo_url: input.logoUrl, contact_email: input.contactEmail, website: input.website, support_email: input.supportEmail };
    const { error } = await db.from('organizations').update(row).eq('id', orgId);
    if (error) return adminFail(error);
    await auditSub(db, orgId, user.id, 'org_settings_update', prev ?? null, row);
    return { ok: true, data: { ok: true } };
  } catch (e) { return adminFail(e); }
}

// ---- org branding (Deliverable I/L) — org-admin, audited -------------------
export interface OrgBranding { logoUrl: string; primaryColor: string; secondaryColor: string; accentColor: string; faviconUrl: string; footerText: string }
const DEMO_BRANDING: OrgBranding = { logoUrl: '/logo.svg', primaryColor: '#3B82F6', secondaryColor: '#8B5CF6', accentColor: '#10B981', faviconUrl: '/favicon.ico', footerText: '© Human Signal Index' };

export async function getOrgBrandingAction(): Promise<DbResult<OrgBranding & { canManage: boolean }> & { demo?: boolean }> {
  const ctx = await requireOrganization();
  if (!ctx.ok) return { ok: false, error: ctx.error ?? 'Organization unavailable.', code: ctx.code };
  const canManage = ctx.data.membershipRole === 'owner' || ctx.data.membershipRole === 'administrator' || ctx.data.platformAdmin;
  if (ctx.demo) return { ok: true, demo: true, data: { ...DEMO_BRANDING, canManage } };
  try {
    const db = createClient();
    const { data } = await db.from('organization_branding').select('*').eq('organization_id', ctx.data.org.id).maybeSingle();
    const r = (data ?? {}) as Record<string, string>;
    return { ok: true, data: { logoUrl: r.logo_url ?? '', primaryColor: r.primary_color ?? '#3B82F6', secondaryColor: r.secondary_color ?? '#8B5CF6', accentColor: r.accent_color ?? '#10B981', faviconUrl: r.favicon_url ?? '', footerText: r.footer_text ?? '', canManage } };
  } catch { return { ok: false, error: 'Branding unavailable.', code: 'DB_ERROR' }; }
}

export async function saveOrgBrandingAction(input: OrgBranding): Promise<DbResult<{ ok: true }>> {
  if (!configured()) return notConfigured();
  const ctx = await requireOrganization();
  if (!ctx.ok) return { ok: false, error: 'No organization.', code: 'DB_ERROR' };
  const user = await getUser();
  if (!user) return { ok: false, error: 'Sign in.', code: 'AUTH_REQUIRED' };
  if (!(ctx.data.membershipRole === 'owner' || ctx.data.membershipRole === 'administrator' || ctx.data.platformAdmin)) return { ok: false, error: 'Organization admins only.', code: 'FORBIDDEN' };
  try {
    const db = createClient(); const orgId = ctx.data.org.id;
    const { data: prev } = await db.from('organization_branding').select('*').eq('organization_id', orgId).maybeSingle();
    const row = { organization_id: orgId, logo_url: input.logoUrl, primary_color: input.primaryColor, secondary_color: input.secondaryColor, accent_color: input.accentColor, favicon_url: input.faviconUrl, footer_text: input.footerText, updated_by: user.id };
    const { error } = await db.from('organization_branding').upsert(row, { onConflict: 'organization_id' });
    if (error) return adminFail(error);
    await auditSub(db, orgId, user.id, 'org_branding_update', prev ?? null, row);
    return { ok: true, data: { ok: true } };
  } catch (e) { return adminFail(e); }
}

// ---- platform plan management (Deliverable J) — admin only -----------------
export interface PlanRow { id: string; slug: string; name: string; description: string | null; tier: number; active: boolean; entitlements: Entitlement[] }
export async function listPlansAction(): Promise<DbResult<PlanRow[]> & { demo?: boolean }> {
  if (!supabaseConfigured()) return { ok: true, demo: true, data: PLAN_DEFS.map((p) => ({ id: p.slug, slug: p.slug, name: p.name, description: p.description, tier: p.tier, active: true, entitlements: defaultEntitlements(p.slug) })) };
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  try {
    const { data, error } = await gate.ctx.db.from('plans').select('*').order('tier');
    if (error) return adminFail(error);
    const rows: PlanRow[] = [];
    for (const p of (data ?? []) as Array<Record<string, unknown>>) {
      const ents = await resolveEntitlements(gate.ctx.db, String(p.id), String(p.slug) as PlanSlug);
      rows.push({ id: String(p.id), slug: String(p.slug), name: String(p.name), description: (p.description as string) ?? null, tier: Number(p.tier ?? 0), active: Boolean(p.active), entitlements: ents });
    }
    return { ok: true, data: rows };
  } catch (e) { return adminFail(e); }
}

export async function setPlanActiveAction(planId: string, active: boolean): Promise<DbResult<{ id: string }>> {
  if (!supabaseConfigured()) return notConfigured();
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  try {
    const { error } = await gate.ctx.db.from('plans').update({ active }).eq('id', planId);
    if (error) return adminFail(error);
    await auditSub(gate.ctx.db, null, gate.ctx.user.id, 'plan_active_change', null, { planId, active });
    return { ok: true, data: { id: planId } };
  } catch (e) { return adminFail(e); }
}

export async function setEntitlementAction(planId: string, featureKey: string, enabled: boolean, limitValue: number | null): Promise<DbResult<{ ok: true }>> {
  if (!supabaseConfigured()) return notConfigured();
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  try {
    const { error } = await gate.ctx.db.from('feature_entitlements').upsert({ plan_id: planId, feature_key: featureKey, enabled, limit_value: limitValue }, { onConflict: 'plan_id,feature_key' });
    if (error) return adminFail(error);
    await auditSub(gate.ctx.db, null, gate.ctx.user.id, 'entitlement_change', null, { planId, featureKey, enabled, limitValue });
    return { ok: true, data: { ok: true } };
  } catch (e) { return adminFail(e); }
}

// ---- platform subscription oversight (Deliverable K) — admin, read-only ----
export interface SubscriptionRow { orgId: string; orgName: string; plan: string; status: string; investigations: number; publications: number; contributors: number }
export async function listSubscriptionsAction(): Promise<DbResult<SubscriptionRow[]> & { demo?: boolean }> {
  if (!supabaseConfigured()) return { ok: true, demo: true, data: [{ orgId: 'default', orgName: 'Human Signal Index', plan: 'Community', status: 'active', investigations: 12, publications: 6, contributors: 24 }] };
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const db = gate.ctx.db;
  try {
    const { data, error } = await db.from('organization_subscriptions').select('organization_id, status, organizations(name), plans(name)');
    if (error) return adminFail(error);
    const rows: SubscriptionRow[] = [];
    for (const s of (data ?? []) as Array<Record<string, unknown>>) {
      const orgId = String(s.organization_id);
      const orel = s.organizations as { name?: string } | { name?: string }[] | null;
      const prel = s.plans as { name?: string } | { name?: string }[] | null;
      const { data: u } = await db.from('organization_usage').select('investigations_created, publications_created, contributors').eq('organization_id', orgId).maybeSingle();
      const usage = (u ?? {}) as Record<string, number>;
      rows.push({ orgId, orgName: (Array.isArray(orel) ? orel[0]?.name : orel?.name) ?? orgId, plan: (Array.isArray(prel) ? prel[0]?.name : prel?.name) ?? 'Community', status: String(s.status ?? 'active'), investigations: Number(usage.investigations_created ?? 0), publications: Number(usage.publications_created ?? 0), contributors: Number(usage.contributors ?? 0) });
    }
    return { ok: true, data: rows };
  } catch (e) { return adminFail(e); }
}
