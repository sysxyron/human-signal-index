// =============================================================================
// HSI Phase 47 — Mission Control: executive summary + operations overview.
// Read-only, server-rendered from cached intelligence. Public-safe aggregates.
// =============================================================================

import { Card, MetricCard } from '@hsi/ui';
import { Activity, ClipboardCheck, FileCheck2, AlertTriangle, Database, ShieldCheck, Gauge } from 'lucide-react';

export interface OverviewData {
  activeSignals: number;
  pendingReviews: number;
  publishedToday: number;
  highRisk: number;
  sourcesActive: number;
  traceabilityScore: number;
}

const n = (v: number) => v.toLocaleString('en-US');

export function OperationsOverview({ data }: { data: OverviewData }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <MetricCard label="Active signals" value={n(data.activeSignals)} accent="#3B82F6" icon={Activity} />
      <MetricCard label="Pending reviews" value={n(data.pendingReviews)} accent="#F59E0B" icon={ClipboardCheck} />
      <MetricCard label="Published today" value={n(data.publishedToday)} accent="#10B981" icon={FileCheck2} />
      <MetricCard label="High-risk items" value={n(data.highRisk)} accent="#EF4444" icon={AlertTriangle} />
      <MetricCard label="Sources active" value={n(data.sourcesActive)} accent="#8B5CF6" icon={Database} />
      <MetricCard label="Traceability" value={`${data.traceabilityScore.toFixed(1)}%`} accent="#10B981" icon={ShieldCheck} />
    </div>
  );
}

export interface ExecSummary {
  status: string;
  statusTone: 'green' | 'amber' | 'red';
  topRisk: string;
  topCategory: string;
  topSourceCategory: string;
  backlog: number;
  health: string;
}

const TONE: Record<string, string> = { green: '#10B981', amber: '#F59E0B', red: '#EF4444' };

export function ExecutiveSummary({ summary }: { summary: ExecSummary }) {
  const dot = TONE[summary.statusTone];
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <Gauge className="h-4 w-4 text-electric" />
        <h2 className="text-h6 font-semibold text-text-primary">Executive summary</h2>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-semibold" style={{ backgroundColor: `${dot}1f`, color: dot }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dot }} />{summary.status}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Item label="Top risk area" value={summary.topRisk} />
        <Item label="Top active category" value={summary.topCategory} />
        <Item label="Top source category" value={summary.topSourceCategory} />
        <Item label="Review backlog" value={summary.backlog.toLocaleString('en-US')} />
        <Item label="Platform health" value={summary.health} />
        <Item label="System status" value={summary.status} />
      </div>
    </Card>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-border bg-background-deep/40 px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{label}</div>
      <div className="mt-0.5 truncate text-body-sm font-semibold text-text-primary" title={value}>{value}</div>
    </div>
  );
}
