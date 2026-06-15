// =============================================================================
// Revenue analytics — PURE. MRR/ARR + growth/expansion/contraction/churned
// revenue from the current subscription set and the prior MRR snapshot. No DB,
// no clocks.
// =============================================================================

import type { OpsSubscription, RevenueMetrics } from './types';

const PAYING = new Set(['active', 'past_due']);

/** Current MRR (minor units): sum of paying subscriptions' monthly-equivalent. PURE. */
export function currentMrr(subs: OpsSubscription[]): number {
  return subs.reduce((sum, s) => (PAYING.has(s.status) ? sum + Math.max(0, s.mrr) : sum), 0);
}

/**
 * Revenue metrics from the current subs + a prior-period MRR-by-org map.
 * Expansion = orgs whose MRR rose; contraction = orgs whose MRR fell but still
 * paying; churned = orgs that were paying and are now gone/non-paying. PURE.
 */
export function computeRevenueMetrics(
  subs: OpsSubscription[],
  priorMrrByOrg: Record<string, number>,
  currency = 'usd',
): RevenueMetrics {
  const mrr = currentMrr(subs);
  const priorTotal = Object.values(priorMrrByOrg).reduce((a, b) => a + Math.max(0, b), 0);

  const currentByOrg: Record<string, number> = {};
  for (const s of subs) currentByOrg[s.organizationId] = PAYING.has(s.status) ? Math.max(0, s.mrr) : 0;

  let expansion = 0, contraction = 0, churned = 0;
  const orgs = new Set([...Object.keys(priorMrrByOrg), ...Object.keys(currentByOrg)]);
  for (const org of orgs) {
    const prev = Math.max(0, priorMrrByOrg[org] ?? 0);
    const cur = currentByOrg[org] ?? 0;
    if (prev === 0 && cur > 0) continue; // brand-new revenue (net-new, not expansion)
    if (cur > prev) expansion += cur - prev;
    else if (cur > 0 && cur < prev) contraction += prev - cur;
    else if (prev > 0 && cur === 0) churned += prev;
  }

  const growthRate = priorTotal > 0 ? (mrr - priorTotal) / priorTotal : 0;
  return {
    mrr,
    arr: mrr * 12,
    growthRate,
    expansionRevenue: expansion,
    contractionRevenue: contraction,
    churnedRevenue: churned,
    netNewRevenue: expansion - contraction - churned,
    currency,
  };
}

/** Build an MRR-by-org map from a subscription set (for snapshotting). PURE. */
export function mrrByOrg(subs: OpsSubscription[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of subs) out[s.organizationId] = PAYING.has(s.status) ? Math.max(0, s.mrr) : 0;
  return out;
}
