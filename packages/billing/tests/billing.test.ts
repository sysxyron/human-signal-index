import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolvePlanPricing, priceIdForPlan, planForPriceId, monthlyEquivalentAmount,
  formatAmount, isPurchasablePlan, PAID_PLAN_SLUGS,
} from '../src/stripe';
import {
  mapStripeStatus, isAccessActive, reconcileSubscription, entitlementPlanSlug,
  trialDaysRemaining, isTrialActive, isTrialExpired, trialEndFrom, DEFAULT_TRIAL_DAYS,
} from '../src/subscriptions';
import {
  emptyCounters, normalizeCounters, applyDelta, incrementCounter, decrementCounter,
  resetCounters, isNewBillingPeriod, monthlyRecurringRevenue, annualRecurringRevenue,
  revenueSnapshot, activeOrganizationCount, USAGE_METRICS,
} from '../src/usage';
import { summarizeInvoice, sortInvoices, invoiceDisplayAmount, isInvoicePaid } from '../src/invoices';
import { buildCheckoutInput } from '../src/checkout';
import { buildPortalInput } from '../src/portal';
import { classifyEvent, isHandledEvent, decideProcessing, HANDLED_EVENTS } from '../src/webhooks';
import type { SubscriptionSnapshot, PlanPricing } from '../src/types';

// ---- pricing / stripe config ------------------------------------------------

const ENV = {
  STRIPE_CURRENCY: 'usd',
  STRIPE_PRICE_PROFESSIONAL_MONTHLY: 'price_pro_m',
  STRIPE_PRICE_PROFESSIONAL_ANNUAL: 'price_pro_a',
  STRIPE_AMOUNT_PROFESSIONAL_MONTHLY: '4900',
  STRIPE_AMOUNT_PROFESSIONAL_ANNUAL: '49000',
  STRIPE_PRICE_ENTERPRISE_MONTHLY: 'price_ent_m',
  STRIPE_AMOUNT_ENTERPRISE_MONTHLY: '29900',
};
const PRICING = resolvePlanPricing(ENV);

test('resolvePlanPricing builds paid plans only, with price + amount wiring', () => {
  assert.deepEqual(PRICING.map((p) => p.slug), PAID_PLAN_SLUGS);
  const pro = PRICING.find((p) => p.slug === 'professional')!;
  assert.equal(pro.monthlyPriceId, 'price_pro_m');
  assert.equal(pro.annualPriceId, 'price_pro_a');
  assert.equal(pro.monthlyAmount, 4900);
  assert.equal(pro.currency, 'usd');
  // unconfigured plan → null price ids, 0 amounts (graceful)
  const gov = PRICING.find((p) => p.slug === 'government')!;
  assert.equal(gov.monthlyPriceId, null);
  assert.equal(gov.monthlyAmount, 0);
});

test('priceIdForPlan + planForPriceId round-trip', () => {
  assert.equal(priceIdForPlan(PRICING, 'professional', 'monthly'), 'price_pro_m');
  assert.equal(priceIdForPlan(PRICING, 'professional', 'annual'), 'price_pro_a');
  assert.equal(priceIdForPlan(PRICING, 'government', 'monthly'), null);
  assert.deepEqual(planForPriceId(PRICING, 'price_pro_a'), { slug: 'professional', cycle: 'annual' });
  assert.equal(planForPriceId(PRICING, 'price_unknown'), null);
});

test('monthlyEquivalentAmount divides annual by 12', () => {
  assert.equal(monthlyEquivalentAmount(PRICING, 'professional', 'monthly'), 4900);
  assert.equal(monthlyEquivalentAmount(PRICING, 'professional', 'annual'), Math.round(49000 / 12));
});

test('formatAmount: deterministic currency formatting', () => {
  assert.equal(formatAmount(4900, 'usd'), '$49.00');
  assert.equal(formatAmount(1234567, 'usd'), '$12,345.67');
  assert.equal(formatAmount(0, 'usd'), '$0.00');
  assert.equal(formatAmount(29900, 'eur'), 'EUR 299.00');
});

test('isPurchasablePlan: community is not purchasable', () => {
  assert.ok(isPurchasablePlan('professional'));
  assert.ok(isPurchasablePlan('enterprise'));
  assert.ok(!isPurchasablePlan('community'));
  assert.ok(!isPurchasablePlan('bogus'));
});

// ---- subscription status mapping --------------------------------------------

test('mapStripeStatus covers every status', () => {
  assert.equal(mapStripeStatus('trialing'), 'trial');
  assert.equal(mapStripeStatus('active'), 'active');
  assert.equal(mapStripeStatus('past_due'), 'active'); // grace
  assert.equal(mapStripeStatus('unpaid'), 'paused');
  assert.equal(mapStripeStatus('paused'), 'paused');
  assert.equal(mapStripeStatus('canceled'), 'expired');
  assert.equal(mapStripeStatus('incomplete'), 'expired');
  assert.equal(mapStripeStatus('incomplete_expired'), 'expired');
});

test('isAccessActive: trial/active/past_due keep access; others lose it', () => {
  for (const s of ['trialing', 'active', 'past_due'] as const) assert.ok(isAccessActive(s));
  for (const s of ['unpaid', 'paused', 'canceled', 'incomplete', 'incomplete_expired'] as const) assert.ok(!isAccessActive(s));
});

const SNAP = (over: Partial<SubscriptionSnapshot> = {}): SubscriptionSnapshot => ({
  stripeSubscriptionId: 'sub_1', stripeCustomerId: 'cus_1', status: 'active', planSlug: 'professional',
  billingCycle: 'monthly', currentPeriodStart: '2026-06-01T00:00:00.000Z', currentPeriodEnd: '2026-07-01T00:00:00.000Z',
  cancelAtPeriodEnd: false, trialEnd: null, ...over,
});

test('reconcileSubscription: active keeps plan; lapsed falls back to community', () => {
  const active = reconcileSubscription(SNAP({ status: 'active' }));
  assert.equal(active.status, 'active');
  assert.equal(active.planSlug, 'professional');
  assert.equal(active.accessActive, true);

  const canceled = reconcileSubscription(SNAP({ status: 'canceled' }));
  assert.equal(canceled.status, 'expired');
  assert.equal(canceled.planSlug, 'community'); // no premium for lapsed orgs
  assert.equal(canceled.accessActive, false);
});

test('entitlementPlanSlug falls back to community when access inactive', () => {
  assert.equal(entitlementPlanSlug(SNAP({ status: 'trialing' })), 'professional');
  assert.equal(entitlementPlanSlug(SNAP({ status: 'unpaid' })), 'community');
});

// ---- trials -----------------------------------------------------------------

test('trial math: days remaining, active, expired', () => {
  const now = '2026-06-10T00:00:00.000Z';
  assert.equal(trialDaysRemaining('2026-06-20T00:00:00.000Z', now), 10);
  assert.equal(trialDaysRemaining('2026-06-10T00:00:00.000Z', now), 0);
  assert.equal(trialDaysRemaining(null, now), 0);
  assert.ok(isTrialActive('2026-06-20T00:00:00.000Z', now));
  assert.ok(!isTrialActive('2026-06-01T00:00:00.000Z', now));
  assert.ok(isTrialExpired('2026-06-01T00:00:00.000Z', now));
  assert.ok(!isTrialExpired(null, now));
});

test('trialEndFrom adds default 14 days', () => {
  assert.equal(DEFAULT_TRIAL_DAYS, 14);
  assert.equal(trialEndFrom('2026-06-01T00:00:00.000Z'), '2026-06-15T00:00:00.000Z');
  assert.equal(trialEndFrom('2026-06-01T00:00:00.000Z', 7), '2026-06-08T00:00:00.000Z');
});

// ---- usage metering ---------------------------------------------------------

test('counters: empty, normalize, increment/decrement floor at 0', () => {
  assert.deepEqual(Object.keys(emptyCounters()).sort(), [...USAGE_METRICS].sort());
  const n = normalizeCounters({ signals: 5, investigations: -3, users: 2.9 });
  assert.equal(n.signals, 5);
  assert.equal(n.investigations, 0); // floored
  assert.equal(n.users, 2);
  let c = emptyCounters();
  c = incrementCounter(c, 'signals', 3);
  assert.equal(c.signals, 3);
  c = decrementCounter(c, 'signals', 10);
  assert.equal(c.signals, 0); // floored
  c = applyDelta(c, 'publications', 4);
  assert.equal(c.publications, 4);
  assert.deepEqual(resetCounters(), emptyCounters());
});

test('isNewBillingPeriod: month/year rollover', () => {
  assert.ok(isNewBillingPeriod(null, '2026-06-10T00:00:00Z')); // never reset
  assert.ok(isNewBillingPeriod('2026-05-31T23:00:00Z', '2026-06-01T00:00:00Z')); // new month
  assert.ok(isNewBillingPeriod('2025-12-31T00:00:00Z', '2026-01-01T00:00:00Z')); // new year
  assert.ok(!isNewBillingPeriod('2026-06-01T00:00:00Z', '2026-06-28T00:00:00Z')); // same month
});

// ---- revenue ----------------------------------------------------------------

const SUBS = [
  { status: 'active', planSlug: 'professional', billingCycle: 'monthly' as const },
  { status: 'active', planSlug: 'enterprise', billingCycle: 'monthly' as const },
  { status: 'trial', planSlug: 'professional', billingCycle: 'monthly' as const },
  { status: 'past_due', planSlug: 'professional', billingCycle: 'annual' as const },
  { status: 'canceled', planSlug: 'professional', billingCycle: 'monthly' as const },
];

test('MRR counts paying (active + past_due) only; trials/canceled excluded', () => {
  const mrr = monthlyRecurringRevenue(SUBS, PRICING);
  // pro monthly 4900 + ent monthly 29900 + pro annual (49000/12=4083) = 38883
  assert.equal(mrr, 4900 + 29900 + Math.round(49000 / 12));
  assert.equal(annualRecurringRevenue(SUBS, PRICING), mrr * 12);
});

test('revenueSnapshot tallies states + plan distribution', () => {
  const snap = revenueSnapshot(SUBS, PRICING);
  assert.equal(snap.activeOrganizations, 2);
  assert.equal(snap.trialingOrganizations, 1);
  assert.equal(snap.pastDueOrganizations, 1);
  assert.equal(snap.canceledOrganizations, 1);
  assert.equal(snap.planDistribution.professional, 4);
  assert.equal(snap.planDistribution.enterprise, 1);
  assert.equal(snap.mrr, monthlyRecurringRevenue(SUBS, PRICING));
  assert.equal(activeOrganizationCount(SUBS), 4); // active+trial+past_due
});

// ---- invoices ---------------------------------------------------------------

test('summarizeInvoice normalizes + sorts + formats', () => {
  const inv = summarizeInvoice({ id: 'in_1', number: 'A-1', amount_due: 4900, amount_paid: 4900, currency: 'USD', status: 'paid', created: 1_700_000_000, hosted_invoice_url: 'https://stripe/inv', invoice_pdf: 'https://stripe/pdf' });
  assert.equal(inv.currency, 'usd');
  assert.equal(inv.createdAt, new Date(1_700_000_000 * 1000).toISOString());
  assert.ok(isInvoicePaid(inv));
  assert.equal(invoiceDisplayAmount(inv), '$49.00');
  const open = summarizeInvoice({ id: 'in_2', amount_due: 1000, status: 'open', created: 1_800_000_000 });
  assert.equal(invoiceDisplayAmount(open), '$10.00');
  const sorted = sortInvoices([inv, open]);
  assert.equal(sorted[0].id, 'in_2'); // newer first
});

// ---- checkout + portal ------------------------------------------------------

test('buildCheckoutInput: valid subscription session, no card collection', () => {
  const r = buildCheckoutInput({ customerId: 'cus_1', priceId: 'price_pro_m', organizationId: 'org_1', planSlug: 'professional', billingCycle: 'monthly', successUrl: 'https://app/s', cancelUrl: 'https://app/c', trialDays: 14 });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.value.mode, 'subscription');
    assert.equal(r.value.line_items[0].price, 'price_pro_m');
    assert.equal(r.value.subscription_data.trial_period_days, 14);
    assert.equal(r.value.metadata.organization_id, 'org_1');
    assert.equal(r.value.allow_promotion_codes, true);
  }
});

test('buildCheckoutInput: rejects missing price/customer/urls', () => {
  assert.equal(buildCheckoutInput({ customerId: '', priceId: 'p', organizationId: 'o', planSlug: 'professional', billingCycle: 'monthly', successUrl: 's', cancelUrl: 'c' }).ok, false);
  assert.equal(buildCheckoutInput({ customerId: 'c', priceId: '', organizationId: 'o', planSlug: 'professional', billingCycle: 'monthly', successUrl: 's', cancelUrl: 'c' }).ok, false);
  const noTrial = buildCheckoutInput({ customerId: 'c', priceId: 'p', organizationId: 'o', planSlug: 'professional', billingCycle: 'monthly', successUrl: 's', cancelUrl: 'c' });
  assert.ok(noTrial.ok && noTrial.value.subscription_data.trial_period_days === undefined);
});

test('buildPortalInput validates', () => {
  assert.ok(buildPortalInput('cus_1', 'https://app/billing').ok);
  assert.equal(buildPortalInput('', 'https://app/billing').ok, false);
  assert.equal(buildPortalInput('cus_1', '').ok, false);
});

// ---- webhooks: classification + replay protection ---------------------------

test('isHandledEvent + classifyEvent map every handled type', () => {
  assert.equal(HANDLED_EVENTS.size, 7);
  assert.equal(classifyEvent('checkout.session.completed'), 'sync_subscription');
  assert.equal(classifyEvent('customer.subscription.updated'), 'sync_subscription');
  assert.equal(classifyEvent('customer.subscription.deleted'), 'sync_subscription');
  assert.equal(classifyEvent('invoice.paid'), 'record_invoice');
  assert.equal(classifyEvent('invoice.payment_failed'), 'record_invoice');
  assert.equal(classifyEvent('customer.created'), 'record_customer');
  assert.equal(classifyEvent('charge.refunded'), 'ignore');
  assert.ok(!isHandledEvent('charge.refunded'));
});

test('decideProcessing: replay protection + unhandled filtering', () => {
  const seen = new Set(['evt_seen']);
  assert.deepEqual(decideProcessing('evt_new', 'invoice.paid', seen), { process: true, reason: 'new' });
  assert.deepEqual(decideProcessing('evt_seen', 'invoice.paid', seen), { process: false, reason: 'duplicate' });
  assert.deepEqual(decideProcessing('evt_x', 'charge.refunded', seen), { process: false, reason: 'unhandled' });
  assert.deepEqual(decideProcessing('', 'invoice.paid', seen), { process: false, reason: 'duplicate' });
});
