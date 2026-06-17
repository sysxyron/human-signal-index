// =============================================================================
// HSI Phase 46 — Source analytics. Top / fastest-growing / most-influential
// sources + most-active categories. Real platform data only (no fake analytics).
// =============================================================================

import { Card } from '@hsi/ui';
import { TrendingUp, Flame, Award, Activity } from 'lucide-react';
import { colorForBucket } from '@/lib/public-intelligence-mapping';
import type { SourceAnalytics as SourceAnalyticsData, SourceRank } from '@/lib/source-intelligence';

export function SourceAnalytics({ analytics }: { analytics: SourceAnalyticsData }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
      <RankPanel icon={<TrendingUp className="h-4 w-4 text-electric" />} title="Top sources" rows={analytics.topSources} />
      <RankPanel icon={<Flame className="h-4 w-4 text-warning" />} title="Fastest growing" rows={analytics.fastestGrowing} />
      <RankPanel icon={<Award className="h-4 w-4 text-verified" />} title="Most influential" rows={analytics.mostInfluential} />
      <Card className="space-y-3">
        <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-electric" /><h3 className="text-body-sm font-semibold text-text-primary">Most active categories</h3></div>
        {analytics.mostActiveCategories.length === 0 ? (
          <p className="text-caption text-text-muted">No data yet.</p>
        ) : (
          <ol className="space-y-2">
            {analytics.mostActiveCategories.slice(0, 5).map((c) => (
              <li key={c.category} className="flex items-center justify-between text-body-sm">
                <span className="flex items-center gap-2 text-text-secondary">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colorForBucket(c.category) }} />
                  {c.category}
                </span>
                <span className="tabular-nums text-caption text-text-muted">{c.count.toLocaleString('en-US')}</span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}

function RankPanel({ icon, title, rows }: { icon: React.ReactNode; title: string; rows: SourceRank[] }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">{icon}<h3 className="text-body-sm font-semibold text-text-primary">{title}</h3></div>
      {rows.length === 0 ? (
        <p className="text-caption text-text-muted">No data yet.</p>
      ) : (
        <ol className="space-y-2">
          {rows.map((r, i) => (
            <li key={r.id} className="flex items-center gap-2 text-body-sm">
              <span className="w-4 shrink-0 text-caption font-semibold tabular-nums text-text-muted">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-text-secondary">{r.name}</span>
              <span className="shrink-0 text-caption text-text-muted">{r.hint}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
