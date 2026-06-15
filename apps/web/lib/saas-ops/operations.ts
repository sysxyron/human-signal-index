'use server';

// =============================================================================
// HSI Phase 39 — SaaS operations DAL. Computes revenue/churn/health/cohorts/LTV/
// forecasting/usage-rollups via @hsi/saas-ops over the existing subscription +
// usage tables, snapshots results, and powers the admin dashboards + org billing
// insights. Proration is previewed here but APPLIED by Stripe (source of truth)
// and reflected back via webhooks. Admin-gated platform views; org-owner insights.
// Every mutation audited. No service-role in app; no RBAC/auth changes.
// =============================================================================

import {
  computeRevenueMetrics, mrrByOrg, computeChurnRisk, computeSubscriptionHealth, computeLTV,
  computeCohorts, computeForecast, trackOverages, computeUsageRollup,
  calculateProration, planChangeKind, prorationBehavior, resolveChangeTiming, summarizeBillingOps,
  summarizeWebhookOps, decideReplay, nextAttempt,
  type OpsSubscription, type RevenueMetrics, type RevenueForecast, type HealthStatus, type ChurnRisk,
  type OverageRow, type BillingOpsSummary, type WebhookOpsSummary, type ProrationResult,
} from '@hsi/saas-ops';
import { monthlyEquivalentAmount, priceIdForPlan, formatAmount, isPurchasablePlan, type BillingCycle } from '@hsi/billing';
import { defaultEntitlements, type PlanSlug } from '@hsi/entitlements';
import { createClient, getUser } from '@/lib/supabase/server';
import { requireAdmin, supabaseConfigured, notConfigured, adminFail, type DbResult, type DbResultCode } from '@/lib/admin/guard';
import { requireOrganization } from '@/lib/org/organizations';
import { getPricing, stripeConfigured, sdkUpdateSubscriptionPlan, sdkGetSubscription } from '@/lib/billing/stripe';
import { applySubscriptionSync, snapshotFromStripeSubscription, billingAudit, dispatchStripeEvent } from '@/lib/billing/sync';

type Db = ReturnType<typeof createClient>;
const PAYING = new Set(['active', 'past_due']);
const nowISO = (): string => new Date().toISOString();
const monthKey = (): string => new Date().toISOString().slice(0, 7);

// ---- shared loaders ---------------------------------------------------------

async function loadOpsSubscriptions(db: Db): Promise<OpsSubscription[]> {
  const pricing = getPricing();
  const { data } = await db.from('organization_subscriptions').select('organization_id, status, billing_cycle, starts_at, plans(slug), organizations(created_at)');
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => {
    const prel = r.plans as { slug?: string } | { slug?: string }[] | null;
    const orel = r.organizations as { created_at?: string } | { created_at?: string }[] | null;
    const slug = ((Array.isArray(prel) ? prel[0]?.slug : prel?.slug) as PlanSlug) ?? 'community';
    const cycle = ((r.billing_cycle as string) === 'annual' ? 'annual' : 'monthly') as BillingCycle;
    const status = String(r.status ?? 'active');
    return {
      organizationId: String(r.organization_id), planSlug: slug, status, billingCycle: cycle,
      mrr: PAYING.has(status) ? monthlyEquivalentAmount(pricing, slug, cycle) : 0,
      startedAt: (r.starts_at as string) ?? null,
      createdAt: (Array.isArray(orel) ? orel[0]?.created_at : orel?.created_at) ?? null,
    };
  });
}

async function readUsage(db: Db, orgId: string): Promise<Record<string, number>> {
  const { data } = await db.from('organization_usage').select('*').eq('organization_id', orgId).maybeSingle();
  return (data ?? {}) as Record<string, number>;
}

// ---- J. revenue analytics ---------------------------------------------------
export interface RevenueAnalytics extends RevenueMetrics { mrrLabel: string; arrLabel: string; mrrHistory: number[] }
export async function getRevenueAnalyticsAction(): Promise<DbResult<RevenueAnalytics> & { demo?: boolean }> {
  if (!supabaseConfigured()) {
    const demo = computeRevenueMetrics(
      [{ organizationId: 'a', planSlug: 'professional', status: 'active', billingCycle: 'monthly', mrr: 4900, startedAt: null, createdAt: null },
       { organizationId: 'b', planSlug: 'enterprise', status: 'active', billingCycle: 'monthly', mrr: 29900, startedAt: null, createdAt: null }],
      { a: 4900 }, 'usd');
    return { ok: true, demo: true, data: { ...demo, mrrLabel: formatAmount(demo.mrr), arrLabel: formatAmount(demo.arr), mrrHistory: [28000, 31000, demo.mrr] } };
  }
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const db = gate.ctx.db;
  try {
    const subs = await loadOpsSubscriptions(db);
    const { data: prior } = await db.from('revenue_snapshots').select('mrr_by_org, mrr').order('created_at', { ascending: false }).limit(12);
    const rows = (prior ?? []) as Array<{ mrr_by_org: Record<string, number>; mrr: number }>;
    const priorMap = rows[0]?.mrr_by_org ?? {};
    const metrics = computeRevenueMetrics(subs, priorMap, getPricing()[0]?.currency ?? 'usd');
    // Snapshot for the next diff + trend history.
    await db.from('revenue_snapshots').insert({
      period: monthKey(), mrr: metrics.mrr, arr: metrics.arr, growth_rate: metrics.growthRate,
      expansion_revenue: metrics.expansionRevenue, contraction_revenue: metrics.contractionRevenue,
      churned_revenue: metrics.churnedRevenue, net_new_revenue: metrics.netNewRevenue,
      currency: metrics.currency, mrr_by_org: mrrByOrg(subs),
    });
    const history = [...rows.map((r) => Number(r.mrr ?? 0)).reverse(), metrics.mrr];
    return { ok: true, data: { ...metrics, mrrLabel: formatAmount(metrics.mrr, metrics.currency), arrLabel: formatAmount(metrics.arr, metrics.currency), mrrHistory: history } };
  } catch (e) { return adminFail(e); }
}

// ---- O. forecasting ---------------------------------------------------------
export interface ForecastView extends RevenueForecast { nextMonthLabel: string; nextQuarterLabel: string }
export async function getForecastAction(): Promise<DbResult<ForecastView> & { demo?: boolean }> {
  const build = (history: number[], churn: number, currency: string): ForecastView => {
    const f = computeForecast({ mrrHistory: history, churnRate: churn, currency });
    return { ...f, nextMonthLabel: formatAmount(f.nextMonthMrr, currency), nextQuarterLabel: formatAmount(f.nextQuarterArr, currency) };
  };
  if (!supabaseConfigured()) return { ok: true, demo: true, data: build([28000, 31000, 34800], 0.04, 'usd') };
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  try {
    const { data } = await gate.ctx.db.from('revenue_snapshots').select('mrr').order('created_at', { ascending: true }).limit(12);
    const history = ((data ?? []) as Array<{ mrr: number }>).map((r) => Number(r.mrr ?? 0));
    const { data: ch } = await gate.ctx.db.from('churn_events').select('risk').order('created_at', { ascending: false }).limit(100);
    const churnRows = (ch ?? []) as Array<{ risk: string }>;
    const churnRate = churnRows.length > 0 ? churnRows.filter((c) => c.risk === 'high').length / churnRows.length : 0;
    return { ok: true, data: build(history.length > 0 ? history : [0], churnRate, getPricing()[0]?.currency ?? 'usd') };
  } catch (e) { return adminFail(e); }
}

// ---- F/G. subscription health + churn ---------------------------------------
export interface HealthRow { orgId: string; orgName: string; plan: string; status: HealthStatus; score: number; churnRisk: ChurnRisk; usageTrend: number; reasons: string[] }
export async function getSubscriptionHealthAction(): Promise<DbResult<HealthRow[]> & { demo?: boolean }> {
  if (!supabaseConfigured()) {
    return { ok: true, demo: true, data: [
      { orgId: 'a', orgName: 'Acme Research', plan: 'Professional', status: 'healthy', score: 82, churnRisk: 'low', usageTrend: 0.2, reasons: ['Strong engagement across the board'] },
      { orgId: 'b', orgName: 'Beacon Labs', plan: 'Enterprise', status: 'at-risk', score: 28, churnRisk: 'high', usageTrend: -0.6, reasons: ['Declining usage', 'No active users'] },
    ] };
  }
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const db = gate.ctx.db;
  try {
    const { data } = await db.from('organization_subscriptions').select('organization_id, status, plans(name), organizations(name)');
    const rows: HealthRow[] = [];
    for (const s of (data ?? []) as Array<Record<string, unknown>>) {
      const orgId = String(s.organization_id);
      const orel = s.organizations as { name?: string } | { name?: string }[] | null;
      const prel = s.plans as { name?: string } | { name?: string }[] | null;
      const usage = await readUsage(db, orgId);
      const activeUsers = Number(usage.contributors ?? 0);
      const investigationActivity = Number(usage.investigations_created ?? 0);
      const publicationActivity = Number(usage.publications_created ?? 0);
      const contentCreated = Number(usage.signals ?? 0) + publicationActivity;
      const health = computeSubscriptionHealth({ activeUsers, usageTrend: 0, daysSinceLogin: 2, contentCreated, investigationActivity, publicationActivity });
      const churn = computeChurnRisk({ usageTrend: 0, daysSinceActivity: 2, paymentFailures: String(s.status) === 'past_due' ? 1 : 0, trialDaysRemaining: 0, isTrialing: String(s.status) === 'trial' });
      await db.from('subscription_health').upsert({ organization_id: orgId, status: health.status, score: health.score, churn_risk: churn.risk, usage_trend: 0, reasons: health.reasons, computed_at: nowISO() }, { onConflict: 'organization_id' });
      await db.from('churn_events').insert({ organization_id: orgId, risk: churn.risk, score: churn.score, reasons: churn.reasons });
      rows.push({ orgId, orgName: (Array.isArray(orel) ? orel[0]?.name : orel?.name) ?? orgId, plan: (Array.isArray(prel) ? prel[0]?.name : prel?.name) ?? 'Community', status: health.status, score: health.score, churnRisk: churn.risk, usageTrend: 0, reasons: health.reasons });
    }
    return { ok: true, data: rows };
  } catch (e) { return adminFail(e); }
}

// ---- I. cohorts -------------------------------------------------------------
export interface CohortView { cohort: string; size: number; retained: number; churned: number; retentionRate: number; engagementRate: number }
export async function getCohortsAction(): Promise<DbResult<CohortView[]> & { demo?: boolean }> {
  if (!supabaseConfigured()) {
    return { ok: true, demo: true, data: [
      { cohort: '2026-01', size: 12, retained: 9, churned: 3, retentionRate: 0.75, engagementRate: 0.66 },
      { cohort: '2026-02', size: 8, retained: 7, churned: 1, retentionRate: 0.88, engagementRate: 0.75 },
    ] };
  }
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const db = gate.ctx.db;
  try {
    const { data } = await db.from('organization_subscriptions').select('organization_id, status, plans(slug), organizations(created_at)');
    const members = await Promise.all(((data ?? []) as Array<Record<string, unknown>>).map(async (r) => {
      const orgId = String(r.organization_id);
      const orel = r.organizations as { created_at?: string } | { created_at?: string }[] | null;
      const prel = r.plans as { slug?: string } | { slug?: string }[] | null;
      const created = (Array.isArray(orel) ? orel[0]?.created_at : orel?.created_at) ?? null;
      const usage = await readUsage(db, orgId);
      const engaged = Number(usage.investigations_created ?? 0) + Number(usage.publications_created ?? 0) > 0;
      const status = String(r.status ?? 'active');
      return {
        organizationId: orgId,
        signupMonth: created ? created.slice(0, 7) : null,
        activationMonth: created ? created.slice(0, 7) : null,
        planSlug: ((Array.isArray(prel) ? prel[0]?.slug : prel?.slug) as string) ?? 'community',
        retained: status === 'active' || status === 'trial',
        engaged,
      };
    }));
    const cohorts = computeCohorts(members, 'signup_month');
    for (const c of cohorts) {
      await db.from('cohort_snapshots').insert({ cohort_key: 'signup_month', cohort: c.cohort, size: c.size, retained: c.retained, churned: c.churned, retention_rate: c.retentionRate, engagement_rate: c.engagementRate });
    }
    return { ok: true, data: cohorts };
  } catch (e) { return adminFail(e); }
}

// ---- M. billing operations --------------------------------------------------
export interface BillingOpsView extends BillingOpsSummary { overageOrgs: number; recentChanges: Array<{ orgId: string; action: string; at: string }> }
export async function getBillingOpsAction(): Promise<DbResult<BillingOpsView> & { demo?: boolean }> {
  if (!supabaseConfigured()) {
    return { ok: true, demo: true, data: { active: 18, trialing: 5, canceled: 3, pastDue: 1, paused: 0, paymentFailures: 2, overageOrgs: 1, recentChanges: [{ orgId: 'a', action: 'subscription_sync', at: nowISO() }] } };
  }
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const db = gate.ctx.db;
  try {
    const subs = await loadOpsSubscriptions(db);
    const { count: failCount } = await db.from('billing_invoices').select('*', { count: 'exact', head: true }).in('status', ['open', 'uncollectible']);
    const summary = summarizeBillingOps(subs, failCount ?? 0);
    // Overage orgs (default-entitlement based; bounded scan).
    let overageOrgs = 0;
    for (const s of subs) {
      const usage = await readUsage(db, s.organizationId);
      const rows = trackOverages(defaultEntitlements(s.planSlug as PlanSlug), {
        signals: Number(usage.signals ?? 0), investigations: Number(usage.investigations_created ?? 0),
        publications: Number(usage.publications_created ?? 0), storage: Number(usage.storage_usage_bytes ?? 0), users: Number(usage.contributors ?? 0),
      });
      if (rows.some((r) => r.overage > 0)) overageOrgs++;
    }
    const { data: changes } = await db.from('billing_audit_log').select('organization_id, action, created_at').order('created_at', { ascending: false }).limit(10);
    const recentChanges = ((changes ?? []) as Array<Record<string, unknown>>).map((c) => ({ orgId: String(c.organization_id ?? ''), action: String(c.action), at: String(c.created_at) }));
    return { ok: true, data: { ...summary, overageOrgs, recentChanges } };
  } catch (e) { return adminFail(e); }
}

// ---- N. webhook operations --------------------------------------------------
export interface DeadLetterView { stripeEventId: string; type: string; attempts: number; lastError: string | null; resolved: boolean; createdAt: string; replayable: boolean }
export interface WebhookOpsView extends WebhookOpsSummary { deadletters: DeadLetterView[] }
export async function getWebhookOpsAction(): Promise<DbResult<WebhookOpsView> & { demo?: boolean }> {
  if (!supabaseConfigured()) {
    return { ok: true, demo: true, data: { processed: 124, failed: 3, deadLettered: 1, replayable: 2, deadletters: [{ stripeEventId: 'evt_demo', type: 'invoice.payment_failed', attempts: 2, lastError: 'org_not_resolved', resolved: false, createdAt: nowISO(), replayable: true }] } };
  }
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const db = gate.ctx.db;
  try {
    const { data: events } = await db.from('stripe_events').select('processed, error, type').order('created_at', { ascending: false }).limit(500);
    const { data: dl } = await db.from('webhook_deadletters').select('stripe_event_id, type, attempts, last_error, resolved, created_at').order('created_at', { ascending: false }).limit(100);
    const dlRows = (dl ?? []) as Array<Record<string, unknown>>;
    const attemptsByType = new Map<string, number>();
    for (const d of dlRows) attemptsByType.set(String(d.type), Math.max(attemptsByType.get(String(d.type)) ?? 0, Number(d.attempts ?? 1)));
    const summary = summarizeWebhookOps(((events ?? []) as Array<Record<string, unknown>>).map((e) => ({ processed: Boolean(e.processed), error: (e.error as string) ?? null, type: String(e.type), attempts: attemptsByType.get(String(e.type)) ?? 1 })));
    const deadletters: DeadLetterView[] = dlRows.filter((d) => !d.resolved).map((d) => ({
      stripeEventId: String(d.stripe_event_id), type: String(d.type), attempts: Number(d.attempts ?? 1), lastError: (d.last_error as string) ?? null,
      resolved: Boolean(d.resolved), createdAt: String(d.created_at),
      replayable: decideReplay({ stripeEventId: String(d.stripe_event_id), type: String(d.type), attempts: Number(d.attempts ?? 1), lastError: (d.last_error as string) ?? null }).replay,
    }));
    return { ok: true, data: { ...summary, deadletters } };
  } catch (e) { return adminFail(e); }
}

/** Re-dispatch a stored event (replay/retry). Shared core. Admin RLS client. */
async function redispatch(db: Db, eventId: string, actorId: string | null): Promise<DbResult<{ ok: true }>> {
  const { data: ev } = await db.from('stripe_events').select('type, organization_id, payload').eq('stripe_event_id', eventId).maybeSingle();
  const row = ev as { type?: string; organization_id?: string; payload?: { data?: { object?: unknown } } } | null;
  if (!row?.payload) {
    const { data: dl } = await db.from('webhook_deadletters').select('type, organization_id, payload, attempts').eq('stripe_event_id', eventId).maybeSingle();
    const d = dl as { type?: string; organization_id?: string; payload?: { data?: { object?: unknown } }; attempts?: number } | null;
    if (!d?.payload) return { ok: false, error: 'Event payload not found.', code: 'DB_ERROR' };
    const decision = decideReplay({ stripeEventId: eventId, type: String(d.type), attempts: Number(d.attempts ?? 1), lastError: null });
    if (!decision.replay) return { ok: false, error: `Not replayable (${decision.reason}).`, code: 'FORBIDDEN' };
    const obj = (d.payload?.data?.object ?? {}) as Record<string, unknown>;
    const res = await dispatchStripeEvent(db, String(d.type), obj, d.organization_id ?? null, 'system');
    await db.from('webhook_deadletters').update({ attempts: nextAttempt(Number(d.attempts ?? 1)), resolved: res.ok, resolved_at: res.ok ? nowISO() : null, last_error: res.error }).eq('stripe_event_id', eventId);
    await billingAudit(db, { orgId: d.organization_id ?? null, actor: actorId, action: 'webhook_replay', next: { eventId, ok: res.ok }, source: 'system' });
    return res.ok ? { ok: true, data: { ok: true } } : { ok: false, error: res.error ?? 'Replay failed.', code: 'DB_ERROR' };
  }
  const obj = (row.payload?.data?.object ?? {}) as Record<string, unknown>;
  const res = await dispatchStripeEvent(db, String(row.type), obj, row.organization_id ?? null, 'system');
  await db.from('stripe_events').update({ processed: res.ok, processed_at: nowISO(), error: res.error }).eq('stripe_event_id', eventId);
  await billingAudit(db, { orgId: row.organization_id ?? null, actor: actorId, action: 'webhook_retry', next: { eventId, ok: res.ok }, source: 'system' });
  return res.ok ? { ok: true, data: { ok: true } } : { ok: false, error: res.error ?? 'Retry failed.', code: 'DB_ERROR' };
}

export async function replayWebhookAction(eventId: string): Promise<DbResult<{ ok: true }>> {
  if (!supabaseConfigured()) return notConfigured();
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  try { return await redispatch(gate.ctx.db, eventId, gate.ctx.user.id); } catch (e) { return adminFail(e); }
}
export async function retryFailedWebhookAction(eventId: string): Promise<DbResult<{ ok: true }>> {
  return replayWebhookAction(eventId);
}

// ---- D. usage rollups -------------------------------------------------------
export async function computeUsageRollupsAction(): Promise<DbResult<{ orgs: number }>> {
  if (!supabaseConfigured()) return notConfigured();
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const db = gate.ctx.db;
  try {
    const { data } = await db.from('organization_usage').select('*');
    const rows = (data ?? []) as Array<Record<string, number | string>>;
    const period = monthKey();
    for (const u of rows) {
      const rollup = computeUsageRollup('current_month', {
        signals: Number(u.signals ?? 0), investigations: Number(u.investigations_created ?? 0),
        publications: Number(u.publications_created ?? 0), storage: Number(u.storage_usage_bytes ?? 0), users: Number(u.contributors ?? 0),
      });
      await db.from('usage_rollups').upsert({ organization_id: String(u.organization_id), period, signals: rollup.signals, investigations: rollup.investigations, publications: rollup.publications, storage: rollup.storage, users: rollup.users }, { onConflict: 'organization_id,period' });
    }
    await billingAudit(db, { orgId: null, actor: gate.ctx.user.id, action: 'usage_rollups_computed', next: { period, orgs: rows.length }, source: 'system' });
    return { ok: true, data: { orgs: rows.length } };
  } catch (e) { return adminFail(e); }
}

// ---- C. proration (preview + apply) -----------------------------------------
async function orgAdmin(): Promise<{ ok: true; orgId: string; orgName: string; actorId: string | null } | { ok: false; error: string; code?: DbResultCode }> {
  const ctx = await requireOrganization();
  if (!ctx.ok) return { ok: false, error: ctx.error ?? 'Organization unavailable.', code: ctx.code };
  const canManage = ctx.data.membershipRole === 'owner' || ctx.data.membershipRole === 'administrator' || ctx.data.platformAdmin;
  if (!canManage) return { ok: false, error: 'Organization admins only.', code: 'FORBIDDEN' };
  const user = await getUser();
  return { ok: true, orgId: ctx.data.org.id, orgName: ctx.data.org.name, actorId: user?.id ?? null };
}

export interface ProrationView extends ProrationResult { creditLabel: string; chargeLabel: string; netLabel: string }
async function previewFor(db: Db, orgId: string, newSlug: PlanSlug, cycle: BillingCycle): Promise<ProrationView | null> {
  const pricing = getPricing();
  const { data: sub } = await db.from('organization_subscriptions').select('billing_cycle, current_period_start, current_period_end, plans(slug)').eq('organization_id', orgId).maybeSingle();
  const s = (sub ?? {}) as Record<string, unknown>;
  const prel = s.plans as { slug?: string } | { slug?: string }[] | null;
  const currentSlug = ((Array.isArray(prel) ? prel[0]?.slug : prel?.slug) as PlanSlug) ?? 'community';
  const curCycle = ((s.billing_cycle as string) === 'annual' ? 'annual' : 'monthly') as BillingCycle;
  const start = s.current_period_start ? Date.parse(String(s.current_period_start)) : NaN;
  const end = s.current_period_end ? Date.parse(String(s.current_period_end)) : NaN;
  const periodDays = Number.isFinite(start) && Number.isFinite(end) && end > start ? Math.round((end - start) / 86_400_000) : 30;
  const daysRemaining = Number.isFinite(end) ? Math.max(0, Math.round((end - Date.now()) / 86_400_000)) : Math.round(periodDays / 2);
  const result = calculateProration({
    currentAmount: monthlyEquivalentAmount(pricing, currentSlug, curCycle), newAmount: monthlyEquivalentAmount(pricing, newSlug, cycle),
    daysRemaining, periodDays, currentSlug, newSlug,
  });
  const currency = pricing[0]?.currency ?? 'usd';
  return { ...result, creditLabel: formatAmount(result.credit, currency), chargeLabel: formatAmount(result.charge, currency), netLabel: formatAmount(Math.abs(result.netAmount), currency) };
}

export async function previewProrationAction(newPlanSlug: string, cycle: BillingCycle = 'monthly'): Promise<DbResult<ProrationView>> {
  if (!isPurchasablePlan(newPlanSlug)) return { ok: false, error: 'That plan is not purchasable.', code: 'FORBIDDEN' };
  const ctx = await orgAdmin();
  if (!ctx.ok) return { ok: false, error: ctx.error, code: ctx.code as never };
  if (!supabaseConfigured()) return notConfigured();
  try {
    const view = await previewFor(createClient(), ctx.orgId, newPlanSlug, cycle);
    return view ? { ok: true, data: view } : { ok: false, error: 'Could not preview proration.', code: 'DB_ERROR' };
  } catch (e) { return adminFail(e); }
}

async function changePlan(newPlanSlug: string, cycle: BillingCycle, expectKind: 'upgrade' | 'downgrade'): Promise<DbResult<{ status: string; planSlug: string }>> {
  if (!isPurchasablePlan(newPlanSlug)) return { ok: false, error: 'That plan is not purchasable.', code: 'FORBIDDEN' };
  if (!stripeConfigured()) return { ok: false, error: 'Billing is not enabled on this deployment.', code: 'NOT_CONFIGURED' };
  const ctx = await orgAdmin();
  if (!ctx.ok) return { ok: false, error: ctx.error, code: ctx.code as never };
  const db = createClient();
  try {
    const { data: sub } = await db.from('stripe_subscriptions').select('stripe_subscription_id, plan_id, plans(slug)').eq('organization_id', ctx.orgId).maybeSingle();
    const row = (sub ?? {}) as Record<string, unknown>;
    const subId = row.stripe_subscription_id as string | undefined;
    if (!subId) return { ok: false, error: 'No active subscription to change.', code: 'DB_ERROR' };
    const prel = row.plans as { slug?: string } | { slug?: string }[] | null;
    const currentSlug = ((Array.isArray(prel) ? prel[0]?.slug : prel?.slug) as PlanSlug) ?? 'community';
    const kind = planChangeKind(currentSlug, newPlanSlug);
    if (kind !== expectKind) return { ok: false, error: `Selected plan is not an ${expectKind}.`, code: 'FORBIDDEN' };
    const newPriceId = priceIdForPlan(getPricing(), newPlanSlug, cycle);
    if (!newPriceId) return { ok: false, error: 'This plan has no configured price.', code: 'NOT_CONFIGURED' };
    const updated = await sdkUpdateSubscriptionPlan({ subscriptionId: subId, newPriceId, prorationBehavior: prorationBehavior(kind), atPeriodEnd: resolveChangeTiming(kind) === 'next_cycle' });
    const fresh = updated ?? (await sdkGetSubscription(subId));
    const snap = fresh ? snapshotFromStripeSubscription(fresh, getPricing()) : null;
    if (!snap) return { ok: false, error: 'Stripe did not return the updated subscription.', code: 'DB_ERROR' };
    const res = await applySubscriptionSync(db, ctx.orgId, snap, 'app', ctx.actorId);
    await billingAudit(db, { orgId: ctx.orgId, actor: ctx.actorId, action: `plan_${expectKind}`, next: { from: currentSlug, to: newPlanSlug, cycle }, source: 'app' });
    return res.ok ? { ok: true, data: { status: res.status ?? 'active', planSlug: res.planSlug ?? newPlanSlug } } : { ok: false, error: 'Sync failed after change.', code: 'DB_ERROR' };
  } catch (e) { return adminFail(e); }
}

export async function upgradePlanAction(newPlanSlug: string, cycle: BillingCycle = 'monthly'): Promise<DbResult<{ status: string; planSlug: string }>> {
  return changePlan(newPlanSlug, cycle, 'upgrade');
}
export async function downgradePlanAction(newPlanSlug: string, cycle: BillingCycle = 'monthly'): Promise<DbResult<{ status: string; planSlug: string }>> {
  return changePlan(newPlanSlug, cycle, 'downgrade');
}

// ---- P. organization billing insights (org owner) ---------------------------
export interface OrgBillingInsights {
  usageTrend: number; projectedOverages: OverageRow[]; hasOverage: boolean;
  health: { status: HealthStatus; score: number; churnRisk: ChurnRisk } | null;
  renewalDate: string | null; renewalForecastLabel: string;
}
export async function getOrgBillingInsightsAction(): Promise<DbResult<OrgBillingInsights> & { demo?: boolean }> {
  const ctx = await requireOrganization();
  if (!ctx.ok) return { ok: false, error: ctx.error ?? 'Organization unavailable.', code: ctx.code };
  const isOwner = ctx.data.membershipRole === 'owner' || ctx.data.platformAdmin;
  if (!isOwner) return { ok: false, error: 'Organization owners only.', code: 'FORBIDDEN' };
  if (ctx.demo || !supabaseConfigured()) {
    return { ok: true, demo: true, data: { usageTrend: 0.18, projectedOverages: [], hasOverage: false, health: { status: 'healthy', score: 78, churnRisk: 'low' }, renewalDate: null, renewalForecastLabel: '$49.00' } };
  }
  const db = createClient(); const orgId = ctx.data.org.id;
  try {
    const { data: subRow } = await db.from('organization_subscriptions').select('current_period_end, billing_cycle, plans(slug)').eq('organization_id', orgId).maybeSingle();
    const s = (subRow ?? {}) as Record<string, unknown>;
    const prel = s.plans as { slug?: string } | { slug?: string }[] | null;
    const slug = ((Array.isArray(prel) ? prel[0]?.slug : prel?.slug) as PlanSlug) ?? 'community';
    const cycle = ((s.billing_cycle as string) === 'annual' ? 'annual' : 'monthly') as BillingCycle;
    const usage = await readUsage(db, orgId);
    const overages = trackOverages(defaultEntitlements(slug), {
      signals: Number(usage.signals ?? 0), investigations: Number(usage.investigations_created ?? 0),
      publications: Number(usage.publications_created ?? 0), storage: Number(usage.storage_usage_bytes ?? 0), users: Number(usage.contributors ?? 0),
    });
    // usage trend from rollups (current vs previous month) when present.
    const { data: rollups } = await db.from('usage_rollups').select('period, signals, investigations, publications').eq('organization_id', orgId).order('period', { ascending: false }).limit(2);
    const rr = (rollups ?? []) as Array<Record<string, number | string>>;
    const sum = (r?: Record<string, number | string>) => r ? Number(r.signals ?? 0) + Number(r.investigations ?? 0) + Number(r.publications ?? 0) : 0;
    const cur = sum(rr[0]); const prev = sum(rr[1]);
    const usageTrend = prev > 0 ? (cur - prev) / prev : 0;
    const { data: h } = await db.from('subscription_health').select('status, score, churn_risk').eq('organization_id', orgId).maybeSingle();
    const hr = h as { status?: HealthStatus; score?: number; churn_risk?: ChurnRisk } | null;
    const renewal = monthlyEquivalentAmount(getPricing(), slug, cycle);
    return { ok: true, data: {
      usageTrend, projectedOverages: overages, hasOverage: overages.some((o) => o.overage > 0),
      health: hr ? { status: hr.status ?? 'healthy', score: Number(hr.score ?? 0), churnRisk: hr.churn_risk ?? 'low' } : null,
      renewalDate: (s.current_period_end as string) ?? null,
      renewalForecastLabel: formatAmount(renewal, getPricing()[0]?.currency ?? 'usd'),
    } };
  } catch (e) { return adminFail(e); }
}

