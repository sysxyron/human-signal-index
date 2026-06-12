// =============================================================================
// HSI Phase 21 — Forecasts board (/dashboard/forecasts). Server Component,
// force-dynamic. getForecastsBoardAction() returns the forecasts (hypotheses)
// with confidence/reliability/status + the rolled-up reliability metrics
// (ForecastAccuracyPanel). A curator may recompute reliability. Researcher+ view.
// Answers "what is likely to happen next, and how reliable are our forecasts?".
//
// Offline (NOT_CONFIGURED) → labeled demo.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { TrendingUp, Info } from 'lucide-react';
import type { ForecastsBoardData } from '@hsi/shared-types';
import { getForecastsBoardAction, recomputeForecastAccuracyAction } from '@/lib/forecasting/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { canCurate, canResearch, demoForecastsBoard } from '@/lib/forecasting/view';
import { ForecastingNav } from '@/components/forecasting/ForecastingNav';
import { ForecastCard } from '@/components/forecasting/ForecastCard';
import { ForecastAccuracyPanel } from '@/components/forecasting/panels';
import { RecomputeAccuracyButton } from '@/components/forecasting/controls';
import { DemoBadge } from '@/components/signals/badges';
import { EmptyState, ErrorState, OfflineDemoBanner, type DbErrorCode } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ForecastsPage() {
  const [res, role, user] = await Promise.all([getForecastsBoardAction(), getSessionRole(), getUser()]);
  const mayView = canResearch(role) && Boolean(user);
  const mayCurate = canCurate(role) && Boolean(user);

  let data: ForecastsBoardData | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;
  if (res.ok) data = res.data;
  else if (res.code === 'NOT_CONFIGURED') { data = demoForecastsBoard(); isDemo = true; }
  else errored = { message: res.error, code: res.code };

  const forbidden = !isDemo && res.ok && !mayView;
  const rows = data?.rows ?? [];

  return (
    <>
      <TopNav title="Forecasts" subtitle="Forward-looking hypotheses — what is likely to happen next, with confidence + reliability" />
      <main className="space-y-6 p-5 lg:p-6">
        <ForecastingNav />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
              <TrendingUp className="h-5 w-5 text-electric" /> Active forecasts
            </h2>
            {isDemo ? <DemoBadge /> : null}
          </div>
          <RecomputeAccuracyButton action={recomputeForecastAccuracyAction} canAct={mayCurate} demo={isDemo} />
        </div>
        {isDemo ? <OfflineDemoBanner /> : null}

        <Card className="flex items-start gap-2 border-border bg-surface/50" padded>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption leading-relaxed text-text-secondary">
            No prediction is truth. Every forecast is a <span className="font-semibold text-text-primary">hypothesis</span> that
            exposes its assumptions, supporting evidence, invalidation criteria, and limitations — and requires human
            governance. Nothing auto-predicts or auto-acts.
          </p>
        </Card>

        {forbidden ? (
          <ErrorState title="Insufficient permissions" message="Viewing forecasts requires the researcher role or above." code="FORBIDDEN" />
        ) : errored ? (
          <ErrorState title="Could not load forecasts" message={errored.message} code={errored.code} redirectedFrom="/dashboard/forecasts" />
        ) : !data ? null : (
          <div className="space-y-6">
            {data.accuracy ? <ForecastAccuracyPanel accuracy={data.accuracy} /> : null}
            {rows.length === 0 ? (
              <EmptyState icon={<TrendingUp className="h-5 w-5" />} title="No forecasts yet" message="The forecast worker generates forecasts from signals, consensus, and trust trends every 30 minutes." />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {rows.map((r) => <ForecastCard key={r.id} row={r} />)}
              </div>
            )}
          </div>
        )}
      </main>
    </>
  );
}
