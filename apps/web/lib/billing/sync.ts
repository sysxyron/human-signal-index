// =============================================================================
// HSI Phase 38 — billing sync helpers. SERVER-ONLY, NOT a server-action module:
// pure-ish DB helpers that take a Supabase client (RLS user client from the DAL,
// or service-role client from the webhook route). Maps live Stripe objects onto
// @hsi/billing snapshots and writes the mirror + the Phase-37 subscription row so
// entitlements resolve correctly. Append-only billing audit.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  reconcileSubscription, planForPriceId, summarizeInvoice, classifyEvent,
  type SubscriptionSnapshot, type PlanPricing, type StripeSubscriptionStatus, type BillingCycle,
} from '@hsi/billing';
import type { PlanSlug } from '@hsi/entitlements';
import { getPricing } from './stripe';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = SupabaseClient;

const toISO = (unixSeconds: number | null | undefined): string | null =>
  typeof unixSeconds === 'number' && unixSeconds > 0 ? new Date(unixSeconds * 1000).toISOString() : null;

/** Map a raw Stripe subscription object onto our normalized snapshot. PURE-ish. */
export function snapshotFromStripeSubscription(raw: any, pricing: PlanPricing[]): SubscriptionSnapshot | null {
  if (!raw?.id) return null;
  const item = raw.items?.data?.[0];
  const priceId: string = item?.price?.id ?? '';
  const mapped = priceId ? planForPriceId(pricing, priceId) : null;
  const interval: string = item?.price?.recurring?.interval ?? 'month';
  const cycle: BillingCycle = mapped?.cycle ?? (interval === 'year' ? 'annual' : 'monthly');
  const planSlug: PlanSlug = mapped?.slug ?? 'professional';
  return {
    stripeSubscriptionId: String(raw.id),
    stripeCustomerId: String(raw.customer ?? ''),
    status: String(raw.status ?? 'active') as StripeSubscriptionStatus,
    planSlug,
    billingCycle: cycle,
    currentPeriodStart: toISO(raw.current_period_start),
    currentPeriodEnd: toISO(raw.current_period_end),
    cancelAtPeriodEnd: Boolean(raw.cancel_at_period_end),
    trialEnd: toISO(raw.trial_end),
  };
}

/** Resolve a plans.id from a slug. Returns null when missing. */
export async function planIdForSlug(db: Db, slug: PlanSlug): Promise<string | null> {
  try {
    const { data } = await db.from('plans').select('id').eq('slug', slug).maybeSingle();
    return (data as { id?: string } | null)?.id ?? null;
  } catch {
    return null;
  }
}

/** Append a billing audit entry (best-effort, never throws). */
export async function billingAudit(
  db: Db,
  input: { orgId: string | null; actor: string | null; action: string; previous?: unknown; next?: unknown; source?: 'app' | 'webhook' | 'system' },
): Promise<void> {
  try {
    await db.from('billing_audit_log').insert({
      organization_id: input.orgId,
      actor: input.actor,
      action: input.action,
      previous_value: input.previous ?? null,
      new_value: input.next ?? null,
      source: input.source ?? 'app',
    });
  } catch {
    /* best-effort */
  }
}

export interface SyncResult { ok: boolean; status?: string; planSlug?: PlanSlug }

/**
 * Write the Stripe subscription mirror + reconcile the Phase-37 subscription row
 * (status, plan, period, cancel flag) so @hsi/entitlements resolves the right
 * plan. `source` records who triggered the sync in the audit log.
 */
export async function applySubscriptionSync(
  db: Db,
  orgId: string,
  snapshot: SubscriptionSnapshot,
  source: 'app' | 'webhook' | 'system' = 'system',
  actor: string | null = null,
): Promise<SyncResult> {
  const reconciled = reconcileSubscription(snapshot);
  const mirrorPlanId = await planIdForSlug(db, snapshot.planSlug);
  const entitlementPlanId = await planIdForSlug(db, reconciled.planSlug);

  try {
    // 1. Stripe mirror (one row per org).
    await db.from('stripe_subscriptions').upsert({
      organization_id: orgId,
      stripe_customer_id: snapshot.stripeCustomerId,
      stripe_subscription_id: snapshot.stripeSubscriptionId,
      plan_id: mirrorPlanId,
      status: snapshot.status,
      billing_cycle: snapshot.billingCycle,
      current_period_start: snapshot.currentPeriodStart,
      current_period_end: snapshot.currentPeriodEnd,
      cancel_at_period_end: snapshot.cancelAtPeriodEnd,
      trial_end: snapshot.trialEnd,
    }, { onConflict: 'organization_id' });

    // 2. Reconcile the Phase-37 subscription row (drives entitlements).
    const subUpdate: Record<string, unknown> = {
      status: reconciled.status,
      billing_cycle: reconciled.billingCycle,
      current_period_start: reconciled.currentPeriodStart,
      current_period_end: reconciled.currentPeriodEnd,
      cancel_at_period_end: reconciled.cancelAtPeriodEnd,
      stripe_customer_id: snapshot.stripeCustomerId,
      stripe_subscription_id: snapshot.stripeSubscriptionId,
      trial_ends_at: snapshot.trialEnd,
    };
    if (entitlementPlanId) subUpdate.plan_id = entitlementPlanId;
    await db.from('organization_subscriptions').upsert(
      { organization_id: orgId, plan_id: entitlementPlanId, ...subUpdate },
      { onConflict: 'organization_id' },
    );

    await billingAudit(db, { orgId, actor, action: 'subscription_sync', next: { status: reconciled.status, plan: reconciled.planSlug, accessActive: reconciled.accessActive }, source });
    return { ok: true, status: reconciled.status, planSlug: reconciled.planSlug };
  } catch {
    return { ok: false };
  }
}

/** Cache a Stripe invoice for display + audit. Best-effort. */
export async function recordInvoiceRow(db: Db, orgId: string, rawInvoice: any): Promise<void> {
  const inv = summarizeInvoice(rawInvoice);
  if (!inv.id) return;
  try {
    await db.from('billing_invoices').upsert({
      organization_id: orgId,
      stripe_invoice_id: inv.id,
      number: inv.number,
      amount_due: inv.amountDue,
      amount_paid: inv.amountPaid,
      currency: inv.currency,
      status: inv.status,
      hosted_invoice_url: inv.hostedInvoiceUrl,
      invoice_pdf: inv.pdfUrl,
      invoice_created_at: inv.createdAt,
    }, { onConflict: 'stripe_invoice_id' });
  } catch {
    /* best-effort */
  }
}

/** Look up the org id for a Stripe customer (webhook routing). */
export async function orgIdForCustomer(db: Db, customerId: string): Promise<string | null> {
  try {
    const { data } = await db.from('stripe_customers').select('organization_id').eq('stripe_customer_id', customerId).maybeSingle();
    return (data as { organization_id?: string } | null)?.organization_id ?? null;
  } catch {
    return null;
  }
}

/**
 * Dispatch a (verified) Stripe event object to its handler — shared by the webhook
 * route AND webhook replay so both follow identical, idempotent logic. Returns
 * {ok,error}; `ok:false` with a reason when the org can't be resolved / sync fails.
 */
export async function dispatchStripeEvent(
  db: Db, type: string, obj: any, orgIdHint: string | null, source: 'webhook' | 'system' = 'webhook',
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const action = classifyEvent(type);
    if (action === 'sync_subscription') {
      const subRaw = obj?.object === 'subscription' ? obj : obj?.subscription ? { id: obj.subscription, customer: obj.customer } : obj;
      const snap = snapshotFromStripeSubscription(subRaw, getPricing());
      if (!snap) return { ok: true, error: null };
      const orgId = orgIdHint || (snap.stripeCustomerId ? await orgIdForCustomer(db, snap.stripeCustomerId) : null);
      if (!orgId) return { ok: false, error: 'org_not_resolved' };
      const r = await applySubscriptionSync(db, orgId, snap, source, null);
      return { ok: r.ok, error: r.ok ? null : 'sync_failed' };
    }
    if (action === 'record_invoice') {
      const customerId = String(obj?.customer ?? '');
      const orgId = orgIdHint || (customerId ? await orgIdForCustomer(db, customerId) : null);
      if (!orgId) return { ok: false, error: 'org_not_resolved' };
      await recordInvoiceRow(db, orgId, obj);
      await billingAudit(db, { orgId, actor: null, action: type, next: { status: obj?.status }, source });
      return { ok: true, error: null };
    }
    if (action === 'record_customer') {
      const orgId = orgIdHint; const customerId = String(obj?.id ?? '');
      if (orgId && customerId) await db.from('stripe_customers').upsert({ organization_id: orgId, stripe_customer_id: customerId, email: obj?.email ?? null }, { onConflict: 'organization_id' });
      return { ok: true, error: null };
    }
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'handler_error' };
  }
}

/** Record / increment a failed webhook event in the dead-letter queue. Best-effort. */
export async function recordDeadLetter(db: Db, input: { stripeEventId: string; type: string; orgId: string | null; error: string | null; payload: unknown }): Promise<void> {
  try {
    const { data: existing } = await db.from('webhook_deadletters').select('attempts').eq('stripe_event_id', input.stripeEventId).maybeSingle();
    const attempts = ((existing as { attempts?: number } | null)?.attempts ?? 0) + 1;
    await db.from('webhook_deadletters').upsert({
      stripe_event_id: input.stripeEventId, type: input.type, organization_id: input.orgId,
      attempts, last_error: input.error, payload: input.payload as object, resolved: false,
    }, { onConflict: 'stripe_event_id' });
  } catch {
    /* best-effort */
  }
}
