// =============================================================================
// HSI Phase 22 — OpportunityBoard. Strategic opportunities sorted by score, each
// with source + advisory recommendation. Server-safe presentational.
// =============================================================================

import { Card } from '@hsi/ui';
import { Sparkles } from 'lucide-react';
import type { ExecutiveOpportunitiesData } from '@hsi/shared-types';
import { formatScore } from '@/lib/executive/view';
import { ScoreBadge } from './badges';

export function OpportunityBoard({ data }: { data: ExecutiveOpportunitiesData }) {
  if (data.opportunities.length === 0) {
    return <Card className="border-border p-6 text-center text-caption text-text-muted" padded>No strategic opportunities surfaced.</Card>;
  }
  return (
    <div className="space-y-2">
      {data.opportunities.map((o) => (
        <Card key={o.id} className="flex items-start justify-between gap-3 border-border" padded>
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-verified" />
            <div>
              <div className="text-body font-medium text-text-primary">{o.title}</div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <ScoreBadge score={o.score} />
                <span className="text-label uppercase tracking-wide text-text-muted">{o.source}</span>
                <span className="text-label tabular-nums text-text-muted">score {formatScore(o.score)}</span>
              </div>
              <p className="mt-1 text-caption text-text-secondary">{o.recommendation}</p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
