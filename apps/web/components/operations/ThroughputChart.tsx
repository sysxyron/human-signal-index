// =============================================================================
// HSI Phase 8 — ThroughputChart. Wraps the @hsi/ui SVG LineChart for a
// {date;count}[] throughput series (capture throughput / alert throughput).
// Server-safe.
// =============================================================================

import { Card, LineChart } from '@hsi/ui';
import { type ComponentType } from 'react';
import { type LucideProps } from 'lucide-react';
import { seriesXLabels, toCountSeries } from '@/lib/operations/view';

export function ThroughputChart({
  title,
  points,
  color = '#3B82F6',
  seriesName = 'Count',
  icon: Icon,
}: {
  title: string;
  points: { date: string; count: number }[];
  color?: string;
  seriesName?: string;
  icon?: ComponentType<LucideProps>;
}) {
  const data = toCountSeries(points);
  const total = data.reduce((a, b) => a + b, 0);
  return (
    <Card className="space-y-3" padded>
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          {Icon ? <Icon className="h-4 w-4 text-electric" /> : null}
          {title}
        </h3>
        <span className="text-caption text-text-muted">{total} total</span>
      </div>
      {data.length === 0 ? (
        <p className="text-body-sm text-text-secondary">No data for this period.</p>
      ) : (
        <LineChart
          height={200}
          showLegend={false}
          xLabels={seriesXLabels(points)}
          series={[{ name: seriesName, color, data }]}
        />
      )}
    </Card>
  );
}
