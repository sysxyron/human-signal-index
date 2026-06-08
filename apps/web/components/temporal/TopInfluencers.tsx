// =============================================================================
// HSI Phase 10 — TopInfluencers. A ranked list of narratives by total
// out-influence (sum of outgoing influence scores), with a relative bar and the
// count of distinct narratives each one influences. Server-safe.
// =============================================================================

import { Card } from '@hsi/ui';
import { Crown } from 'lucide-react';
import type { InfluenceView } from '@hsi/shared-types';
import { rankInfluencers } from '@/lib/temporal/view';

export function TopInfluencers({ view }: { view: InfluenceView }) {
  const ranked = rankInfluencers(view).filter((r) => r.outInfluence > 0);
  const max = Math.max(1, ...ranked.map((r) => r.outInfluence));

  return (
    <Card className="space-y-4" padded>
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <Crown className="h-4 w-4 text-electric" /> Top influencers
        </h3>
        <span className="text-caption text-text-muted">by out-influence</span>
      </div>
      {ranked.length === 0 ? (
        <p className="text-body-sm text-text-secondary">
          No narrative measurably influences another yet.
        </p>
      ) : (
        <ol className="space-y-3">
          {ranked.map((r, i) => (
            <li key={r.narrativeId} className="space-y-1">
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2 text-body-sm font-semibold text-text-primary">
                  <span className="text-text-muted">#{i + 1}</span>
                  <span className="truncate" title={r.name}>
                    {r.name}
                  </span>
                </span>
                <span className="whitespace-nowrap font-mono text-h6 font-bold text-electric">
                  {Math.round(r.outInfluence)}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-full rounded-full bg-electric"
                  style={{ width: `${(r.outInfluence / max) * 100}%` }}
                />
              </div>
              <p className="text-[11px] text-text-muted">
                influences {r.targets} narrative{r.targets === 1 ? '' : 's'}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
