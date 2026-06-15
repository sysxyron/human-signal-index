// =============================================================================
// Usage metering math + revenue rollups — PURE. Increment/decrement/reset of
// per-org counters, billing-period rollover detection, and MRR/ARR/distribution
// computation. No DB, no Date.now() (callers pass nowISO).
// =============================================================================

import type {
  BillingCycle,
  PlanPricing,
  RevenueSnapshot,
  UsageCounters,
  UsageMetric,
} from './types';
import { monthlyEquivalentAmount } from './stripe';

export const USAGE_METRICS: UsageMetric[] = ['signals', 'investigations', 'publications', 'storage', 'users'];

/** A zeroed counter set. PURE. */
export function emptyCounters(): UsageCounters {
  return { signals: 0, investigations: 0, publications: 0, storage: 0, users: 0 };
}

/** Normalize an arbitrary record into full counters (missing → 0, floored ≥0). PURE. */
export function normalizeCounters(input: Partial<Record<UsageMetric, number>> | null | undefined): UsageCounters {
  const out = emptyCounters();
  if (!input) return out;
  for (const m of USAGE_METRICS) out[m] = Math.max(0, Math.floor(Number(input[m] ?? 0)) || 0);
  return out;
}

/** Apply a signed delta to one metric, flooring at 0. PURE. */
export function applyDelta(counters: UsageCounters, metric: UsageMetric, delta: number): UsageCounters {
  const next = { ...counters };
  next[metric] = Math.max(0, (counters[metric] ?? 0) + Math.floor(delta));
  return next;
}

export function incrementCounter(counters: UsageCounters, metric: UsageMetric, by = 1): UsageCounters {
  return applyDelta(counters, metric, Math.abs(Math.floor(by)));
}
export function decrementCounter(counters: UsageCounters, metric: UsageMetric, by = 1): UsageCounters {
  return applyDelta(counters, metric, -Math.abs(Math.floor(by)));
}

/** Reset all counters to zero (monthly reset). PURE. */
export function resetCounters(): UsageCounters {
  return emptyCounters();
}

// ---- billing period rollover ------------------------------------------------

/**
 * Is nowISO in a later calendar month/year than lastResetISO? Drives monthly
 * usage reset. Null/blank last-reset → true (never reset). PURE.
 */
export function isNewBillingPeriod(lastResetISO: string | null, nowISO: string): boolean {
  if (!lastResetISO) return true;
  const last = new Date(lastResetISO);
  const now = new Date(nowISO);
  if (Number.isNaN(last.getTime()) || Number.isNaN(now.getTime())) return false;
  return now.getUTCFullYear() > last.getUTCFullYear() ||
    (now.getUTCFullYear() === last.getUTCFullYear() && now.getUTCMonth() > last.getUTCMonth());
}

// ---- revenue rollups --------------------------------------------------------

export interface BillableSubscription {
  status: string; // internal or stripe-ish status string
  planSlug: string;
  billingCycle: BillingCycle;
}

const ACTIVE_STATES = new Set(['active', 'trial', 'trialing', 'past_due']);

/**
 * Monthly Recurring Revenue (minor units): sum of monthly-equivalent amounts for
 * revenue-bearing subscriptions. Trials count toward "active orgs" but NOT MRR
 * (no revenue yet). PURE.
 */
export function monthlyRecurringRevenue(subs: BillableSubscription[], pricing: PlanPricing[]): number {
  let mrr = 0;
  for (const s of subs) {
    if (s.status !== 'active' && s.status !== 'past_due') continue; // paying only
    mrr += monthlyEquivalentAmount(pricing, s.planSlug as never, s.billingCycle);
  }
  return mrr;
}

/** ARR = MRR × 12. PURE. */
export function annualRecurringRevenue(subs: BillableSubscription[], pricing: PlanPricing[]): number {
  return monthlyRecurringRevenue(subs, pricing) * 12;
}

/** Full revenue snapshot for the admin dashboard. PURE. */
export function revenueSnapshot(subs: BillableSubscription[], pricing: PlanPricing[]): RevenueSnapshot {
  const distribution: Record<string, number> = {};
  let active = 0, trialing = 0, canceled = 0, pastDue = 0;
  for (const s of subs) {
    distribution[s.planSlug] = (distribution[s.planSlug] ?? 0) + 1;
    if (s.status === 'active') active++;
    else if (s.status === 'trial' || s.status === 'trialing') trialing++;
    else if (s.status === 'past_due') pastDue++;
    else if (s.status === 'canceled' || s.status === 'expired') canceled++;
  }
  return {
    mrr: monthlyRecurringRevenue(subs, pricing),
    arr: annualRecurringRevenue(subs, pricing),
    currency: pricing[0]?.currency ?? 'usd',
    activeOrganizations: active,
    trialingOrganizations: trialing,
    canceledOrganizations: canceled,
    pastDueOrganizations: pastDue,
    planDistribution: distribution,
  };
}

/** Count of organizations currently entitled (active/trial/past_due). PURE. */
export function activeOrganizationCount(subs: BillableSubscription[]): number {
  return subs.filter((s) => ACTIVE_STATES.has(s.status)).length;
}
