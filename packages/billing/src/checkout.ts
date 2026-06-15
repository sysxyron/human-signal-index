// =============================================================================
// Checkout session input builder — PURE. Produces the parameter object for a
// Stripe-hosted Checkout session (subscription mode) from validated inputs. The
// web wrapper passes the result straight to stripe.checkout.sessions.create.
// No SDK, no network, no card collection (Stripe-hosted only).
// =============================================================================

import type { PlanSlug } from '@hsi/entitlements';
import type { BillingCycle, CheckoutSessionInput } from './types';

export interface BuildCheckoutArgs {
  customerId: string;
  priceId: string;
  organizationId: string;
  planSlug: PlanSlug;
  billingCycle: BillingCycle;
  successUrl: string;
  cancelUrl: string;
  trialDays?: number; // 0/undefined → no trial
}

export type BuildResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Build a validated Checkout session input. PURE. Never collects card data. */
export function buildCheckoutInput(args: BuildCheckoutArgs): BuildResult<CheckoutSessionInput> {
  if (!args.customerId) return { ok: false, error: 'Missing Stripe customer.' };
  if (!args.priceId) return { ok: false, error: 'This plan has no configured price.' };
  if (!args.successUrl || !args.cancelUrl) return { ok: false, error: 'Missing redirect URLs.' };

  const metadata: Record<string, string> = {
    organization_id: args.organizationId,
    plan_slug: args.planSlug,
    billing_cycle: args.billingCycle,
  };

  const subscription_data: CheckoutSessionInput['subscription_data'] = { metadata };
  if (args.trialDays && args.trialDays > 0) subscription_data.trial_period_days = Math.floor(args.trialDays);

  return {
    ok: true,
    value: {
      mode: 'subscription',
      customer: args.customerId,
      line_items: [{ price: args.priceId, quantity: 1 }],
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
      subscription_data,
      metadata,
      allow_promotion_codes: true,
    },
  };
}
