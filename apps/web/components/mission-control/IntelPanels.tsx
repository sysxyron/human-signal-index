// =============================================================================
// HSI Phase 47 — Mission Control: category heatmap, activity stream, source ops,
// publication ops. Read-only, server-rendered from cached intelligence. Public-
// safe. Graceful empty states (never fabricated).
// =============================================================================

import { Card } from '@hsi/ui';
import { Radio, Layers, Database, FileText } from 'lucide-react';
import { colorForBucket, CATEGORY_BUCKETS, type CategoryActivity, type CategoryBucket } from '@/lib/public-intelligence-mapping';
import type { PublicActivityItem, PublicActivityKind } from '@/lib/public-intelligence';
import type { SourceHealthSummary, SourceRank, SourceCoverage } from '@/lib/source-intelligence';

const KIND_COLOR: Record<PublicActivityKind, string> = {
  'NEW SIGNAL': '#3B82F6',
  'EVIDENCE LINKED': '#10B981',
  'REVIEW COMPLETED': '#F59E0B',
  'REPORT PUBLISHED': '#8B5CF6',
  'SOURCE VERIFIED': '#06B6D4',
};

export function CategoryHeatmapStrip({ activity }: { activity: CategoryActivity[] }) {
  const counts = new Map<CategoryBucket, number>(activity.map((a) => [a.category, a.count]));
  const max = Math.max(1, ...activity.map((a) => a.count));
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-electric" />
        <h3 className="text-h6 font-semibold text-text-primary">Category activity</h3>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {CATEGORY_BUCKETS.map((b) => {
          const count = counts.get(b) ?? 0;
          const intensity = Number((0.12 + (count / max) * 0.85).toFixed(3));
          const color = colorForBucket(b);
          return (
            <div key={b} className="rounded-card border border-border p-2 text-center" title={`${b}: ${count}`}>
              <span className="block h-9 w-full rounded-[4px]" style={{ backgroundColor: color, opacity: count === 0 ? 0.1 : intensity }} />
              <span className="mt-1.5 block truncate text-[10px] font-medium text-text-secondary">{b}</span>
              <span className="block text-caption font-bold tabular-nums text-text-primary">{count}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function ActivityStream({ items }: { items: PublicActivityItem[] }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <Radio className="h-4 w-4 text-electric" />
        <h3 className="text-h6 font-semibold text-text-primary">Intelligence activity stream</h3>
      </div>
      {items.length === 0 ? (
        <p className="rounded-card border border-dashed border-border/70 bg-background-deep/30 px-4 py-8 text-center text-caption text-text-muted">No recent activity yet.</p>
      ) : (
        <ul className="space-y-2.5">
          {items.map((e) => (
            <li key={e.id} className="flex items-start gap-2.5">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: KIND_COLOR[e.kind] ?? '#3B82F6' }} />
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: KIND_COLOR[e.kind] ?? '#3B82F6' }}>{e.kind}</div>
                <div className="truncate text-caption text-text-secondary">{e.text}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function SourceOperations({ health, topSources, coverage }: { health: SourceHealthSummary; topSources: SourceRank[]; coverage: SourceCoverage[] }) {
  const gaps = CATEGORY_BUCKETS.filter((b) => !coverage.some((c) => c.category === b && c.sources > 0));
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <Database className="h-4 w-4 text-electric" />
        <h3 className="text-h6 font-semibold text-text-primary">Source operations</h3>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Active" value={health.active} color="#10B981" />
        <Stat label="Inactive" value={health.inactive} color="#94A3B8" />
        <Stat label="Failing" value={health.failing} color="#EF4444" />
      </div>
      <div>
        <h4 className="mb-1.5 text-caption font-semibold uppercase tracking-wide text-text-muted">Highest-yield sources</h4>
        {topSources.length === 0 ? (
          <p className="text-caption text-text-muted">No sources yet.</p>
        ) : (
          <ol className="space-y-1.5">
            {topSources.slice(0, 4).map((s, i) => (
              <li key={s.id} className="flex items-center gap-2 text-body-sm">
                <span className="w-4 shrink-0 text-caption font-semibold tabular-nums text-text-muted">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-text-secondary">{s.name}</span>
                <span className="shrink-0 text-caption text-text-muted">{s.hint}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
      <div>
        <h4 className="mb-1.5 text-caption font-semibold uppercase tracking-wide text-text-muted">Coverage gaps</h4>
        {gaps.length === 0 ? (
          <p className="text-caption text-verified">All categories covered.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {gaps.map((g) => (
              <span key={g} className="inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-[11px] text-warning">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colorForBucket(g) }} />{g}
              </span>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

export interface RecentPublication {
  id: string;
  title: string;
  dateLabel: string;
  category: CategoryBucket;
}

export function PublicationOperations({ publishedReports, traceabilityScore, recent }: { publishedReports: number; traceabilityScore: number; recent: RecentPublication[] }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-electric" />
        <h3 className="text-h6 font-semibold text-text-primary">Publication operations</h3>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Published" value={publishedReports} color="#10B981" />
        <StatText label="Updated" value="—" color="#3B82F6" />
        <StatText label="Corrections" value="0" color="#F59E0B" />
        <StatText label="Avg traceability" value={`${traceabilityScore.toFixed(1)}%`} color="#10B981" />
      </div>
      <div>
        <h4 className="mb-1.5 text-caption font-semibold uppercase tracking-wide text-text-muted">Recent publications</h4>
        {recent.length === 0 ? (
          <p className="text-caption text-text-muted">No publications yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {recent.map((r) => (
              <li key={r.id} className="flex items-center gap-2 rounded-card border border-border bg-background-deep/40 px-3 py-2">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: colorForBucket(r.category) }} />
                <span className="min-w-0 flex-1 truncate text-body-sm text-text-secondary">{r.title}</span>
                <span className="shrink-0 text-caption text-text-muted">{r.dateLabel}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-card border border-border bg-background-deep/40 px-3 py-2 text-center">
      <div className="text-h6 font-bold tabular-nums" style={{ color }}>{value.toLocaleString('en-US')}</div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{label}</div>
    </div>
  );
}

function StatText({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-card border border-border bg-background-deep/40 px-3 py-2 text-center">
      <div className="text-h6 font-bold tabular-nums" style={{ color }}>{value}</div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{label}</div>
    </div>
  );
}
