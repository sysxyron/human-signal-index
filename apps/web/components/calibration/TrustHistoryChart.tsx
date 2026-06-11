// =============================================================================
// HSI Phase 16 — TrustHistoryChart. Plots an entity's trust score (0..100) over
// time using the @hsi/ui LineChart, with the dates + latest value shown. Lets a
// reader see whether trust is rising or falling. Server-safe.
// =============================================================================

import { Card, LineChart } from '@hsi/ui';
import { LineChart as LineChartIcon } from 'lucide-react';
import { bandDecor, bandFromScore, formatTrustScore } from '@/lib/calibration/view';

function shortDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  return new Date(t).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function TrustHistoryChart({
  history,
  title = 'Trust over time',
}: {
  history: { trustScore: number; at: string }[];
  title?: string;
}) {
  const ordered = [...history].sort((a, b) => (Date.parse(a.at) || 0) - (Date.parse(b.at) || 0));
  const latest = ordered[ordered.length - 1];
  const color = bandDecor(bandFromScore(latest?.trustScore)).color;

  return (
    <Card className="space-y-3" padded>
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <LineChartIcon className="h-4 w-4 text-electric" /> {title}
        </h3>
        {latest ? (
          <span className="text-caption text-text-muted">
            now <span className="font-semibold text-text-primary">{formatTrustScore(latest.trustScore)}/100</span>
          </span>
        ) : null}
      </div>

      {ordered.length < 2 ? (
        <p className="text-caption text-text-muted">
          Not enough history to plot a trend yet.
        </p>
      ) : (
        <LineChart
          series={[
            {
              name: 'Trust score',
              color,
              data: ordered.map((h) => Math.round(Math.max(0, Math.min(100, h.trustScore)))),
            },
          ]}
          height={180}
          xLabels={ordered.map((h) => shortDate(h.at))}
          showLegend={false}
        />
      )}
      <p className="text-caption text-text-muted">Scored 0–100; advisory, not a guarantee.</p>
    </Card>
  );
}
