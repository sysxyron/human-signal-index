import { test } from 'node:test';
import assert from 'node:assert/strict';

// Relative imports only — the root test runner does not resolve the `@/` alias.
import { snapshotFromStripeSubscription } from './sync';
import { resolvePlanPricing, reconcileSubscription } from '@hsi/billing';

const PRICING = resolvePlanPricing({
  STRIPE_PRICE_PROFESSIONAL_MONTHLY: 'price_pro_m',
  STRIPE_PRICE_PROFESSIONAL_ANNUAL: 'price_pro_a',
  STRIPE_PRICE_ENTERPRISE_MONTHLY: 'price_ent_m',
});

test('snapshotFromStripeSubscription maps a raw Stripe subscription', () => {
  const raw = {
    id: 'sub_123', customer: 'cus_123', status: 'active', cancel_at_period_end: false,
    current_period_start: 1_750_000_000, current_period_end: 1_752_592_000, trial_end: null,
    items: { data: [{ price: { id: 'price_pro_m', recurring: { interval: 'month' } } }] },
  };
  const snap = snapshotFromStripeSubscription(raw, PRICING);
  assert.ok(snap);
  assert.equal(snap!.stripeSubscriptionId, 'sub_123');
  assert.equal(snap!.stripeCustomerId, 'cus_123');
  assert.equal(snap!.planSlug, 'professional');
  assert.equal(snap!.billingCycle, 'monthly');
  assert.equal(snap!.currentPeriodStart, new Date(1_750_000_000 * 1000).toISOString());
  assert.equal(snap!.cancelAtPeriodEnd, false);
});

test('annual price resolves to annual cycle; unknown price falls back', () => {
  const annual = snapshotFromStripeSubscription(
    { id: 's', customer: 'c', status: 'trialing', items: { data: [{ price: { id: 'price_pro_a', recurring: { interval: 'year' } } }] } },
    PRICING,
  );
  assert.equal(annual!.billingCycle, 'annual');
  assert.equal(annual!.planSlug, 'professional');

  const unknown = snapshotFromStripeSubscription(
    { id: 's2', customer: 'c2', status: 'active', items: { data: [{ price: { id: 'price_unknown', recurring: { interval: 'year' } } }] } },
    PRICING,
  );
  assert.equal(unknown!.billingCycle, 'annual'); // from interval
  assert.equal(unknown!.planSlug, 'professional'); // default when unmapped
});

test('null raw → null snapshot (graceful)', () => {
  assert.equal(snapshotFromStripeSubscription(null, PRICING), null);
  assert.equal(snapshotFromStripeSubscription({}, PRICING), null);
});

test('canceled snapshot reconciles to community (no premium for lapsed orgs)', () => {
  const snap = snapshotFromStripeSubscription(
    { id: 's3', customer: 'c3', status: 'canceled', items: { data: [{ price: { id: 'price_ent_m', recurring: { interval: 'month' } } }] } },
    PRICING,
  );
  const reconciled = reconcileSubscription(snap!);
  assert.equal(reconciled.status, 'expired');
  assert.equal(reconciled.planSlug, 'community');
  assert.equal(reconciled.accessActive, false);
});
