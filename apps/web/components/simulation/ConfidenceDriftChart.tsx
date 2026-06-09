// =============================================================================
// HSI Phase 12 — ConfidenceDriftChart. Plots STATED confidence vs EMPIRICAL
// accuracy across bands/windows as two lines. The gap between them is the
// "confidence drift": where stated runs above empirical, the model is
// overconfident. Server-safe / presentational.
// =============================================================================

import { Card, LineChart, type LineSeries } from '@hsi/ui';
import { Activity } from 'lucide-react';
import { formatPct01 } from '@/lib/simulation/view';

export function ConfidenceDriftChart({
  drift,
}: {
  drift: { window: string; stated: number; empirical: number }[];
}) {
  if (drift.length === 0) {
    return (
      <Card className="space-y-2" padded>
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <Activity className="h-4 w-4 text-electric" /> Confidence drift
        </h3>
        <p className="text-caption text-text-muted">
          No drift data yet — drift accrues once forecasts are backtested against
          actual outcomes.
        </p>
      </Card>
    );
  }

  // LineChart works in absolute units; scale 0..1 fractions to 0..100 percent.
  const series: LineSeries[] = [
    { name: 'Stated', color: '#F59E0B', data: drift.map((d) => d.stated * 100) },
    { name: 'Empirical', color: '#10B981', data: drift.map((d) => d.empirical * 100) },
  ];
  const xLabels = drift.map((d) => d.window);

  return (
    <Card className="space-y-3" padded>
      <div className="flex items-center gap-2">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <Activity className="h-4 w-4 text-electric" /> Confidence drift
        </h3>
        <span className="ml-auto text-caption text-text-muted">
          stated vs empirical — gap = overconfidence
        </span>
      </div>
      <LineChart series={series} xLabels={xLabels} height={220} />
      <div className="grid gap-2 sm:grid-cols-3">
        {drift.map((d) => {
          const gap = d.stated - d.empirical;
          return (
            <div
              key={d.window}
              className="rounded-card border border-border bg-surface-2/40 p-2.5 text-caption"
            >
              <p className="font-medium text-text-primary">{d.window}</p>
              <p className="text-text-muted">
                stated {formatPct01(d.stated)} · empirical {formatPct01(d.empirical)}
              </p>
              <p
                className="font-semibold"
                style={{ color: gap > 0.05 ? '#F59E0B' : '#10B981' }}
              >
                {gap > 0.05
                  ? `+${Math.round(gap * 100)} pts overconfident`
                  : 'well calibrated'}
              </p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
