import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeRevenueMetrics, currentMrr, mrrByOrg } from '../src/revenue';
import { computeChurnRisk, churnRate } from '../src/churn';
import { computeSubscriptionHealth } from '../src/health';
import { computeLTV, DEFAULT_EXPECTED_LIFETIME_MONTHS } from '../src/ltv';
import { computeCohorts, monthBucket } from '../src/cohorts';
import { computeUsageRollup, addRollups, trackOverages, hasOverage } from '../src/usage-rollups';
import { planChangeKind, resolveChangeTiming, calculateProration, summarizeBillingOps, prorationBehavior } from '../src/billing-ops';
import { decideReplay, isDeadLettered, summarizeWebhookOps, nextAttempt, MAX_REPLAY_ATTEMPTS } from '../src/webhook-ops';
import { computeForecast, trailingGrowthRate } from '../src/forecasting';
import { defaultEntitlements } from '@hsi/entitlements';
import type { OpsSubscription } from '../src/types';

const sub = (over: Partial<OpsSubscription>): OpsSubscription => ({
  organizationId: 'o', planSlug: 'professional', status: 'active', billingCycle: 'monthly',
  mrr: 4900, startedAt: '2026-01-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z', ...over,
});

// ---- revenue ----------------------------------------------------------------

test('currentMrr sums paying subs only', () => {
  const subs = [sub({ organizationId: 'a', mrr: 4900 }), sub({ organizationId: 'b', status: 'trial', mrr: 4900 }), sub({ organizationId: 'c', status: 'past_due', mrr: 1000 })];
  assert.equal(currentMrr(subs), 5900); // trial excluded; past_due counts
});

test('computeRevenueMetrics: expansion / contraction / churn / growth', () => {
  const subs = [
    sub({ organizationId: 'a', mrr: 9900 }), // was 4900 → +5000 expansion
    sub({ organizationId: 'b', mrr: 1000 }), // was 4900 → -3900 contraction
    sub({ organizationId: 'c', status: 'active', mrr: 4900 }), // new (was 0) → net-new, not expansion
  ];
  const prior = { a: 4900, b: 4900, d: 2000 }; // d churned (gone)
  const m = computeRevenueMetrics(subs, prior, 'usd');
  assert.equal(m.mrr, 9900 + 1000 + 4900);
  assert.equal(m.expansionRevenue, 5000);
  assert.equal(m.contractionRevenue, 3900);
  assert.equal(m.churnedRevenue, 2000);
  assert.equal(m.netNewRevenue, 5000 - 3900 - 2000);
  assert.equal(m.arr, m.mrr * 12);
  assert.ok(m.growthRate > 0);
  assert.deepEqual(mrrByOrg([sub({ organizationId: 'x', mrr: 100 })]), { x: 100 });
});

// ---- churn ------------------------------------------------------------------

test('computeChurnRisk: high when usage collapses + inactive + failures', () => {
  const a = computeChurnRisk({ usageTrend: -0.9, daysSinceActivity: 30, paymentFailures: 2, trialDaysRemaining: 0, isTrialing: false });
  assert.equal(a.risk, 'high');
  assert.ok(a.score >= 60);
  assert.ok(a.reasons.length >= 2);
});
test('computeChurnRisk: low for healthy engagement', () => {
  const a = computeChurnRisk({ usageTrend: 0.2, daysSinceActivity: 1, paymentFailures: 0, trialDaysRemaining: 0, isTrialing: false });
  assert.equal(a.risk, 'low');
  assert.ok(a.score < 30);
});
test('computeChurnRisk: expiring trial adds risk; churnRate aggregates', () => {
  const a = computeChurnRisk({ usageTrend: 0, daysSinceActivity: 0, paymentFailures: 0, trialDaysRemaining: 2, isTrialing: true });
  assert.ok(a.score >= 15);
  assert.equal(churnRate([{ risk: 'high', score: 80, reasons: [] }, { risk: 'low', score: 5, reasons: [] }]), 0.5);
});

// ---- health -----------------------------------------------------------------

test('computeSubscriptionHealth: healthy vs at-risk', () => {
  const healthy = computeSubscriptionHealth({ activeUsers: 12, usageTrend: 0.3, daysSinceLogin: 1, contentCreated: 20, investigationActivity: 6, publicationActivity: 5 });
  assert.equal(healthy.status, 'healthy');
  assert.ok(healthy.score >= 65);
  const atRisk = computeSubscriptionHealth({ activeUsers: 0, usageTrend: -0.8, daysSinceLogin: 45, contentCreated: 0, investigationActivity: 0, publicationActivity: 0 });
  assert.equal(atRisk.status, 'at-risk');
  assert.ok(atRisk.reasons.length >= 2);
});

// ---- ltv --------------------------------------------------------------------

test('computeLTV: duration, average, projection', () => {
  const ltv = computeLTV({ totalRevenue: 58800, startedAt: '2026-01-01T00:00:00Z', nowISO: '2026-07-01T00:00:00Z', currentMrr: 9900 });
  assert.equal(ltv.totalRevenue, 58800);
  assert.ok(ltv.subscriptionMonths >= 5.5 && ltv.subscriptionMonths <= 6.5);
  assert.ok(ltv.averageMonthlyRevenue > 0);
  assert.equal(ltv.projectedValue, 58800 + 9900 * DEFAULT_EXPECTED_LIFETIME_MONTHS);
});
test('computeLTV: no start → 1 month floor, no crash', () => {
  const ltv = computeLTV({ totalRevenue: 1000, startedAt: null, nowISO: '2026-07-01T00:00:00Z' });
  assert.equal(ltv.subscriptionMonths, 1);
  assert.equal(ltv.averageMonthlyRevenue, 1000);
});

// ---- cohorts ----------------------------------------------------------------

test('computeCohorts: groups by signup month with retention/engagement', () => {
  const rows = computeCohorts([
    { organizationId: 'a', signupMonth: '2026-01', activationMonth: '2026-01', planSlug: 'professional', retained: true, engaged: true },
    { organizationId: 'b', signupMonth: '2026-01', activationMonth: null, planSlug: 'community', retained: false, engaged: false },
    { organizationId: 'c', signupMonth: '2026-02', activationMonth: '2026-02', planSlug: 'enterprise', retained: true, engaged: false },
  ], 'signup_month');
  const jan = rows.find((r) => r.cohort === '2026-01')!;
  assert.equal(jan.size, 2);
  assert.equal(jan.retained, 1);
  assert.equal(jan.churned, 1);
  assert.equal(jan.retentionRate, 0.5);
  assert.equal(jan.engagementRate, 0.5);
  assert.equal(rows[0].cohort, '2026-01'); // sorted
  assert.equal(monthBucket('2026-03-15T00:00:00Z'), '2026-03');
  assert.equal(monthBucket(null), null);
});
test('computeCohorts: group by plan', () => {
  const rows = computeCohorts([
    { organizationId: 'a', signupMonth: null, activationMonth: null, planSlug: 'professional', retained: true, engaged: true },
    { organizationId: 'b', signupMonth: null, activationMonth: null, planSlug: 'professional', retained: false, engaged: false },
  ], 'plan');
  assert.equal(rows[0].cohort, 'professional');
  assert.equal(rows[0].retentionRate, 0.5);
});

// ---- usage rollups + overages ----------------------------------------------

test('computeUsageRollup + addRollups floor and sum', () => {
  const cur = computeUsageRollup('current_month', { signals: 10, investigations: -3, publications: 2, storage: 1000, users: 4 });
  assert.equal(cur.investigations, 0); // floored
  assert.equal(cur.signals, 10);
  const sum = addRollups({ signals: 10, investigations: 0, publications: 2, storage: 1000, users: 4 }, { signals: 5, publications: 1 });
  assert.equal(sum.signals, 15);
  assert.equal(sum.publications, 3);
});

test('trackOverages: over a tight limit; unlimited → 0', () => {
  const ents = [
    { featureKey: 'contributors_limit' as const, enabled: true, limitValue: 5 },
    { featureKey: 'publications_limit' as const, enabled: true, limitValue: null },
    { featureKey: 'investigations_limit' as const, enabled: true, limitValue: 10 },
  ];
  const rows = trackOverages(ents, { signals: 0, investigations: 12, publications: 100, storage: 0, users: 8 });
  const users = rows.find((r) => r.metric === 'users')!;
  assert.equal(users.overage, 3); // 8 - 5
  const pubs = rows.find((r) => r.metric === 'publications')!;
  assert.equal(pubs.overage, 0); // unlimited
  const inv = rows.find((r) => r.metric === 'investigations')!;
  assert.equal(inv.overage, 2);
  assert.ok(hasOverage(rows));
});

test('trackOverages: community high limits → no overage', () => {
  const rows = trackOverages(defaultEntitlements('community'), { signals: 0, investigations: 50, publications: 50, storage: 0, users: 50 });
  assert.equal(hasOverage(rows), false);
});

// ---- proration / billing-ops ------------------------------------------------

test('planChangeKind + timing', () => {
  assert.equal(planChangeKind('community', 'professional'), 'upgrade');
  assert.equal(planChangeKind('enterprise', 'professional'), 'downgrade');
  assert.equal(planChangeKind('professional', 'professional'), 'none');
  assert.equal(resolveChangeTiming('upgrade'), 'immediate');
  assert.equal(resolveChangeTiming('downgrade'), 'next_cycle');
  assert.equal(prorationBehavior('upgrade'), 'create_prorations');
  assert.equal(prorationBehavior('downgrade'), 'none');
});

test('calculateProration: upgrade nets immediately, downgrade defers', () => {
  const up = calculateProration({ currentAmount: 4900, newAmount: 29900, daysRemaining: 15, periodDays: 30, currentSlug: 'professional', newSlug: 'enterprise' });
  assert.equal(up.kind, 'upgrade');
  assert.equal(up.immediate, true);
  assert.equal(up.credit, Math.round(4900 * 0.5));
  assert.equal(up.charge, Math.round(29900 * 0.5));
  assert.equal(up.netAmount, up.charge - up.credit);
  const down = calculateProration({ currentAmount: 29900, newAmount: 4900, daysRemaining: 15, periodDays: 30, currentSlug: 'enterprise', newSlug: 'professional' });
  assert.equal(down.timing, 'next_cycle');
  assert.equal(down.netAmount, 0);
  assert.equal(down.immediate, false);
});

test('summarizeBillingOps tallies the base', () => {
  const s = summarizeBillingOps([
    sub({ status: 'active' }), sub({ status: 'trial' }), sub({ status: 'past_due' }),
    sub({ status: 'paused' }), sub({ status: 'canceled' }), sub({ status: 'expired' }),
  ], 3);
  assert.equal(s.active, 1); assert.equal(s.trialing, 1); assert.equal(s.pastDue, 1);
  assert.equal(s.paused, 1); assert.equal(s.canceled, 2); assert.equal(s.paymentFailures, 3);
});

// ---- webhook ops ------------------------------------------------------------

test('decideReplay: eligible / max attempts / unknown', () => {
  assert.deepEqual(decideReplay({ stripeEventId: 'e', type: 'invoice.paid', attempts: 1, lastError: 'x' }), { replay: true, reason: 'eligible' });
  assert.deepEqual(decideReplay({ stripeEventId: 'e', type: 'invoice.paid', attempts: MAX_REPLAY_ATTEMPTS, lastError: 'x' }), { replay: false, reason: 'max_attempts' });
  assert.deepEqual(decideReplay({ stripeEventId: 'e', type: 'charge.refunded', attempts: 0, lastError: 'x' }), { replay: false, reason: 'unknown_event' });
  assert.ok(isDeadLettered({ stripeEventId: 'e', type: 'invoice.paid', attempts: MAX_REPLAY_ATTEMPTS, lastError: 'x' }));
  assert.equal(nextAttempt(2), 3);
});

test('summarizeWebhookOps tallies processed/failed/deadletter/replayable', () => {
  const s = summarizeWebhookOps([
    { processed: true, error: null, type: 'invoice.paid', attempts: 1 },
    { processed: false, error: 'boom', type: 'invoice.paid', attempts: 1 }, // replayable
    { processed: false, error: 'boom', type: 'invoice.paid', attempts: MAX_REPLAY_ATTEMPTS }, // deadlettered
    { processed: false, error: 'boom', type: 'charge.refunded', attempts: 1 }, // unknown → not replayable
  ]);
  assert.equal(s.processed, 1);
  assert.equal(s.failed, 3);
  assert.equal(s.deadLettered, 1);
  assert.equal(s.replayable, 1);
});

// ---- forecasting ------------------------------------------------------------

test('trailingGrowthRate + computeForecast project next month/quarter', () => {
  assert.equal(trailingGrowthRate([]), 0);
  assert.ok(trailingGrowthRate([1000, 1100, 1200]) > 0);
  const f = computeForecast({ mrrHistory: [10000, 11000, 12000], churnRate: 0.05, currency: 'usd' });
  assert.ok(f.nextMonthMrr >= 12000); // growth outpaces churn here
  assert.ok(f.nextQuarterArr > 0);
  assert.ok(f.churnProjection === Math.round(12000 * 0.05));
  assert.equal(f.currency, 'usd');
});
test('computeForecast: flat history + churn → decline', () => {
  const f = computeForecast({ mrrHistory: [10000, 10000], churnRate: 0.1 });
  assert.ok(f.nextMonthMrr < 10000);
  assert.equal(f.churnProjection, 1000);
});
