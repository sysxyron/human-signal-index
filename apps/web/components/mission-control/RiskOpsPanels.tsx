// =============================================================================
// HSI Phase 47 — Mission Control: risk command panel, signal-flow pipeline,
// review operations. Read-only, server-rendered from cached intelligence.
// =============================================================================

import { Card, DonutChart } from '@hsi/ui';
import { ShieldAlert, GitBranch, ClipboardCheck, ArrowRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { colorForRiskTier, type RiskTier } from '@/lib/public-intelligence-mapping';
import type { TrendPoint } from '@/lib/public-intelligence';
import type { PipelineStage, ReviewOps } from '@/lib/operations-intelligence';

export function RiskCommandPanel({ risks, trend }: { risks: { key: RiskTier; count: number }[]; trend: TrendPoint[] }) {
  const total = risks.reduce((s, r) => s + r.count, 0);
  const segments = risks.filter((r) => r.count > 0).map((r) => ({ label: r.key, value: r.count, color: colorForRiskTier(r.key) }));
  const change = trend.length >= 2 ? Math.round((trend[trend.length - 1].value - trend[trend.length - 2].value) * 10) / 10 : 0;
  const Trend = change > 0 ? TrendingUp : change < 0 ? TrendingDown : Minus;
  const trendColor = change > 0 ? '#EF4444' : change < 0 ? '#10B981' : '#94A3B8';

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-risk" />
        <h3 className="text-h6 font-semibold text-text-primary">Risk command</h3>
        <span className="ml-auto inline-flex items-center gap-1 text-caption" style={{ color: trendColor }}>
          <Trend className="h-3.5 w-3.5" /> {change === 0 ? 'stable' : `${change > 0 ? '+' : ''}${change} avg risk`}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {risks.map((r) => (
          <div key={r.key} className="rounded-card border border-border bg-background-deep/40 px-2 py-2 text-center">
            <div className="text-h6 font-bold tabular-nums" style={{ color: colorForRiskTier(r.key) }}>{r.count}</div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{r.key}</div>
          </div>
        ))}
      </div>
      {total > 0 ? (
        <div className="flex justify-center">
          <DonutChart segments={segments} size={140} thickness={16} centerValue={String(total)} centerLabel="items" />
        </div>
      ) : (
        <p className="rounded-card border border-dashed border-border/70 bg-background-deep/30 px-4 py-6 text-center text-caption text-text-muted">No risk-scored items yet.</p>
      )}
    </Card>
  );
}

export function SignalFlowPipeline({ stages }: { stages: PipelineStage[] }) {
  const max = Math.max(1, ...stages.map((s) => s.count));
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <GitBranch className="h-4 w-4 text-electric" />
        <h3 className="text-h6 font-semibold text-text-primary">Signal flow pipeline</h3>
      </div>
      <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
        {stages.map((s, i) => (
          <div key={s.stage} className="flex items-center gap-1">
            <div className="flex w-24 shrink-0 flex-col items-center gap-1 rounded-card border border-border bg-background-deep/40 px-2 py-3">
              <span className="text-h5 font-bold tabular-nums" style={{ color: s.color }}>{s.count.toLocaleString('en-US')}</span>
              <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{s.stage}</span>
              <span className="h-1 w-full overflow-hidden rounded-full bg-surface-2">
                <span className="block h-full rounded-full" style={{ width: `${Math.max(6, (s.count / max) * 100)}%`, backgroundColor: s.color }} />
              </span>
            </div>
            {i < stages.length - 1 ? <ArrowRight className="h-4 w-4 shrink-0 text-text-muted" /> : null}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-text-muted">Operational view of signals by lifecycle stage — read-only.</p>
    </Card>
  );
}

export function ReviewOperations({ review }: { review: ReviewOps }) {
  const cells: { label: string; value: string; color: string }[] = [
    { label: 'Pending reviews', value: review.pending.toLocaleString('en-US'), color: '#F59E0B' },
    { label: 'Approved today', value: review.approvedToday.toLocaleString('en-US'), color: '#10B981' },
    { label: 'Rejected today', value: review.rejectedToday.toLocaleString('en-US'), color: '#EF4444' },
    { label: 'Review backlog', value: review.backlog.toLocaleString('en-US'), color: '#8B5CF6' },
    { label: 'Avg review time', value: review.avgReviewHours == null ? '—' : `${review.avgReviewHours}h`, color: '#3B82F6' },
  ];
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="h-4 w-4 text-electric" />
        <h3 className="text-h6 font-semibold text-text-primary">Review operations</h3>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {cells.map((c) => (
          <div key={c.label} className="rounded-card border border-border bg-background-deep/40 px-3 py-2">
            <div className="text-h6 font-bold tabular-nums" style={{ color: c.color }}>{c.value}</div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{c.label}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
