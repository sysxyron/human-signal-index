// =============================================================================
// HSI Phase 38 — Stripe SDK boundary. SERVER-ONLY. The ONLY module that touches
// the `stripe` package + STRIPE_SECRET_KEY. Lazily loads the SDK via a non-literal
// specifier so the app typechecks + builds whether or not `stripe` is installed
// (mirrors the Supabase env-tolerance pattern). Every call degrades to null when
// billing is unconfigured — callers map that to a friendly DbResult. The secret
// key + webhook secret never leave the server; no key is ever returned to a caller.
// =============================================================================

import { STRIPE_API_VERSION, resolvePlanPricing } from '@hsi/billing';
import type { PlanPricing } from '@hsi/billing';

/* eslint-disable @typescript-eslint/no-explicit-any */
type StripeLike = any;

/** True when a Stripe secret key is configured (real, not placeholder). */
export function stripeConfigured(): boolean {
  const key = process.env.STRIPE_SECRET_KEY ?? '';
  return key.trim().length > 0 && !/placeholder|sk_test_xxx/i.test(key);
}

/** True when the webhook signing secret is configured. */
export function webhookConfigured(): boolean {
  return Boolean(process.env.STRIPE_WEBHOOK_SECRET && process.env.STRIPE_WEBHOOK_SECRET.trim().length > 0);
}

/** Resolved plan→price wiring (price IDs only; no secrets). */
export function getPricing(): PlanPricing[] {
  return resolvePlanPricing(process.env as Record<string, string | undefined>);
}

/** Base app URL for building success/cancel/return URLs. */
export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

let _client: StripeLike | null = null;
/**
 * Lazily construct the Stripe client, or null when unconfigured / SDK absent.
 * Uses a non-literal specifier so neither tsc nor webpack hard-resolves `stripe`.
 */
export async function getStripe(): Promise<StripeLike | null> {
  if (!stripeConfigured()) return null;
  if (_client) return _client;
  try {
    const spec = process.env.STRIPE_MODULE_SPECIFIER || 'stripe';
    const mod: any = await import(/* @vite-ignore */ spec);
    const Stripe = mod.default ?? mod;
    _client = new Stripe(process.env.STRIPE_SECRET_KEY as string, { apiVersion: STRIPE_API_VERSION });
    return _client;
  } catch {
    return null;
  }
}

// ---- thin SDK operations (return plain data or null) ------------------------

/** Create (or look up by email) a Stripe customer. Returns its id, or null. */
export async function sdkCreateCustomer(input: { orgId: string; name: string; email: string | null }): Promise<string | null> {
  const stripe = await getStripe();
  if (!stripe) return null;
  try {
    const customer = await stripe.customers.create({
      name: input.name,
      email: input.email ?? undefined,
      metadata: { organization_id: input.orgId },
    });
    return customer?.id ?? null;
  } catch {
    return null;
  }
}

/** Create a Stripe-hosted Checkout session from a prebuilt input. Returns the URL. */
export async function sdkCreateCheckout(params: Record<string, unknown>): Promise<string | null> {
  const stripe = await getStripe();
  if (!stripe) return null;
  try {
    const session = await stripe.checkout.sessions.create(params);
    return session?.url ?? null;
  } catch {
    return null;
  }
}

/** Create a Billing Portal session. Returns the URL. */
export async function sdkCreatePortal(params: Record<string, unknown>): Promise<string | null> {
  const stripe = await getStripe();
  if (!stripe) return null;
  try {
    const session = await stripe.billingPortal.sessions.create(params);
    return session?.url ?? null;
  } catch {
    return null;
  }
}

/** Retrieve a subscription object (raw). Returns null when unavailable. */
export async function sdkGetSubscription(subscriptionId: string): Promise<StripeLike | null> {
  const stripe = await getStripe();
  if (!stripe) return null;
  try {
    return await stripe.subscriptions.retrieve(subscriptionId);
  } catch {
    return null;
  }
}

/**
 * Update a subscription's price (plan change). Stripe computes the authoritative
 * proration via `proration_behavior`. `whenAtPeriodEnd` defers downgrades. Returns
 * the updated subscription, or null.
 */
export async function sdkUpdateSubscriptionPlan(input: {
  subscriptionId: string; newPriceId: string; prorationBehavior: 'create_prorations' | 'none'; atPeriodEnd: boolean;
}): Promise<StripeLike | null> {
  const stripe = await getStripe();
  if (!stripe) return null;
  try {
    const current = await stripe.subscriptions.retrieve(input.subscriptionId);
    const itemId = current?.items?.data?.[0]?.id;
    if (!itemId) return null;
    return await stripe.subscriptions.update(input.subscriptionId, {
      items: [{ id: itemId, price: input.newPriceId }],
      proration_behavior: input.prorationBehavior,
      ...(input.atPeriodEnd ? { billing_cycle_anchor: 'unchanged', cancel_at_period_end: false } : {}),
    });
  } catch {
    return null;
  }
}

/** List a customer's invoices (raw). Returns []. */
export async function sdkListInvoices(customerId: string, limit = 20): Promise<StripeLike[]> {
  const stripe = await getStripe();
  if (!stripe) return [];
  try {
    const res = await stripe.invoices.list({ customer: customerId, limit });
    return (res?.data ?? []) as StripeLike[];
  } catch {
    return [];
  }
}

/**
 * Verify + parse a webhook payload. Returns the event, or null when the signature
 * is invalid / unconfigured. The raw body + signature header come from the route.
 */
export async function sdkConstructEvent(rawBody: string, signature: string): Promise<StripeLike | null> {
  const stripe = await getStripe();
  if (!stripe || !webhookConfigured()) return null;
  try {
    return stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET as string);
  } catch {
    return null; // invalid signature → reject
  }
}
