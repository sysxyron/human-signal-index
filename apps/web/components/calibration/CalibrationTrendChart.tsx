// =============================================================================
// HSI Phase 16 — CalibrationTrendChart. Plots ECE and Brier score over successive
// calibration snapshots using the @hsi/ui LineChart (both expressed on a 0..1 →
// 0..100 scale so they share an axis). Both metrics are LOWER-is-better, so a
// downward trend is improving calibration. Axis labels + the latest numbers are
// always shown — explainable, never opaque. Server-safe.
// =============================================================================

import { Card, LineChart } from '@hsi/ui';
import { LineChart as LineChartIcon, Info } from 'lucide-react';
import { formatBrier, formatErrorPct, toneColor } from '@/lib/calibration/view';

interface TrendPoint {
  generatedAt: string;
  ece: number;
  brier: number;
}

function shortDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  return new Date(t).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function CalibrationTrendChart({
  trend,
  title = 'Calibration trend',
}: {
  trend: TrendPoint[];
  title?: string;
}) {
  const ordered = [...trend].sort(
    (a, b) => (Date.parse(a.generatedAt) || 0) - (Date.parse(b.generatedAt) || 0),
  );
  const latest = ordered[ordered.length - 1];

  return (
    <Card className="space-y-3" padded>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <LineChartIcon className="h-4 w-4 text-electric" /> {title}
        </h3>
        {latest ? (
          <div className="flex items-center gap-3 text-caption text-text-muted">
            <span>
              ECE <span className="font-semibold text-text-primary">{formatErrorPct(latest.ece)}</span>
            </span>
            <span>
              Brier <span className="font-semibold text-text-primary">{formatBrier(latest.brier)}</span>
            </span>
          </div>
        ) : null}
      </div>

      <p className="flex items-start gap-2 text-caption leading-relaxed text-text-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-electric" />
        Expected Calibration Error (ECE, %) and Brier score (×100) across successive
        snapshots. Both are LOWER-is-better — a downward trend means confidence is
        getting more honest over time.
      </p>

      {ordered.length < 2 ? (
        <p className="text-caption text-text-muted">
          Not enough snapshots yet to plot a trend — recompute calibration over time to
          populate this.
        </p>
      ) : (
        <LineChart
          series={[
            {
              name: 'ECE %',
              color: toneColor('orange'),
              data: ordered.map((p) => Number((p.ece * 100).toFixed(1))),
            },
            {
              name: 'Brier ×100',
              color: toneColor('blue'),
              data: ordered.map((p) => Number((p.brier * 100).toFixed(1))),
            },
          ]}
          height={200}
          xLabels={ordered.map((p) => shortDate(p.generatedAt))}
          showLegend
        />
      )}
    </Card>
  );
}
