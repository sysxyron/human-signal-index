// =============================================================================
// HSI Phase 48 — Analyst Workspace: server-rendered panels (my work, workload,
// personal metrics, priority engine). Read-only, derived from the cached
// intelligence layers + role. Public-safe aggregates; role-relevant framing.
// =============================================================================

import { Card, MetricCard } from '@hsi/ui';
import { Inbox, Loader, ClipboardCheck, FileCheck2, CheckCircle2, AlertTriangle, Flame, Clock, ArrowUpRight, Archive } from 'lucide-react';

const n = (v: number) => v.toLocaleString('en-US');

export interface MyWork {
  assignedSignals: number;
  assignedReviews: number;
  assignedReports: number;
  pendingWork: number;
  completedToday: number;
}

export function MyWorkOverview({ work }: { work: MyWork }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <MetricCard label="Assigned signals" value={n(work.assignedSignals)} accent="#3B82F6" icon={Inbox} />
      <MetricCard label="Assigned reviews" value={n(work.assignedReviews)} accent="#F59E0B" icon={ClipboardCheck} />
      <MetricCard label="Assigned reports" value={n(work.assignedReports)} accent="#8B5CF6" icon={FileCheck2} />
      <MetricCard label="Pending work" value={n(work.pendingWork)} accent="#EF4444" icon={Loader} />
      <MetricCard label="Completed today" value={n(work.completedToday)} accent="#10B981" icon={CheckCircle2} />
    </div>
  );
}

export interface Workload {
  open: number;
  inProgress: number;
  waitingReview: number;
  published: number;
  completed: number;
}

export function WorkloadView({ workload }: { workload: Workload }) {
  const cells = [
    { label: 'Open work', value: workload.open, color: '#3B82F6', icon: Inbox },
    { label: 'In progress', value: workload.inProgress, color: '#8B5CF6', icon: Loader },
    { label: 'Waiting review', value: workload.waitingReview, color: '#F59E0B', icon: ClipboardCheck },
    { label: 'Published', value: workload.published, color: '#06B6D4', icon: FileCheck2 },
    { label: 'Completed', value: workload.completed, color: '#10B981', icon: CheckCircle2 },
  ];
  const max = Math.max(1, ...cells.map((c) => c.value));
  return (
    <Card className="space-y-4">
      <h3 className="text-h6 font-semibold text-text-primary">Workload</h3>
      <div className="space-y-2.5">
        {cells.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="space-y-1">
              <div className="flex items-center justify-between text-caption">
                <span className="flex items-center gap-1.5 text-text-secondary"><Icon className="h-3.5 w-3.5" style={{ color: c.color }} /> {c.label}</span>
                <span className="font-semibold tabular-nums text-text-primary">{n(c.value)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full" style={{ width: `${Math.max(4, (c.value / max) * 100)}%`, backgroundColor: c.color }} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export interface PersonalMetricsData {
  investigationsCompleted: number;
  reviewsCompleted: number;
  avgTurnaround: string;
  publicationImpact: number;
  traceabilityAvg: number;
}

export function PersonalMetrics({ metrics }: { metrics: PersonalMetricsData }) {
  const cells = [
    { label: 'Investigations completed', value: n(metrics.investigationsCompleted), color: '#10B981' },
    { label: 'Reviews completed', value: n(metrics.reviewsCompleted), color: '#F59E0B' },
    { label: 'Avg turnaround', value: metrics.avgTurnaround, color: '#3B82F6' },
    { label: 'Publication impact', value: n(metrics.publicationImpact), color: '#8B5CF6' },
    { label: 'Traceability avg', value: `${metrics.traceabilityAvg.toFixed(1)}%`, color: '#10B981' },
  ];
  return (
    <Card className="space-y-4">
      <h3 className="text-h6 font-semibold text-text-primary">Personal metrics</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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

export interface Priorities {
  critical: number;
  highRisk: number;
  reviewDue: number;
  recentlyEscalated: number;
  stale: number;
}

export function PriorityEngine({ priorities }: { priorities: Priorities }) {
  const rows = [
    { label: 'Critical', value: priorities.critical, color: '#B91C1C', icon: AlertTriangle },
    { label: 'High risk', value: priorities.highRisk, color: '#EF4444', icon: Flame },
    { label: 'Review due', value: priorities.reviewDue, color: '#F59E0B', icon: ClipboardCheck },
    { label: 'Recently escalated', value: priorities.recentlyEscalated, color: '#8B5CF6', icon: ArrowUpRight },
    { label: 'Stale investigations', value: priorities.stale, color: '#94A3B8', icon: Archive },
  ];
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Priority engine</h3></div>
      <ul className="space-y-2">
        {rows.map((r) => {
          const Icon = r.icon;
          return (
            <li key={r.label} className="flex items-center justify-between rounded-card border border-border bg-background-deep/40 px-3 py-2">
              <span className="flex items-center gap-2 text-body-sm text-text-secondary">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg" style={{ backgroundColor: `${r.color}1f`, color: r.color }}><Icon className="h-3.5 w-3.5" /></span>
                {r.label}
              </span>
              <span className="text-h6 font-bold tabular-nums" style={{ color: r.color }}>{n(r.value)}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
