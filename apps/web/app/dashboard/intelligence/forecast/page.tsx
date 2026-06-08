// =============================================================================
// HSI Phase 10 — Narrative Forecast (/dashboard/intelligence/forecast).
// Server Component, force-dynamic. Groups narratives by their argmax forecast
// state (Emerging / Rising / Stable / Declining / Dead) with confidence /
// probability scores, the plain-language reasoning, and a probability
// distribution bar per narrative. Forecasts are PROBABILISTIC — the page says so
// everywhere. Offline (NOT_CONFIGURED) → labeled demo from the
// @hsi/temporal-intelligence fixtures.
// =============================================================================

import { TopNav } from '@hsi/ui';
import { LineChart } from 'lucide-react';
import type { ForecastView } from '@hsi/shared-types';
import { getForecastAction } from '@/lib/temporal/actions';
import { demoForecastView, FORECAST_STATE_ORDER } from '@/lib/temporal/view';
import { IntelNav } from '@/components/signals/IntelNav';
import { DemoBadge } from '@/components/signals/badges';
import {
  EmptyState,
  ErrorState,
  OfflineDemoBanner,
  type DbErrorCode,
} from '@/components/signals/states';
import {
  ForecastStateColumn,
  ProbabilisticNotice,
} from '@/components/temporal/Forecast';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ForecastPage() {
  const res = await getForecastAction();

  let view: ForecastView | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;

  if (res.ok) {
    view = res.data;
  } else if (res.code === 'NOT_CONFIGURED') {
    view = await demoForecastView();
    isDemo = true;
  } else {
    errored = { message: res.error, code: res.code };
  }

  const hasForecasts = view && view.forecasts.length > 0;

  return (
    <>
      <TopNav
        title="Narrative Forecast"
        subtitle="Probabilistic trajectory forecasts — never certainties"
      />
      <main className="space-y-6 p-5 lg:p-6">
        <IntelNav />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
              <LineChart className="h-5 w-5 text-electric" /> Narrative forecast
            </h2>
            {isDemo ? <DemoBadge /> : null}
          </div>
        </div>

        {isDemo ? <OfflineDemoBanner /> : null}

        <ProbabilisticNotice />

        {errored ? (
          <ErrorState
            title="Could not load narrative forecasts"
            message={errored.message}
            code={errored.code}
            redirectedFrom="/dashboard/intelligence/forecast"
          />
        ) : view && hasForecasts ? (
          <div className="grid gap-4 lg:grid-cols-3 xl:grid-cols-5">
            {FORECAST_STATE_ORDER.map((state) => (
              <ForecastStateColumn
                key={state}
                state={state}
                forecasts={view!.forecasts}
                narratives={view!.narratives}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<LineChart className="h-5 w-5" />}
            title="No forecasts yet"
            message="Once narratives accumulate enough snapshots, rebuild temporal intelligence to produce probabilistic trajectory forecasts."
          />
        )}
      </main>
    </>
  );
}
