// =============================================================================
// HSI Phase 12 — AccuracyTable. Per-narrative forecast accuracy + calibration
// from hsin_forecast_accuracy: prediction count, accuracy %, calibration %.
// Server-safe / presentational. Calibration is shown alongside accuracy so an
// overconfident-but-inaccurate narrative is plainly visible.
// =============================================================================

import { Table, type TableColumn } from '@hsi/ui';
import type { HsinForecastAccuracyRecord } from '@hsi/shared-types';
import { formatPct01, toneColor } from '@/lib/simulation/view';

function Pct({ value }: { value?: number }) {
  if (value == null) return <span className="text-text-muted">—</span>;
  const tone =
    value >= 0.7 ? 'green' : value >= 0.4 ? 'orange' : 'red';
  return (
    <span className="font-semibold" style={{ color: toneColor(tone) }}>
      {formatPct01(value)}
    </span>
  );
}

export function AccuracyTable({
  rows,
  narrativeNames,
}: {
  rows: HsinForecastAccuracyRecord[];
  narrativeNames: Map<string, string>;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-caption text-text-muted">
        No forecast-accuracy records yet — accuracy accrues as forecasts are scored
        against actual outcomes.
      </p>
    );
  }

  const columns: TableColumn<HsinForecastAccuracyRecord>[] = [
    {
      key: 'narrative',
      header: 'Narrative',
      render: (r) => (
        <span className="font-medium text-text-primary">
          {narrativeNames.get(r.narrative_id) ?? r.narrative_id}
        </span>
      ),
    },
    {
      key: 'window',
      header: 'Window',
      render: (r) => <span className="text-text-secondary">{r.forecast_window ?? '—'}</span>,
    },
    {
      key: 'count',
      header: 'Predictions',
      align: 'right',
      render: (r) => (
        <span className="text-text-secondary">{r.prediction_count ?? '—'}</span>
      ),
    },
    {
      key: 'accuracy',
      header: 'Accuracy',
      align: 'right',
      render: (r) => <Pct value={r.accuracy_score} />,
    },
    {
      key: 'calibration',
      header: 'Calibration',
      align: 'right',
      render: (r) => <Pct value={r.calibration_score} />,
    },
  ];

  return (
    <Table
      columns={columns}
      data={rows}
      rowKey={(r) => r.id}
    />
  );
}
