// =============================================================================
// Usage rollups + overage tracking — PURE. Aggregates per-metric usage into
// period rollups and compares usage against entitlement limits to surface
// overages (tracking only — never bills). No DB, no clocks.
// =============================================================================

import { getLimit, type Entitlement } from '@hsi/entitlements';
import type { OverageRow, RollupPeriod, UsageRollup } from './types';

export interface UsageInput {
  signals: number;
  investigations: number;
  publications: number;
  storage: number;
  users: number;
}

const z = (n: number): number => Math.max(0, Math.floor(Number(n) || 0));

/** Build a usage rollup for a period from raw counters. PURE. */
export function computeUsageRollup(period: RollupPeriod, input: Partial<UsageInput>): UsageRollup {
  return {
    period,
    signals: z(input.signals ?? 0),
    investigations: z(input.investigations ?? 0),
    publications: z(input.publications ?? 0),
    storage: z(input.storage ?? 0),
    users: z(input.users ?? 0),
  };
}

/** Sum two rollups (e.g. lifetime accumulation). PURE. */
export function addRollups(a: UsageInput, b: Partial<UsageInput>): UsageInput {
  return {
    signals: z(a.signals) + z(b.signals ?? 0),
    investigations: z(a.investigations) + z(b.investigations ?? 0),
    publications: z(a.publications) + z(b.publications ?? 0),
    storage: z(a.storage) + z(b.storage ?? 0),
    users: z(a.users) + z(b.users ?? 0),
  };
}

const OVERAGE_MAP: Array<{ metric: OverageRow['metric']; usageKey: keyof UsageInput; limitKey: Parameters<typeof getLimit>[1] }> = [
  { metric: 'users', usageKey: 'users', limitKey: 'contributors_limit' },
  { metric: 'publications', usageKey: 'publications', limitKey: 'publications_limit' },
  { metric: 'investigations', usageKey: 'investigations', limitKey: 'investigations_limit' },
];

/**
 * Track overages: for each limited metric, compare usage to the entitlement limit
 * and report the overage amount. Unlimited (null) → overage 0. Tracking only —
 * never bills. PURE.
 */
export function trackOverages(entitlements: Entitlement[], usage: UsageInput): OverageRow[] {
  return OVERAGE_MAP.map(({ metric, usageKey, limitKey }) => {
    const limit = getLimit(entitlements, limitKey);
    const used = z(usage[usageKey]);
    const overage = limit === null ? 0 : Math.max(0, used - limit);
    return { metric, limit, usage: used, overage };
  });
}

/** Any metric over its limit? PURE. */
export function hasOverage(rows: OverageRow[]): boolean {
  return rows.some((r) => r.overage > 0);
}
