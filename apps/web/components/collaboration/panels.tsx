// =============================================================================
// HSI Phase 53 — Collaboration & Investigation Network panels (server-rendered,
// read-only). Structured operational coordination — never chat. Public-safe
// aggregates only; NO identities. Graceful empty states.
// =============================================================================

import { Card } from '@hsi/ui';
import {
  Users, Network, ClipboardCheck, AlertTriangle, GitBranch, Layers, Activity, Gauge, Radio,
} from 'lucide-react';
import { colorForBucket } from '@/lib/public-intelligence-mapping';
import type {
  TeamOps, Ownership, Workload, EscalationItem, CrossTeam, InvestigationHealth, CollabSummary,
} from '@/lib/collaboration-intelligence';

const n = (v: number) => v.toLocaleString('en-US');
const TONE: Record<string, string> = { green: '#10B981', amber: '#F59E0B', red: '#EF4444' };
const SEV: Record<string, string> = { high: '#EF4444', medium: '#F59E0B' };

export function ExecutiveCollabSummary({ summary, role }: { summary: CollabSummary; role: string | null }) {
  const dot = TONE[summary.tone];
  const items = [
    { label: 'Current workload', value: summary.workload },
    { label: 'Current bottleneck', value: summary.bottleneck },
    { label: 'Highest priority', value: summary.priorityArea },
    { label: 'Publication readiness', value: summary.publicationReadiness },
    { label: 'Coordination', value: summary.coordinationStatus },
  ];
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Gauge className="h-4 w-4 text-electric" /><h2 className="text-h6 font-semibold text-text-primary">Executive collaboration summary</h2>
        {role ? <span className="rounded-full border border-border bg-surface-2/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">{role} view</span> : null}
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-semibold" style={{ backgroundColor: `${dot}1f`, color: dot }}><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dot }} />{summary.coordinationStatus}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((it) => (
          <div key={it.label} className="rounded-card border border-border bg-background-deep/40 px-3 py-2">
            <div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{it.label}</div>
            <div className="mt-0.5 truncate text-body-sm font-semibold text-text-primary" title={it.value}>{it.value}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function TeamOpsOverview({ ops }: { ops: TeamOps }) {
  const cells = [
    { label: 'Active investigations', value: ops.active, color: '#3B82F6' },
    { label: 'In progress', value: ops.assigned, color: '#8B5CF6' },
    { label: 'Pending review', value: ops.pendingReview, color: '#F59E0B' },
    { label: 'Pending publication', value: ops.pendingPublication, color: '#06B6D4' },
    { label: 'Recently completed', value: ops.recentlyCompleted, color: '#10B981' },
    { label: 'Escalated', value: ops.escalated, color: '#EF4444' },
  ];
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><Network className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Team operations</h3></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {cells.map((c) => (
          <div key={c.label} className="rounded-card border border-border bg-background-deep/40 px-3 py-2">
            <div className="text-h5 font-bold tabular-nums" style={{ color: c.color }}>{n(c.value)}</div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{c.label}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function OwnershipPanel({ ownership }: { ownership: Ownership }) {
  const steps = [
    { label: 'Unassigned', value: ownership.unassigned, color: '#94A3B8' },
    { label: 'Assigned', value: ownership.assigned, color: '#8B5CF6' },
    { label: 'Awaiting review', value: ownership.awaitingReview, color: '#F59E0B' },
    { label: 'Awaiting publication', value: ownership.awaitingPublication, color: '#06B6D4' },
    { label: 'Published', value: ownership.published, color: '#10B981' },
  ];
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><GitBranch className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Investigation ownership</h3></div>
      <div className="space-y-2.5">
        {steps.map((s) => (
          <div key={s.label} className="space-y-1">
            <div className="flex items-center justify-between text-caption"><span className="font-medium text-text-secondary">{s.label}</span><span className="font-semibold tabular-nums text-text-primary">{n(s.value)}</span></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${Math.round((s.value / max) * 100)}%`, backgroundColor: s.color }} /></div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-text-muted">Workflow states only — no individual identities are shown.</p>
    </Card>
  );
}

export function WorkloadBalancing({ workload, isAdmin }: { workload: Workload; isAdmin: boolean }) {
  const maxP = Math.max(1, ...workload.priorityDistribution.map((p) => p.count));
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Workload balancing</h3>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-semibold" style={{ backgroundColor: `${workload.backlogPressure === 'High' ? '#EF4444' : workload.backlogPressure === 'Medium' ? '#F59E0B' : '#10B981'}1f`, color: workload.backlogPressure === 'High' ? '#EF4444' : workload.backlogPressure === 'Medium' ? '#F59E0B' : '#10B981' }}>{workload.backlogPressure} pressure</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Cell label="Cases / analyst" value={workload.casesPerAnalyst == null ? '—' : String(workload.casesPerAnalyst)} />
        <Cell label="Cases / reviewer" value={workload.casesPerReviewer == null ? '—' : String(workload.casesPerReviewer)} />
        <Cell label="Avg queue age" value={workload.avgQueueAge} />
      </div>
      {!isAdmin ? <p className="text-[11px] text-text-muted">Per-analyst load ratios are shown to administrators (aggregate, no identities).</p> : null}
      <div>
        <h4 className="mb-1.5 text-caption font-semibold uppercase tracking-wide text-text-muted">Priority distribution</h4>
        <ul className="space-y-2">
          {workload.priorityDistribution.map((p) => (
            <li key={p.key} className="space-y-1">
              <div className="flex items-center justify-between text-caption"><span className="text-text-secondary">{p.key}</span><span className="font-semibold tabular-nums text-text-primary">{n(p.count)}</span></div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-electric" style={{ width: `${Math.round((p.count / maxP) * 100)}%` }} /></div>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

export function EscalationCenter({ escalations }: { escalations: EscalationItem[] }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-risk" /><h3 className="text-h6 font-semibold text-text-primary">Escalation center</h3></div>
      {escalations.length === 0 ? (
        <p className="rounded-card border border-verified/30 bg-verified/10 px-4 py-6 text-center text-caption text-verified">No escalations — all thresholds within range.</p>
      ) : (
        <ul className="space-y-2">
          {escalations.map((e) => (
            <li key={e.label} className="flex items-start gap-2.5 rounded-card border border-border bg-background-deep/40 px-3 py-2">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: SEV[e.severity] }} />
              <div className="min-w-0 flex-1"><div className="text-body-sm font-medium text-text-primary">{e.label}</div><div className="text-caption text-text-muted">{e.detail}</div></div>
              <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: SEV[e.severity] }}>{e.severity}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const KIND_COLOR: Record<string, string> = {
  'NEW SIGNAL': '#3B82F6', 'EVIDENCE LINKED': '#10B981', 'REVIEW COMPLETED': '#F59E0B', 'REPORT PUBLISHED': '#8B5CF6', 'SOURCE VERIFIED': '#06B6D4',
};

export function CollaborationTimeline({ items }: { items: { id: string; kind: string; text: string; at: string }[] }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><Radio className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Collaboration timeline</h3></div>
      {items.length === 0 ? (
        <p className="rounded-card border border-dashed border-border/70 bg-background-deep/30 px-4 py-8 text-center text-caption text-text-muted">No recent activity.</p>
      ) : (
        <ul className="space-y-2.5">
          {items.map((e) => (
            <li key={e.id} className="flex items-start gap-2.5">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: KIND_COLOR[e.kind] ?? '#3B82F6' }} />
              <div className="min-w-0"><div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: KIND_COLOR[e.kind] ?? '#3B82F6' }}>{e.kind}</div><div className="truncate text-caption text-text-secondary">{e.text}</div></div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function CrossTeamIntelligence({ data }: { data: CrossTeam }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><Layers className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Cross-team intelligence</h3></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Block title="Most active categories">
          {data.mostActive.length === 0 ? <Empty /> : data.mostActive.map((c) => <Row key={c.category} left={c.category} right={n(c.count)} color={colorForBucket(c.category)} />)}
        </Block>
        <Block title="Fastest growing">
          {data.fastestGrowing.length === 0 ? <Empty /> : data.fastestGrowing.map((c) => <Row key={c.category} left={c.category} right={`+${c.deltaPct}%`} color={colorForBucket(c.category)} />)}
        </Block>
        <Block title="Most published">
          {data.mostPublished.length === 0 ? <Empty /> : data.mostPublished.map((c) => <Row key={c.category} left={c.category} right={n(c.count)} color={colorForBucket(c.category)} />)}
        </Block>
        <Block title="Source concentration">
          <p className="text-body-sm text-text-secondary">{data.sourceConcentration}</p>
        </Block>
      </div>
    </Card>
  );
}

export function InvestigationHealthPanel({ health }: { health: InvestigationHealth }) {
  const cells = [
    { label: 'Healthy', value: health.healthy, color: '#10B981' },
    { label: 'At risk', value: health.atRisk, color: '#EF4444' },
    { label: 'Delayed', value: health.delayed, color: '#F59E0B' },
    { label: 'Blocked', value: health.blocked, color: '#94A3B8' },
    { label: 'Published', value: health.published, color: '#06B6D4' },
  ];
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><Users className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Investigation health</h3></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {cells.map((c) => (
          <div key={c.label} className="rounded-card border border-border bg-background-deep/40 px-3 py-2 text-center">
            <div className="text-h6 font-bold tabular-nums" style={{ color: c.color }}>{n(c.value)}</div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{c.label}</div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-text-muted">Derived from observable workflow state only.</p>
    </Card>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return <div className="rounded-card border border-border bg-background-deep/40 px-3 py-2 text-center"><div className="text-h6 font-bold tabular-nums text-text-primary">{value}</div><div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{label}</div></div>;
}
function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><h4 className="mb-2 text-caption font-semibold uppercase tracking-wide text-text-muted">{title}</h4><div className="space-y-1.5">{children}</div></div>;
}
function Row({ left, right, color }: { left: string; right: string; color: string }) {
  return <div className="flex items-center gap-2 text-body-sm"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} /><span className="min-w-0 flex-1 truncate text-text-secondary">{left}</span><span className="shrink-0 text-caption text-text-muted">{right}</span></div>;
}
function Empty() { return <p className="text-caption text-text-muted">None observed.</p>; }
