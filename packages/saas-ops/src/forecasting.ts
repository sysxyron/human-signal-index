// =============================================================================
// Revenue forecasting — PURE. A simple, explainable model: project next-month MRR
// from the recent MRR trend, derive next-quarter ARR, and split growth vs churn
// projections. Deterministic; no clocks. Stripe/actuals always override later.
// =============================================================================

import type { RevenueForecast } from './types';

/** Linear growth rate from an ordered MRR history (oldest→newest). PURE. */
export function trailingGrowthRate(mrrHistory: number[]): number {
  const series = mrrHistory.filter((n) => Number.isFinite(n) && n >= 0);
  if (series.length < 2) return 0;
  const first = series[0];
  const last = series[series.length - 1];
  if (first <= 0) return last > 0 ? 1 : 0;
  // Average per-step growth across the window.
  const steps = series.length - 1;
  return (last - first) / first / steps;
}

/**
 * Forecast next month + next quarter from MRR history and a churn-rate estimate.
 * nextMonthMrr = currentMrr × (1 + growth − churn). growthProjection /
 * churnProjection split the delta. PURE.
 */
export function computeForecast(input: {
  mrrHistory: number[]; // oldest → newest (current is last)
  churnRate?: number; // 0..1 monthly revenue churn
  currency?: string;
}): RevenueForecast {
  const currency = input.currency ?? 'usd';
  const history = input.mrrHistory.filter((n) => Number.isFinite(n) && n >= 0);
  const current = history.length > 0 ? history[history.length - 1] : 0;
  const growth = trailingGrowthRate(history);
  const churn = Math.max(0, Math.min(1, input.churnRate ?? 0));

  const growthProjection = Math.round(current * Math.max(0, growth));
  const churnProjection = Math.round(current * churn);
  const nextMonthMrr = Math.max(0, current + growthProjection - churnProjection);
  // Next-quarter ARR from the compounded monthly net rate over 3 months.
  const netRate = growth - churn;
  const q = Math.max(0, Math.round(current * Math.pow(1 + netRate, 3)));
  return {
    nextMonthMrr,
    nextQuarterArr: q * 12,
    churnProjection,
    growthProjection,
    currency,
  };
}
