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
import {
  resolvePlanPricing, priceIdForPlan, monthlyEquivalentAmount, formatAmount, isPurchasablePlan,
  buildCheckoutInput, buildPortalInput, trialDaysRemaining, revenueSnapshot, normalizeCounters,
  sortInvoices, summarizeInvoice, PAID_PLAN_SLUGS, DEFAULT_TRIAL_DAYS,
  type BillingCycle, type InvoiceSummary, type RevenueSnapshot, type UsageMetric, type PlanPricing,
} from '@hsi/billing';
import { createClient, getUser } from '@/lib/supabase/server';
import { requireAdmin, supabaseConfigured, notConfigured, adminFail, type DbResult } from '@/lib/admin/guard';
import { requireOrganization } from '@/lib/org/organizations';
import {
  stripeConfigured, getPricing, appUrl, sdkCreateCustomer, sdkCreateCheckout, sdkCreatePortal,
  sdkGetSubscription, sdkListInvoices,
} from './stripe';
import { applySubscriptionSync, snapshotFromStripeSubscription, billingAudit } from './sync';

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

// =============================================================================
// PHASE 38 — STRIPE BILLING DAL. Stripe-hosted checkout + portal (no card data),
// customer mapping, subscription sync, invoices, usage metering, enforcement, and
// revenue. Org-admin writes; admin-only platform views. Secrets stay server-side
// (./stripe). Every mutation audited (billing_audit_log). No RBAC/auth changes.
// =============================================================================

/** Org-admin gate (owner/administrator/platformAdmin) returning the org context. */
async function orgAdminCtx(): Promise<
  | { ok: true; org: { id: string; name: string }; membershipRole: string; canManage: boolean; actorId: string | null }
  | { ok: false; error: string; code?: 'AUTH_REQUIRED' | 'FORBIDDEN' | 'DB_ERROR' | 'NOT_CONFIGURED' }
> {
  const ctx = await requireOrganization();
  if (!ctx.ok) return { ok: false, error: ctx.error ?? 'Organization unavailable.', code: ctx.code };
  const canManage = ctx.data.membershipRole === 'owner' || ctx.data.membershipRole === 'administrator' || ctx.data.platformAdmin;
  const user = await getUser();
  return { ok: true, org: { id: ctx.data.org.id, name: ctx.data.org.name }, membershipRole: ctx.data.membershipRole, canManage, actorId: user?.id ?? null };
}

/** Ensure a Stripe customer exists for the org; create + persist if missing. */
async function ensureCustomer(db: Db, orgId: string, name: string, actorId: string | null): Promise<string | null> {
  try {
    const { data } = await db.from('stripe_customers').select('stripe_customer_id').eq('organization_id', orgId).maybeSingle();
    const existing = (data as { stripe_customer_id?: string } | null)?.stripe_customer_id;
    if (existing) return existing;
    const { data: org } = await db.from('organizations').select('contact_email').eq('id', orgId).maybeSingle();
    const email = (org as { contact_email?: string } | null)?.contact_email ?? null;
    const customerId = await sdkCreateCustomer({ orgId, name, email });
    if (!customerId) return null;
    await db.from('stripe_customers').upsert({ organization_id: orgId, stripe_customer_id: customerId, email }, { onConflict: 'organization_id' });
    await billingAudit(db, { orgId, actor: actorId, action: 'customer_created', next: { customerId }, source: 'app' });
    return customerId;
  } catch {
    return null;
  }
}

/** Read the org's Stripe customer mapping (Deliverable C). */
export async function getCustomerAction(): Promise<DbResult<{ stripeCustomerId: string | null }>> {
  const ctx = await orgAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error, code: ctx.code };
  if (!stripeConfigured() || !configured()) return { ok: true, data: { stripeCustomerId: null } };
  try {
    const db = createClient();
    const { data } = await db.from('stripe_customers').select('stripe_customer_id').eq('organization_id', ctx.org.id).maybeSingle();
    return { ok: true, data: { stripeCustomerId: (data as { stripe_customer_id?: string } | null)?.stripe_customer_id ?? null } };
  } catch { return { ok: false, error: 'Customer lookup failed.', code: 'DB_ERROR' }; }
}

/** Create the org's Stripe customer on demand (org-admin). */
export async function createCustomerAction(): Promise<DbResult<{ stripeCustomerId: string }>> {
  if (!configured()) return notConfigured();
  if (!stripeConfigured()) return { ok: false, error: 'Billing is not enabled on this deployment.', code: 'NOT_CONFIGURED' };
  const ctx = await orgAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error, code: ctx.code };
  if (!ctx.canManage) return { ok: false, error: 'Organization admins only.', code: 'FORBIDDEN' };
  const db = createClient();
  const id = await ensureCustomer(db, ctx.org.id, ctx.org.name, ctx.actorId);
  return id ? { ok: true, data: { stripeCustomerId: id } } : { ok: false, error: 'Could not create Stripe customer.', code: 'DB_ERROR' };
}

// ---- billing center view (Deliverable D) -----------------------------------
export interface PlanOption { slug: PlanSlug; name: string; description: string; monthlyAmount: number; annualAmount: number; currency: string; monthlyLabel: string; annualLabel: string; purchasable: boolean; current: boolean }
export interface BillingCenter {
  planSlug: PlanSlug; planName: string; status: string; billingCycle: BillingCycle;
  entitlements: Entitlement[];
  usage: OrgBilling['usage'];
  trialDaysRemaining: number; renewalDate: string | null; cancelAtPeriodEnd: boolean;
  hasCustomer: boolean; stripeEnabled: boolean; canManage: boolean;
  plans: PlanOption[];
}

function planOptions(pricing: PlanPricing[], currentSlug: PlanSlug): PlanOption[] {
  return PLAN_DEFS.map((def) => {
    const pr = pricing.find((p) => p.slug === def.slug);
    const currency = pr?.currency ?? 'usd';
    const monthly = pr?.monthlyAmount ?? 0; const annual = pr?.annualAmount ?? 0;
    return {
      slug: def.slug, name: def.name, description: def.description,
      monthlyAmount: monthly, annualAmount: annual, currency,
      monthlyLabel: def.slug === 'community' ? 'Free' : monthly > 0 ? `${formatAmount(monthly, currency)}/mo` : 'Contact us',
      annualLabel: def.slug === 'community' ? 'Free' : annual > 0 ? `${formatAmount(annual, currency)}/yr` : 'Contact us',
      purchasable: isPurchasablePlan(def.slug), current: def.slug === currentSlug,
    };
  });
}

/** Enriched billing center: plan, status, trial, renewal, usage + upgrade options. */
export async function getBillingCenterAction(): Promise<DbResult<BillingCenter> & { demo?: boolean }> {
  const base = await getOrgBillingAction();
  if (!base.ok) return { ok: false, error: base.error, code: base.code };
  const pricing = getPricing();
  const ctx = await orgAdminCtx();
  const canManage = ctx.ok ? ctx.canManage : false;

  if (base.demo) {
    return { ok: true, demo: true, data: {
      planSlug: base.data.planSlug, planName: base.data.planName, status: base.data.status, billingCycle: 'monthly',
      entitlements: base.data.entitlements, usage: base.data.usage,
      trialDaysRemaining: 0, renewalDate: null, cancelAtPeriodEnd: false,
      hasCustomer: false, stripeEnabled: stripeConfigured(), canManage,
      plans: planOptions(pricing, base.data.planSlug),
    } };
  }
  try {
    const db = createClient(); const orgId = ctx.ok ? ctx.org.id : '';
    const { data: sub } = await db.from('organization_subscriptions').select('billing_cycle, current_period_end, cancel_at_period_end, trial_ends_at').eq('organization_id', orgId).maybeSingle();
    const s = (sub ?? {}) as Record<string, string | boolean | null>;
    const { data: cust } = await db.from('stripe_customers').select('stripe_customer_id').eq('organization_id', orgId).maybeSingle();
    const nowISO = new Date().toISOString();
    return { ok: true, data: {
      planSlug: base.data.planSlug, planName: base.data.planName, status: base.data.status,
      billingCycle: ((s.billing_cycle as string) === 'annual' ? 'annual' : 'monthly'),
      entitlements: base.data.entitlements, usage: base.data.usage,
      trialDaysRemaining: trialDaysRemaining((s.trial_ends_at as string) ?? null, nowISO),
      renewalDate: (s.current_period_end as string) ?? null,
      cancelAtPeriodEnd: Boolean(s.cancel_at_period_end),
      hasCustomer: Boolean((cust as { stripe_customer_id?: string } | null)?.stripe_customer_id),
      stripeEnabled: stripeConfigured(), canManage,
      plans: planOptions(pricing, base.data.planSlug),
    } };
  } catch { return { ok: false, error: 'Billing center unavailable.', code: 'DB_ERROR' }; }
}

// ---- checkout (Deliverable D) ----------------------------------------------
export async function createCheckoutSessionAction(planSlug: string, billingCycle: BillingCycle = 'monthly'): Promise<DbResult<{ url: string }>> {
  if (!configured()) return notConfigured();
  if (!stripeConfigured()) return { ok: false, error: 'Billing is not enabled on this deployment.', code: 'NOT_CONFIGURED' };
  if (!isPurchasablePlan(planSlug)) return { ok: false, error: 'That plan is not purchasable.', code: 'FORBIDDEN' };
  const ctx = await orgAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error, code: ctx.code };
  if (!ctx.canManage) return { ok: false, error: 'Organization admins only.', code: 'FORBIDDEN' };
  const db = createClient();
  const customerId = await ensureCustomer(db, ctx.org.id, ctx.org.name, ctx.actorId);
  if (!customerId) return { ok: false, error: 'Could not initialize billing customer.', code: 'DB_ERROR' };
  const priceId = priceIdForPlan(getPricing(), planSlug, billingCycle);
  if (!priceId) return { ok: false, error: 'This plan has no configured price.', code: 'NOT_CONFIGURED' };
  const built = buildCheckoutInput({
    customerId, priceId, organizationId: ctx.org.id, planSlug, billingCycle,
    successUrl: `${appUrl()}/dashboard/org/billing?checkout=success`,
    cancelUrl: `${appUrl()}/dashboard/org/billing?checkout=cancelled`,
    trialDays: DEFAULT_TRIAL_DAYS,
  });
  if (!built.ok) return { ok: false, error: built.error, code: 'DB_ERROR' };
  const url = await sdkCreateCheckout(built.value as unknown as Record<string, unknown>);
  if (!url) return { ok: false, error: 'Could not start checkout.', code: 'DB_ERROR' };
  await billingAudit(db, { orgId: ctx.org.id, actor: ctx.actorId, action: 'checkout_started', next: { planSlug, billingCycle }, source: 'app' });
  return { ok: true, data: { url } };
}

// ---- billing portal (Deliverable E) ----------------------------------------
export async function createBillingPortalSessionAction(): Promise<DbResult<{ url: string }>> {
  if (!configured()) return notConfigured();
  if (!stripeConfigured()) return { ok: false, error: 'Billing is not enabled on this deployment.', code: 'NOT_CONFIGURED' };
  const ctx = await orgAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error, code: ctx.code };
  if (!ctx.canManage) return { ok: false, error: 'Organization admins only.', code: 'FORBIDDEN' };
  const db = createClient();
  const { data } = await db.from('stripe_customers').select('stripe_customer_id').eq('organization_id', ctx.org.id).maybeSingle();
  const customerId = (data as { stripe_customer_id?: string } | null)?.stripe_customer_id;
  if (!customerId) return { ok: false, error: 'No billing customer yet — start a subscription first.', code: 'DB_ERROR' };
  const built = buildPortalInput(customerId, `${appUrl()}/dashboard/org/billing`);
  if (!built.ok) return { ok: false, error: built.error, code: 'DB_ERROR' };
  const url = await sdkCreatePortal(built.value as unknown as Record<string, unknown>);
  if (!url) return { ok: false, error: 'Could not open the billing portal.', code: 'DB_ERROR' };
  await billingAudit(db, { orgId: ctx.org.id, actor: ctx.actorId, action: 'portal_opened', source: 'app' });
  return { ok: true, data: { url } };
}

// ---- manual subscription sync (Deliverable F) ------------------------------
export async function syncSubscriptionAction(): Promise<DbResult<{ status: string; planSlug: string }>> {
  if (!configured() || !stripeConfigured()) return { ok: false, error: 'Billing is not enabled.', code: 'NOT_CONFIGURED' };
  const ctx = await orgAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error, code: ctx.code };
  if (!ctx.canManage) return { ok: false, error: 'Organization admins only.', code: 'FORBIDDEN' };
  const db = createClient();
  try {
    const { data } = await db.from('stripe_subscriptions').select('stripe_subscription_id').eq('organization_id', ctx.org.id).maybeSingle();
    const subId = (data as { stripe_subscription_id?: string } | null)?.stripe_subscription_id;
    if (!subId) return { ok: false, error: 'No subscription to sync.', code: 'DB_ERROR' };
    const raw = await sdkGetSubscription(subId);
    const snap = raw ? snapshotFromStripeSubscription(raw, getPricing()) : null;
    if (!snap) return { ok: false, error: 'Could not load subscription from Stripe.', code: 'DB_ERROR' };
    const res = await applySubscriptionSync(db, ctx.org.id, snap, 'app', ctx.actorId);
    if (!res.ok) return { ok: false, error: 'Sync failed.', code: 'DB_ERROR' };
    return { ok: true, data: { status: res.status ?? 'active', planSlug: res.planSlug ?? 'community' } };
  } catch (e) { return adminFail(e); }
}

// ---- invoices (Deliverable L) ----------------------------------------------
export async function listInvoicesAction(): Promise<DbResult<InvoiceSummary[]> & { demo?: boolean }> {
  const ctx = await orgAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error, code: ctx.code };
  if (!configured() || !stripeConfigured()) return { ok: true, data: [] };
  try {
    const db = createClient();
    // Prefer the live Stripe list; fall back to the cached billing_invoices.
    const { data: cust } = await db.from('stripe_customers').select('stripe_customer_id').eq('organization_id', ctx.org.id).maybeSingle();
    const customerId = (cust as { stripe_customer_id?: string } | null)?.stripe_customer_id;
    if (customerId) {
      const raw = await sdkListInvoices(customerId, 24);
      if (raw.length > 0) return { ok: true, data: sortInvoices(raw.map(summarizeInvoice)) };
    }
    const { data } = await db.from('billing_invoices').select('*').eq('organization_id', ctx.org.id).order('invoice_created_at', { ascending: false }).limit(24);
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    return { ok: true, data: rows.map((r) => ({
      id: String(r.stripe_invoice_id ?? ''), number: (r.number as string) ?? null,
      amountDue: Number(r.amount_due ?? 0), amountPaid: Number(r.amount_paid ?? 0), currency: String(r.currency ?? 'usd'),
      status: String(r.status ?? 'draft'), createdAt: (r.invoice_created_at as string) ?? null,
      hostedInvoiceUrl: (r.hosted_invoice_url as string) ?? null, pdfUrl: (r.invoice_pdf as string) ?? null,
    })) };
  } catch { return { ok: false, error: 'Could not load invoices.', code: 'DB_ERROR' }; }
}

// ---- usage metering (Deliverable H) ----------------------------------------
const METRIC_COLUMN: Record<UsageMetric, string> = {
  signals: 'signals', investigations: 'investigations_created', publications: 'publications_created',
  storage: 'storage_usage_bytes', users: 'contributors',
};

async function readUsageRow(db: Db, orgId: string): Promise<Record<string, number>> {
  const { data } = await db.from('organization_usage').select('*').eq('organization_id', orgId).maybeSingle();
  return (data ?? {}) as Record<string, number>;
}

/** Set an absolute usage counter (Deliverable H). Org-admin, audited. */
export async function trackUsageAction(metric: UsageMetric, value: number): Promise<DbResult<{ ok: true }>> {
  if (!configured()) return notConfigured();
  const ctx = await orgAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error, code: ctx.code };
  try {
    const db = createClient();
    const row: Record<string, unknown> = { organization_id: ctx.org.id, [METRIC_COLUMN[metric]]: Math.max(0, Math.floor(value)) };
    const { error } = await db.from('organization_usage').upsert(row, { onConflict: 'organization_id' });
    if (error) return adminFail(error);
    await billingAudit(db, { orgId: ctx.org.id, actor: ctx.actorId, action: 'usage_set', next: { metric, value }, source: 'app' });
    return { ok: true, data: { ok: true } };
  } catch (e) { return adminFail(e); }
}

async function deltaUsage(metric: UsageMetric, by: number): Promise<DbResult<{ value: number }>> {
  if (!configured()) return notConfigured();
  const ctx = await orgAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error, code: ctx.code };
  try {
    const db = createClient();
    const cur = await readUsageRow(db, ctx.org.id);
    const col = METRIC_COLUMN[metric];
    const next = Math.max(0, Math.floor(Number(cur[col] ?? 0)) + Math.floor(by));
    const { error } = await db.from('organization_usage').upsert({ organization_id: ctx.org.id, [col]: next }, { onConflict: 'organization_id' });
    if (error) return adminFail(error);
    return { ok: true, data: { value: next } };
  } catch (e) { return adminFail(e); }
}
export async function incrementUsageAction(metric: UsageMetric, by = 1): Promise<DbResult<{ value: number }>> { return deltaUsage(metric, Math.abs(Math.floor(by))); }
export async function decrementUsageAction(metric: UsageMetric, by = 1): Promise<DbResult<{ value: number }>> { return deltaUsage(metric, -Math.abs(Math.floor(by))); }

/** Reset monthly usage counters to zero (Deliverable H). Admin only, audited. */
export async function resetMonthlyUsageAction(orgId?: string): Promise<DbResult<{ ok: true }>> {
  if (!supabaseConfigured()) return notConfigured();
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  try {
    const db = gate.ctx.db;
    const reset = { signals: 0, investigations_created: 0, publications_created: 0, last_reset_at: new Date().toISOString() };
    let q = db.from('organization_usage').update(reset);
    q = orgId ? q.eq('organization_id', orgId) : q.gte('created_at', '1970-01-01');
    const { error } = await q;
    if (error) return adminFail(error);
    await billingAudit(db, { orgId: orgId ?? null, actor: gate.ctx.user.id, action: 'usage_monthly_reset', next: reset, source: 'system' });
    return { ok: true, data: { ok: true } };
  } catch (e) { return adminFail(e); }
}

// ---- entitlement enforcement (Deliverable I) -------------------------------
export type EnforceableFeature = 'signal' | 'investigation' | 'publication' | 'user_invitation' | 'storage_upload';
const FEATURE_LIMIT: Partial<Record<EnforceableFeature, { key: FeatureKey; usageField: keyof OrgBilling['usage'] }>> = {
  investigation: { key: 'investigations_limit', usageField: 'investigations' },
  publication: { key: 'publications_limit', usageField: 'publications' },
  user_invitation: { key: 'contributors_limit', usageField: 'contributors' },
};
export interface FeatureGate { allowed: boolean; reason: string | null; upgradeRequired: boolean; limit: number | null; used: number }

/**
 * Check whether the current org may perform a limited action (Deliverable I).
 * NEVER throws; returns a friendly gate. Unmapped features (signal/storage) are
 * always allowed (no Phase-37 limit). High Community limits → effectively open.
 */
export async function canUseFeatureAction(feature: EnforceableFeature): Promise<FeatureGate> {
  const allow = (): FeatureGate => ({ allowed: true, reason: null, upgradeRequired: false, limit: null, used: 0 });
  const mapping = FEATURE_LIMIT[feature];
  if (!mapping) return allow();
  const base = await getOrgBillingAction();
  if (!base.ok) return allow(); // never block on a billing read error
  const limit = getLimit(base.data.entitlements, mapping.key);
  const used = base.data.usage[mapping.usageField] ?? 0;
  if (limit === null || used < limit) return { allowed: true, reason: null, upgradeRequired: false, limit, used };
  return { allowed: false, reason: `You've reached your plan's ${feature.replace('_', ' ')} limit (${limit}). Upgrade to continue.`, upgradeRequired: true, limit, used };
}

// ---- revenue dashboard (Deliverable K) — admin only ------------------------
export interface RevenueView extends RevenueSnapshot { mrrLabel: string; arrLabel: string }
export async function getRevenueAction(): Promise<DbResult<RevenueView> & { demo?: boolean }> {
  if (!supabaseConfigured()) {
    const pricing = resolvePlanPricing(process.env as Record<string, string | undefined>);
    const snap = revenueSnapshot([
      { status: 'active', planSlug: 'professional', billingCycle: 'monthly' },
      { status: 'active', planSlug: 'enterprise', billingCycle: 'monthly' },
      { status: 'trial', planSlug: 'professional', billingCycle: 'monthly' },
    ], pricing);
    return { ok: true, demo: true, data: { ...snap, mrrLabel: formatAmount(snap.mrr, snap.currency), arrLabel: formatAmount(snap.arr, snap.currency) } };
  }
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  try {
    const db = gate.ctx.db;
    const { data, error } = await db.from('organization_subscriptions').select('status, billing_cycle, plans(slug)');
    if (error) return adminFail(error);
    const subs = (data ?? []).map((r: Record<string, unknown>) => {
      const prel = r.plans as { slug?: string } | { slug?: string }[] | null;
      const slug = (Array.isArray(prel) ? prel[0]?.slug : prel?.slug) ?? 'community';
      return { status: String(r.status ?? 'active'), planSlug: slug, billingCycle: ((r.billing_cycle as string) === 'annual' ? 'annual' : 'monthly') as BillingCycle };
    });
    const snap = revenueSnapshot(subs, getPricing());
    return { ok: true, data: { ...snap, mrrLabel: formatAmount(snap.mrr, snap.currency), arrLabel: formatAmount(snap.arr, snap.currency) } };
  } catch (e) { return adminFail(e); }
}

// ---- enriched admin subscription oversight (Deliverable J) -----------------
export interface BillingSubscriptionRow extends SubscriptionRow { billingCycle: string; renewalDate: string | null; mrrLabel: string; cancelAtPeriodEnd: boolean }
export async function listBillingSubscriptionsAction(): Promise<DbResult<BillingSubscriptionRow[]> & { demo?: boolean }> {
  if (!supabaseConfigured()) {
    return { ok: true, demo: true, data: [{ orgId: 'default', orgName: 'Human Signal Index', plan: 'Community', status: 'active', investigations: 12, publications: 6, contributors: 24, billingCycle: 'monthly', renewalDate: null, mrrLabel: '$0.00', cancelAtPeriodEnd: false }] };
  }
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const db = gate.ctx.db; const pricing = getPricing();
  try {
    const { data, error } = await db.from('organization_subscriptions').select('organization_id, status, billing_cycle, current_period_end, cancel_at_period_end, organizations(name), plans(name, slug)');
    if (error) return adminFail(error);
    const rows: BillingSubscriptionRow[] = [];
    for (const s of (data ?? []) as Array<Record<string, unknown>>) {
      const orgId = String(s.organization_id);
      const orel = s.organizations as { name?: string } | { name?: string }[] | null;
      const prel = s.plans as { name?: string; slug?: string } | { name?: string; slug?: string }[] | null;
      const plan = Array.isArray(prel) ? prel[0] : prel;
      const slug = (plan?.slug as PlanSlug) ?? 'community';
      const cycle = ((s.billing_cycle as string) === 'annual' ? 'annual' : 'monthly') as BillingCycle;
      const status = String(s.status ?? 'active');
      const { data: u } = await db.from('organization_usage').select('investigations_created, publications_created, contributors').eq('organization_id', orgId).maybeSingle();
      const usage = (u ?? {}) as Record<string, number>;
      const mrr = (status === 'active' || status === 'past_due') ? monthlyEquivalentAmount(pricing, slug, cycle) : 0;
      rows.push({
        orgId, orgName: (Array.isArray(orel) ? orel[0]?.name : orel?.name) ?? orgId,
        plan: plan?.name ?? 'Community', status,
        investigations: Number(usage.investigations_created ?? 0), publications: Number(usage.publications_created ?? 0), contributors: Number(usage.contributors ?? 0),
        billingCycle: cycle, renewalDate: (s.current_period_end as string) ?? null,
        mrrLabel: formatAmount(mrr, pricing[0]?.currency ?? 'usd'), cancelAtPeriodEnd: Boolean(s.cancel_at_period_end),
      });
    }
    return { ok: true, data: rows };
  } catch (e) { return adminFail(e); }
}
