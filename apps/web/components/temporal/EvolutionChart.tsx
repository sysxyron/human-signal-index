// =============================================================================
// HSI Phase 10 — EvolutionChart. Wraps the @hsi/ui SVG LineChart to plot a
// narrative's signal_count and amplification_score across its ordered snapshots.
// Server-safe. Empty/thin data is handled gracefully.
// =============================================================================

import { LineChart } from '@hsi/ui';
import type { HsinNarrativeSnapshotRecord } from '@hsi/shared-types';
import { formatDate } from '@/lib/temporal/view';

export function EvolutionChart({
  snapshots,
  height = 200,
}: {
  snapshots: HsinNarrativeSnapshotRecord[];
  height?: number;
}) {
  const ordered = [...snapshots].sort(
    (a, b) => Date.parse(a.captured_at) - Date.parse(b.captured_at),
  );

  if (ordered.length < 2) {
    return (
      <p className="text-caption text-text-muted">
        At least two snapshots are needed to chart this narrative&apos;s trajectory.
      </p>
    );
  }

  const xLabels = ordered.map((s) => formatDate(s.captured_at));
  const series = [
    {
      name: 'Signals',
      color: '#3B82F6',
      data: ordered.map((s) => s.signal_count ?? 0),
    },
    {
      name: 'Amplification',
      color: '#F59E0B',
      data: ordered.map((s) => s.amplification_score ?? 0),
    },
  ];

  return <LineChart height={height} xLabels={xLabels} series={series} showLegend />;
}
