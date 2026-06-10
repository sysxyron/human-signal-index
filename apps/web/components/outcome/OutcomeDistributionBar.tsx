// =============================================================================
// HSI Phase 15 — OutcomeDistributionBar. Renders the distribution of recorded
// outcomes across the 5 statuses (successful → partially → neutral → unsuccessful
// → inconclusive) as a single stacked bar plus a labeled legend with counts. The
// honest spread — including unsuccessful and inconclusive — is always shown; the
// loop is only useful if failures are visible. Server-safe / presentational.
// =============================================================================

import { Card } from '@hsi/ui';
import { BarChart3 } from 'lucide-react';
import type { OutcomeStatus } from '@hsi/shared-types';
import { orderedDistribution, outcomeStatusDecor } from '@/lib/outcome/view';

export function OutcomeDistributionBar({
  distribution,
  title = 'Outcome distribution',
}: {
  distribution: { status: OutcomeStatus; count: number }[];
  title?: string;
}) {
  const ordered = orderedDistribution(distribution);
  const total = ordered.reduce((a, d) => a + d.count, 0);

  return (
    <Card className="space-y-3" padded>
      <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
        <BarChart3 className="h-4 w-4 text-electric" /> {title}
      </h3>

      {total === 0 ? (
        <p className="text-caption text-text-muted">
          No recorded outcomes yet — record an outcome to populate the distribution.
        </p>
      ) : (
        <>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-2">
            {ordered.map((d) => {
              if (d.count === 0) return null;
              const decor = outcomeStatusDecor(d.status);
              const pct = (d.count / total) * 100;
              return (
                <div
                  key={d.status}
                  style={{ width: `${pct}%`, backgroundColor: decor.color }}
                  title={`${decor.label}: ${d.count} (${Math.round(pct)}%)`}
                />
              );
            })}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {ordered.map((d) => {
              const decor = outcomeStatusDecor(d.status);
              const pct = total > 0 ? Math.round((d.count / total) * 100) : 0;
              return (
                <div key={d.status} className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: decor.color }}
                  />
                  <span className="text-caption text-text-secondary">{decor.label}</span>
                  <span className="ml-auto text-caption font-semibold text-text-primary">
                    {d.count}
                    <span className="ml-1 text-text-muted">({pct}%)</span>
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-caption text-text-muted">
            {total} recorded outcome{total === 1 ? '' : 's'} — failures and inconclusive
            results are shown honestly, not hidden.
          </p>
        </>
      )}
    </Card>
  );
}
