// =============================================================================
// HSI Phase 73.2 — Platform Auditor panels (server, display-only). Overall health
// summary, severity/area counts, recommended actions, and per-area report tables
// (route/RBAC, metadata, infrastructure, conversion funnel). Real results only.
// =============================================================================

import { Card, MetricCard } from '@hsi/ui';
import { ShieldCheck, AlertTriangle, ListChecks, Network, FileText, Server, Megaphone, Map as MapIcon } from 'lucide-react';
import type { PlatformAuditReport, AuditIssue, AuditStatus, AuditArea } from '@/lib/platform-audit/types';

const n = (v: number) => v.toLocaleString('en-US');
const OVERALL_STYLE: Record<string, string> = { GREEN: 'border-verified/40 bg-verified/10 text-verified', YELLOW: 'border-warning/40 bg-warning/10 text-warning', RED: 'border-risk/40 bg-risk/10 text-risk' };
const STATUS_STYLE: Record<AuditStatus, string> = {
  PASS: 'border-verified/40 bg-verified/10 text-verified', WARNING: 'border-warning/40 bg-warning/10 text-warning',
  FAIL: 'border-risk/40 bg-risk/10 text-risk', NOT_OBSERVED: 'border-border bg-surface-2/50 text-text-muted', NOT_CONFIGURED: 'border-border bg-surface-2/50 text-text-secondary',
};

function StatusBadge({ status }: { status: AuditStatus }) {
  return <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[status]}`}>{status.replace('_', ' ')}</span>;
}

export function AuditSummaryPanel({ r }: { r: PlatformAuditReport }) {
  const s = r.summary;
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-electric" /><div><h3 className="text-h6 font-semibold text-text-primary">Overall health</h3><p className="text-[11px] text-text-muted">Generated {new Date(r.generatedAt).toUTCString()}</p></div></div>
        <span className={`rounded-full border px-3 py-1 text-body-sm font-bold ${OVERALL_STYLE[s.overall]}`}>{s.overall}</span>
        <div className="ml-auto text-right"><div className="text-h4 font-bold tabular-nums text-text-primary">{s.readinessScore}<span className="text-body-sm text-text-muted">/100</span></div><div className="text-[10px] uppercase tracking-wide text-text-muted">Readiness (real checks only)</div></div>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Pass" value={n(s.byStatus.PASS)} accent="#10B981" icon={ShieldCheck} />
        <MetricCard label="Warning" value={n(s.byStatus.WARNING)} accent="#F59E0B" icon={AlertTriangle} />
        <MetricCard label="Fail" value={n(s.byStatus.FAIL)} accent="#EF4444" icon={AlertTriangle} />
        <MetricCard label="Not observed" value={n(s.byStatus.NOT_OBSERVED)} accent="#94A3B8" icon={ListChecks} />
        <MetricCard label="Not configured" value={n(s.byStatus.NOT_CONFIGURED)} accent="#64748B" icon={ListChecks} />
      </div>
    </div>
  );
}

export function RecommendedActions({ r }: { r: PlatformAuditReport }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><ListChecks className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Recommended next actions</h3></div>
      {r.recommendations.length === 0 ? <p className="text-caption text-verified">No open issues — all assessable checks pass.</p> : (
        <ol className="space-y-1.5">{r.recommendations.map((rec, i) => <li key={i} className="flex gap-2 text-body-sm text-text-secondary"><span className="shrink-0 font-semibold text-text-muted">{i + 1}.</span>{rec}</li>)}</ol>
      )}
    </Card>
  );
}

function IssueTable({ title, icon: Icon, rows }: { title: string; icon: typeof Network; rows: AuditIssue[] }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><Icon className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">{title}</h3><span className="ml-auto text-caption text-text-muted">{rows.length}</span></div>
      {rows.length === 0 ? <p className="text-caption text-text-muted">No checks in this area.</p> : (
        <ul className="space-y-1.5">
          {rows.map((i) => (
            <li key={i.id} className="space-y-0.5 rounded-card border border-border bg-background-deep/40 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2 text-body-sm"><StatusBadge status={i.status} /><span className="font-medium text-text-primary">{i.title}</span><span className="ml-auto text-[10px] uppercase tracking-wide text-text-muted">{i.severity}</span></div>
              <p className="text-[11px] text-text-muted">{i.explanation}</p>
              {i.status !== 'PASS' ? <p className="text-[11px] text-text-secondary">Fix: {i.recommendedFix}</p> : null}
              <p className="text-[10px] text-text-muted">source: {i.source}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const inAreas = (r: PlatformAuditReport, areas: AuditArea[]) => r.checks.filter((c) => areas.includes(c.area));

export function ReportTables({ r }: { r: PlatformAuditReport }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <IssueTable title="Route & RBAC health" icon={Network} rows={inAreas(r, ['routing', 'rbac'])} />
        <IssueTable title="Metadata" icon={FileText} rows={inAreas(r, ['metadata'])} />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <IssueTable title="Infrastructure & data" icon={Server} rows={inAreas(r, ['supabase', 'storage', 'infrastructure', 'migrations'])} />
        <IssueTable title="Environment" icon={ShieldCheck} rows={inAreas(r, ['environment'])} />
      </div>
      <IssueTable title="Geospatial health" icon={MapIcon} rows={inAreas(r, ['global_map'])} />
      <IssueTable title="Conversion funnel checklist" icon={Megaphone} rows={inAreas(r, ['conversion', 'forms'])} />
    </div>
  );
}
