// =============================================================================
// HSI Phase 52 — Forecasting & Early Warning Center (/dashboard/forecasting).
// Server Component, force-dynamic. Read-only forecasting built entirely from
// observed, cached platform data — every output framed as likelihood / direction
// / confidence, never certainty. Distinct from the Phase 21 forecasting workflow
// at /dashboard/forecasts (untouched). Touches no RBAC/auth/billing/workflow.
// =============================================================================

import { TopNav } from '@hsi/ui';
import { getForecastData } from '@/lib/forecasting-intelligence';
import {
  ExecutiveOutlookPanel, EarlyWarningPanel, TrendMomentumPanel, RiskTrajectoryPanel,
  NarrativeMomentumPanel, SourceForecastsPanel, ReviewForecastPanel, ForecastHistoryPanel,
} from '@/components/forecast-center/panels';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ForecastingPage() {
  const f = await getForecastData();

  return (
    <>
      <TopNav title="Forecasting & Early Warning" subtitle="What's growing, accelerating, or declining — likelihood and confidence, never certainty" />
      <main className="space-y-6 p-5 lg:p-6">
        {/* Part 8 — executive outlook */}
        <ExecutiveOutlookPanel outlook={f.outlook} />

        {/* Part 2 — early warning */}
        <EarlyWarningPanel warnings={f.earlyWarnings} />

        {/* Part 3 — trend momentum (7 / 30 / 90 day) */}
        <TrendMomentumPanel momentum={f.trendMomentum} />

        {/* Part 4 — risk trajectory, Part 7 — review forecasting */}
        <div className="grid gap-4 xl:grid-cols-2">
          <RiskTrajectoryPanel trajectory={f.riskTrajectory} />
          <ReviewForecastPanel forecast={f.reviewForecast} />
        </div>

        {/* Part 5 — narrative momentum */}
        <NarrativeMomentumPanel momentum={f.narrativeMomentum} />

        {/* Part 6 — source forecasts, Part 10 — forecast history */}
        <div className="grid gap-4 xl:grid-cols-2">
          <SourceForecastsPanel forecasts={f.sourceForecasts} />
          <ForecastHistoryPanel history={f.history} />
        </div>
      </main>
    </>
  );
}
