// =============================================================================
// HSI Phase 12 — TimelineCompare. Renders the ORIGINAL timeline and the
// COUNTERFACTUAL timeline SIDE BY SIDE as two LineCharts (signals +
// amplification), each with its final forecast-state label and a delta-chip
// summary underneath. Server-safe / presentational — draws only the frames it is
// given (never invents data).
// =============================================================================

import { Card, LineChart, type LineSeries } from '@hsi/ui';
import { GitCompareArrows } from 'lucide-react';
import {
  formatDate,
  formatDelta,
  formatDeltaPct,
  toneColor,
  deltaTone,
  type Tone,
  type CounterfactualDeltas,
  type TimelineFrame,
} from '@/lib/simulation/view';

function framesToSeries(frames: TimelineFrame[]): {
  series: LineSeries[];
  xLabels: string[];
} {
  return {
    series: [
      { name: 'Signals', color: '#3B82F6', data: frames.map((f) => f.signals) },
      {
        name: 'Amplification',
        color: '#F59E0B',
        data: frames.map((f) => f.amplification),
      },
    ],
    xLabels: frames.map((f) => formatDate(f.timestamp)),
  };
}

function TimelinePane({
  label,
  accent,
  frames,
  finalState,
}: {
  label: string;
  accent: string;
  frames: TimelineFrame[];
  finalState?: string;
}) {
  const { series, xLabels } = framesToSeries(frames);
  return (
    <div className="space-y-2 rounded-card border border-border bg-surface-2/30 p-4">
      <div className="flex items-center justify-between gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-semibold"
          style={{ backgroundColor: `${accent}1f`, color: accent, border: `1px solid ${accent}55` }}
        >
          {label}
        </span>
        {finalState ? (
          <span className="text-caption text-text-muted">
            Final forecast: <span className="font-semibold text-text-primary">{finalState}</span>
          </span>
        ) : null}
      </div>
      {frames.length > 0 ? (
        <LineChart series={series} xLabels={xLabels} height={200} />
      ) : (
        <p className="py-8 text-center text-caption text-text-muted">
          No timeline frames available.
        </p>
      )}
    </div>
  );
}

function MiniDelta({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: Tone;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-btn border border-border bg-surface-2/40 px-2.5 py-1 text-caption">
      <span className="text-text-muted">{label}</span>
      <span className="font-semibold" style={{ color: toneColor(tone) }}>
        {value}
      </span>
    </span>
  );
}

export function TimelineCompare({
  original,
  counterfactual,
  originalFinalState,
  counterfactualFinalState,
  deltas,
}: {
  original: TimelineFrame[];
  counterfactual: TimelineFrame[];
  originalFinalState?: string;
  counterfactualFinalState?: string;
  deltas: CounterfactualDeltas;
}) {
  return (
    <Card className="space-y-4" padded>
      <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
        <GitCompareArrows className="h-4 w-4 text-electric" /> Original vs counterfactual timeline
      </h3>

      <div className="grid gap-4 lg:grid-cols-2">
        <TimelinePane
          label="Original (what actually happened)"
          accent="#3B82F6"
          frames={original}
          finalState={originalFinalState}
        />
        <TimelinePane
          label="Counterfactual (estimated alternative)"
          accent="#8B5CF6"
          frames={counterfactual}
          finalState={counterfactualFinalState}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-caption text-text-muted">Net difference:</span>
        <MiniDelta
          label="signals"
          value={formatDeltaPct(deltas.signalDeltaPct)}
          tone={deltaTone(deltas.signalDeltaPct)}
        />
        <MiniDelta
          label="amplification"
          value={formatDelta(deltas.amplificationDelta)}
          tone={deltaTone(deltas.amplificationDelta)}
        />
        <MiniDelta
          label="growth"
          value={formatDeltaPct(deltas.growthDeltaPct)}
          tone={deltaTone(deltas.growthDeltaPct)}
        />
        <MiniDelta
          label="forecast"
          value={deltas.forecastChanged ? 'flipped' : 'held'}
          tone={deltas.forecastChanged ? 'purple' : 'neutral'}
        />
      </div>
    </Card>
  );
}
