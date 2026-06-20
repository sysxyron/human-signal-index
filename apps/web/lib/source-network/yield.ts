// =============================================================================
// HSI Phase 70.3.3 — Signal yield metrics (PURE, deterministic). Summarizes how
// much intelligence a source has actually produced. Counts come from REAL tables
// (computed in the DAL); this module only shapes + trends them. If nothing was
// observed it returns 0 / "not yet observed" — never a fabricated number. No I/O.
// =============================================================================

import type { YieldCounts, YieldSummary, YieldTrend } from './types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function dateLabel(iso: string | null): string {
  if (!iso) return 'not yet observed';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'not yet observed' : `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/** Recent vs prior window → trend. Needs ≥1 signal somewhere to call a trend. */
export function yieldTrend(recent: number, prior: number): YieldTrend {
  if (recent === 0 && prior === 0) return 'none';
  if (recent > prior) return 'rising';
  if (recent < prior) return 'declining';
  return 'steady';
}

/** Shape raw counts into a display summary. observed=false → "not yet observed". */
export function summarizeYield(counts: YieldCounts): YieldSummary {
  const total = counts.signals + counts.evidence + counts.reports;
  const observed = total > 0 || counts.narratives > 0 || counts.forecasts > 0;
  return {
    ...counts,
    total,
    trend: yieldTrend(counts.signalsRecent, counts.signalsPrior),
    observed,
    lastSignalLabel: dateLabel(counts.lastSignalAt),
  };
}

export const EMPTY_YIELD: YieldCounts = { signals: 0, evidence: 0, narratives: 0, reports: 0, forecasts: 0, lastSignalAt: null, signalsRecent: 0, signalsPrior: 0 };

const TREND_LABEL: Record<YieldTrend, string> = { rising: 'Rising', steady: 'Steady', declining: 'Declining', none: 'No activity' };
export function trendLabel(t: YieldTrend): string { return TREND_LABEL[t]; }
