// =============================================================================
// HSI Phase 12 — Backtesting Dashboard (/dashboard/simulation/backtesting).
// Server Component, force-dynamic. getBacktestingAction(): forecasts vs actual
// outcomes (hsin_simulation_results: predicted_state/probability vs actual_state/
// probability + error_score), accuracy per narrative (hsin_forecast_accuracy),
// calibration scores, historical performance, and the CONFIDENCE DRIFT chart
// (stated vs empirical confidence). The whole page emphasizes that calibration
// REDUCES OVERCONFIDENCE — stated confidence is never taken at face value.
// Offline (NOT_CONFIGURED) → labeled demo from counterfactualDemo() fixtures.
// =============================================================================

import { TopNav, Card, Table, type TableColumn } from '@hsi/ui';
import { Target, Info } from 'lucide-react';
import type { BacktestingView, HsinSimulationResultRecord } from '@hsi/shared-types';
import { getBacktestingAction } from '@/lib/simulation/actions';
import { demoBacktesting, formatPct01, toneColor } from '@/lib/simulation/view';
import { SimNav } from '@/components/simulation/SimNav';
import { DemoBadge } from '@/components/signals/badges';
import {
  EmptyState,
  ErrorState,
  OfflineDemoBanner,
  type DbErrorCode,
} from '@/components/signals/states';
import { AccuracyTable } from '@/components/simulation/AccuracyTable';
import { CalibrationPanel } from '@/components/simulation/CalibrationPanel';
import { ConfidenceDriftChart } from '@/components/simulation/ConfidenceDriftChart';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function correctness(r: HsinSimulationResultRecord): boolean | null {
  if (!r.predicted_state || !r.actual_state) return null;
  return r.predicted_state === r.actual_state;
}

function ForecastVsActualTable({
  results,
}: {
  results: HsinSimulationResultRecord[];
}) {
  if (results.length === 0) {
    return (
      <p className="text-caption text-text-muted">
        No scored forecasts yet — backtest records accrue as forecasts are compared
        against actual outcomes.
      </p>
    );
  }

  const columns: TableColumn<HsinSimulationResultRecord>[] = [
    {
      key: 'predicted',
      header: 'Predicted',
      render: (r) => (
        <span className="text-text-primary">
          {r.predicted_state ?? '—'}
          {r.predicted_probability != null ? (
            <span className="ml-1 text-text-muted">
              ({formatPct01(r.predicted_probability)})
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'actual',
      header: 'Actual',
      render: (r) => (
        <span className="text-text-primary">
          {r.actual_state ?? '—'}
          {r.actual_probability != null ? (
            <span className="ml-1 text-text-muted">
              ({formatPct01(r.actual_probability)})
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'result',
      header: 'Result',
      render: (r) => {
        const ok = correctness(r);
        if (ok === null) return <span className="text-text-muted">—</span>;
        return (
          <span
            className="font-semibold"
            style={{ color: ok ? '#10B981' : '#EF4444' }}
          >
            {ok ? 'Correct' : 'Wrong'}
          </span>
        );
      },
    },
    {
      key: 'error',
      header: 'Error score',
      align: 'right',
      render: (r) => {
        if (r.error_score == null) return <span className="text-text-muted">—</span>;
        const tone = r.error_score <= 0.25 ? 'green' : r.error_score <= 0.5 ? 'orange' : 'red';
        return (
          <span className="font-semibold" style={{ color: toneColor(tone) }}>
            {(Math.round(r.error_score * 100) / 100).toFixed(2)}
          </span>
        );
      },
    },
  ];

  return (
    <Table columns={columns} data={results} rowKey={(r) => r.id} />
  );
}

export default async function BacktestingPage() {
  const res = await getBacktestingAction();

  let view: BacktestingView | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;

  if (res.ok) {
    view = res.data;
  } else if (res.code === 'NOT_CONFIGURED') {
    view = demoBacktesting();
    isDemo = true;
  } else {
    errored = { message: res.error, code: res.code };
  }

  const narrativeNames = new Map<string, string>(
    view?.narratives.map((n) => [n.id, n.name]) ?? [],
  );

  const hasData =
    view && (view.accuracy.length > 0 || view.results.length > 0 || view.confidenceDrift.length > 0);

  return (
    <>
      <TopNav
        title="Backtesting"
        subtitle="Forecasts vs reality — calibrate confidence, reduce overconfidence"
      />
      <main className="space-y-6 p-5 lg:p-6">
        <SimNav />

        <div className="flex flex-wrap items-center gap-2">
          <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
            <Target className="h-5 w-5 text-electric" /> Backtesting & calibration
          </h2>
          {isDemo ? <DemoBadge /> : null}
        </div>

        {isDemo ? <OfflineDemoBanner /> : null}

        <Card className="flex items-start gap-2 border-border bg-surface/50" padded>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption leading-relaxed text-text-secondary">
            Backtesting scores past forecasts against what actually happened, then
            calibrates stated confidence against empirical accuracy. A band that says
            it&apos;s 90% sure but is only right half the time is reported as
            overconfident and pulled down. The goal is{' '}
            <span className="font-semibold text-text-primary">honest uncertainty</span> —
            never a claim of certainty.
          </p>
        </Card>

        {errored ? (
          <ErrorState
            title="Could not load backtesting"
            message={errored.message}
            code={errored.code}
            redirectedFrom="/dashboard/simulation/backtesting"
          />
        ) : !hasData ? (
          <EmptyState
            icon={<Target className="h-5 w-5" />}
            title="No backtest data yet"
            message="Accuracy, calibration, and confidence drift accrue once forecasts have been scored against actual outcomes. Rebuild the simulation pipeline to populate them."
          />
        ) : view ? (
          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <CalibrationPanel
                avgAccuracy={view.avgAccuracy}
                avgCalibration={view.avgCalibration}
                bands={view.confidenceDrift}
              />
              <ConfidenceDriftChart drift={view.confidenceDrift} />
            </div>

            <Card className="space-y-3" padded>
              <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
                <Target className="h-4 w-4 text-electric" /> Accuracy per narrative
              </h3>
              <AccuracyTable rows={view.accuracy} narrativeNames={narrativeNames} />
            </Card>

            <Card className="space-y-3" padded>
              <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
                <Info className="h-4 w-4 text-electric" /> Forecasts vs actual outcomes
              </h3>
              <p className="text-caption text-text-muted">
                Historical performance — each row is a past forecast scored against the
                actual outcome (lower error is better).
              </p>
              <ForecastVsActualTable results={view.results} />
            </Card>
          </div>
        ) : null}
      </main>
    </>
  );
}
