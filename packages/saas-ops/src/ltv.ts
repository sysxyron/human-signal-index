// =============================================================================
// Customer Lifetime Value — PURE. Total revenue to date, subscription duration,
// average monthly revenue, and a projected value (avg × expected lifetime). No DB,
// no clocks (caller passes nowISO for duration).
// =============================================================================

import type { LtvMetrics } from './types';

const DAY_MS = 86_400_000;
/** Expected remaining lifetime (months) used for projection. Conservative default. */
export const DEFAULT_EXPECTED_LIFETIME_MONTHS = 24;

/**
 * Compute LTV from total revenue to date + subscription start. averageMonthly is
 * totalRevenue / max(1, elapsedMonths); projectedValue = totalRevenue + avg ×
 * remaining expected lifetime. PURE.
 */
export function computeLTV(
  input: { totalRevenue: number; startedAt: string | null; nowISO: string; currentMrr?: number; expectedLifetimeMonths?: number },
): LtvMetrics {
  const total = Math.max(0, Math.floor(input.totalRevenue));
  const start = input.startedAt ? Date.parse(input.startedAt) : NaN;
  const now = Date.parse(input.nowISO);
  const elapsedMonths = Number.isFinite(start) && Number.isFinite(now) && now > start
    ? Math.max(1, (now - start) / (DAY_MS * 30))
    : 1;
  const months = Math.round(elapsedMonths * 10) / 10;
  const avg = Math.round(total / Math.max(1, months));
  const expected = input.expectedLifetimeMonths ?? DEFAULT_EXPECTED_LIFETIME_MONTHS;
  // Projection prefers current MRR when known (forward-looking), else historical avg.
  const forward = Math.max(0, Math.floor(input.currentMrr ?? avg));
  const projectedValue = total + forward * expected;
  return { totalRevenue: total, subscriptionMonths: months, averageMonthlyRevenue: avg, projectedValue };
}
