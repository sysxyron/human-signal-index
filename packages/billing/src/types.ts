// =============================================================================
// @hsi/billing — domain types (HSI Phase 38, v1.1). Stripe-shaped but PURE: these
// describe the data we persist + reason about, independent of the Stripe SDK. The
// web DAL maps live Stripe objects onto these; the engine never imports `stripe`.
// =============================================================================

import type { PlanSlug } from '@hsi/entitlements';

/** Stripe subscription statuses we recognize. */
export type StripeSubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'unpaid'
  | 'paused'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired';

/** Internal per-org subscription status (organization_subscriptions.status). */
export type OrgSubscriptionStatus = 'trial' | 'active' | 'paused' | 'expired';

export type BillingCycle = 'monthly' | 'annual';

/** Per-plan Stripe price wiring, resolved from env (no secrets). */
export interface PlanPricing {
  slug: PlanSlug;
  monthlyPriceId: string | null;
  annualPriceId: string | null;
  monthlyAmount: number; // in minor units (cents)
  annualAmount: number; // in minor units (cents)
  currency: string;
}

/** A normalized snapshot of a Stripe subscription (what we persist + sync from). */
export interface SubscriptionSnapshot {
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  status: StripeSubscriptionStatus;
  planSlug: PlanSlug;
  billingCycle: BillingCycle;
  currentPeriodStart: string | null; // ISO
  currentPeriodEnd: string | null; // ISO
  cancelAtPeriodEnd: boolean;
  trialEnd: string | null; // ISO
}

/** The reconciled DB shape written to organization_subscriptions on sync. */
export interface ReconciledSubscription {
  status: OrgSubscriptionStatus;
  planSlug: PlanSlug; // entitlement plan to apply (community when access inactive)
  billingCycle: BillingCycle;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  accessActive: boolean; // whether paid entitlements apply right now
}

/** Usage counters metered per organization (organization_usage). */
export type UsageMetric = 'signals' | 'investigations' | 'publications' | 'storage' | 'users';

export type UsageCounters = Record<UsageMetric, number>;

export interface InvoiceSummary {
  id: string;
  number: string | null;
  amountDue: number; // minor units
  amountPaid: number; // minor units
  currency: string;
  status: string; // draft|open|paid|void|uncollectible
  createdAt: string | null; // ISO
  hostedInvoiceUrl: string | null;
  pdfUrl: string | null;
}

/** Stripe webhook event types we handle. */
export type BillingWebhookEventType =
  | 'checkout.session.completed'
  | 'customer.created'
  | 'customer.subscription.created'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted'
  | 'invoice.paid'
  | 'invoice.payment_failed';

/** What a webhook event should trigger downstream. */
export type WebhookAction = 'sync_subscription' | 'record_invoice' | 'record_customer' | 'ignore';

export interface CheckoutSessionInput {
  mode: 'subscription';
  customer: string;
  line_items: Array<{ price: string; quantity: number }>;
  success_url: string;
  cancel_url: string;
  subscription_data: { trial_period_days?: number; metadata: Record<string, string> };
  metadata: Record<string, string>;
  allow_promotion_codes: boolean;
}

export interface PortalSessionInput {
  customer: string;
  return_url: string;
}

/** MRR/ARR + distribution snapshot for the revenue dashboard. */
export interface RevenueSnapshot {
  mrr: number; // minor units
  arr: number; // minor units
  currency: string;
  activeOrganizations: number;
  trialingOrganizations: number;
  canceledOrganizations: number;
  pastDueOrganizations: number;
  planDistribution: Record<string, number>;
}
