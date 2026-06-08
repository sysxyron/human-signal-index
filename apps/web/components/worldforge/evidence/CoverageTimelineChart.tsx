import { Card, LineChart, type LineSeries } from '@hsi/ui';
import { LineChart as LineChartIcon } from 'lucide-react';
import type { CoverageTimelinePoint } from '@/lib/worldforge/evidence-intel-view';

export interface CoverageTimelineChartProps {
  points: CoverageTimelinePoint[];
  className?: string;
}

/**
 * Coverage timeline: an area/line chart of per-run coverage score and (when
 * present) evidence-weighted confidence over time. Reuses the @hsi/ui LineChart
 * SVG helper. Server-safe.
 */
export function CoverageTimelineChart({
  points,
  className = '',
}: CoverageTimelineChartProps) {
  if (points.length === 0) {
    return (
      <Card className={`space-y-1.5 ${className}`} padded>
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <LineChartIcon className="h-4 w-4 text-electric" /> Coverage timeline
        </h3>
        <p className="text-caption text-text-muted">
          No runs with evidence yet. Gather evidence on a research run to start
          tracking coverage over time.
        </p>
      </Card>
    );
  }

  const ordered = [...points];
  const coverageData = ordered.map((p) =>
    Number.isFinite(p.coverageScore) ? Math.round(p.coverageScore) : 0,
  );
  const hasWeighted = ordered.some(
    (p) => typeof p.evidenceWeightedConfidence === 'number',
  );
  const weightedData = ordered.map((p) =>
    typeof p.evidenceWeightedConfidence === 'number'
      ? Math.round(p.evidenceWeightedConfidence)
      : 0,
  );

  const series: LineSeries[] = [
    { name: 'Coverage', color: '#3B82F6', data: coverageData },
  ];
  if (hasWeighted) {
    series.push({
      name: 'Weighted confidence',
      color: '#10B981',
      data: weightedData,
    });
  }

  // Show at most ~8 x-axis labels to avoid crowding.
  const stride = Math.max(1, Math.ceil(ordered.length / 8));
  const xLabels = ordered
    .filter((_, i) => i % stride === 0)
    .map((p) => p.label || p.date.slice(0, 10));

  return (
    <Card className={`space-y-4 ${className}`} padded>
      <div>
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <LineChartIcon className="h-4 w-4 text-electric" /> Coverage timeline
        </h3>
        <p className="mt-0.5 text-caption text-text-muted">
          Per-run evidence coverage{hasWeighted ? ' and evidence-weighted confidence' : ''} over time (0–100).
        </p>
      </div>
      <LineChart series={series} xLabels={xLabels} height={240} />
    </Card>
  );
}
