// =============================================================================
// HSI Phase 7 — SourceHealthTimeline. Plots a source's health observations as a
// response-time line chart (via @hsi/ui LineChart) plus a recent-events list
// with status + failure counts. Server-safe.
// =============================================================================

import { Card, LineChart } from '@hsi/ui';
import { Activity } from 'lucide-react';
import type { HsinSourceHealthRecord } from '@hsi/shared-types';
import { formatDateTime, sourceHealthDecor } from '@/lib/signals/view';
import { DecoratedPill } from './badges';

export function SourceHealthTimeline({
  history,
}: {
  history: HsinSourceHealthRecord[];
}) {
  // Oldest → newest for the trend line.
  const ordered = [...history].sort((a, b) =>
    (a.created_at ?? '').localeCompare(b.created_at ?? ''),
  );
  const responseSeries = ordered.map((h) => h.response_time ?? 0);
  const hasResponse = responseSeries.some((v) => v > 0);

  return (
    <Card className="space-y-4" padded>
      <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
        <Activity className="h-4 w-4 text-electric" /> Health timeline
      </h3>

      {ordered.length === 0 ? (
        <p className="text-body-sm text-text-secondary">
          No health observations recorded yet for this source.
        </p>
      ) : (
        <>
          {hasResponse ? (
            <LineChart
              height={180}
              showLegend
              series={[
                { name: 'Response (ms)', color: '#3B82F6', data: responseSeries },
              ]}
            />
          ) : null}
          <ul className="space-y-1.5">
            {[...ordered].reverse().slice(0, 8).map((h) => (
              <li
                key={h.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-1.5 text-caption last:border-0"
              >
                <DecoratedPill decor={sourceHealthDecor(h.status)} />
                <span className="text-text-secondary">
                  {h.response_time != null ? `${h.response_time} ms` : '—'}
                  {h.failure_count ? ` · ${h.failure_count} failures` : ''}
                </span>
                <span className="text-text-muted">{formatDateTime(h.created_at)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
