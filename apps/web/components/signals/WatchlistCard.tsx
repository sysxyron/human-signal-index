// =============================================================================
// HSI Phase 7 — WatchlistCard. Server-safe card showing a watchlist's severity,
// term chips, source count, and description.
// =============================================================================

import { Card } from '@hsi/ui';
import { ListChecks, Tag, Database } from 'lucide-react';
import type { HsinWatchlistRecord } from '@hsi/shared-types';
import { WatchlistSeverityBadge } from './badges';

export function WatchlistCard({
  watchlist,
  sourceCount,
}: {
  watchlist: HsinWatchlistRecord;
  sourceCount: number;
}) {
  const terms = watchlist.terms ?? [];
  const shown = terms.slice(0, 8);
  const extra = terms.length - shown.length;

  return (
    <Card className="flex h-full flex-col gap-3" interactive padded>
      <div className="flex items-start justify-between gap-2">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <ListChecks className="h-4 w-4 text-electric" />
          {watchlist.name}
        </h3>
        <WatchlistSeverityBadge severity={watchlist.severity} />
      </div>

      {watchlist.description ? (
        <p className="text-body-sm leading-relaxed text-text-secondary">
          {watchlist.description}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {shown.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2/50 px-2 py-0.5 text-caption text-text-secondary"
          >
            <Tag className="h-3 w-3 text-text-muted" />
            {t}
          </span>
        ))}
        {extra > 0 ? (
          <span className="rounded-full border border-border px-2 py-0.5 text-caption text-text-muted">
            +{extra} more
          </span>
        ) : null}
        {terms.length === 0 ? (
          <span className="text-caption text-text-muted">No terms defined.</span>
        ) : null}
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-border pt-3 text-caption text-text-muted">
        <span className="inline-flex items-center gap-1.5">
          <Database className="h-3.5 w-3.5" />
          {sourceCount} source{sourceCount === 1 ? '' : 's'}
        </span>
        <span>{terms.length} term{terms.length === 1 ? '' : 's'}</span>
      </div>
    </Card>
  );
}
