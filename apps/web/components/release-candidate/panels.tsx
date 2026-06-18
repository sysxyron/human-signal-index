// =============================================================================
// HSI Phase 55 — Beta Release Candidate Command Center panels (server-rendered,
// read-only). Composes every intelligence layer into one launch-readiness view.
// Public-safe aggregates only; explainable status + checklist.
// =============================================================================

import { Card } from '@hsi/ui';
import {
  Rocket, ShieldCheck, Activity, Layers, AlertTriangle, Network, ListChecks, FileText, CheckCircle2, MinusCircle, XCircle,
} from 'lucide-react';
import type {
  ReleaseStatus, CheckStatus, MetricRow, HealthRow, ChecklistItem, RiskRow, LaunchBrief,
} from '@/lib/release-readiness';

const STATUS_TONE: Record<ReleaseStatus, string> = { READY: '#10B981', MONITORING: '#3B82F6', 'AT RISK': '#F59E0B', 'NOT READY': '#EF4444' };
const CHECK_TONE: Record<CheckStatus, string> = { Pass: '#10B981', Warning: '#F59E0B', Fail: '#EF4444' };
const CHECK_ICON = { Pass: CheckCircle2, Warning: MinusCircle, Fail: XCircle };

export function ReleaseStatusBanner({ status, score, reasons }: { status: ReleaseStatus; score: number; reasons: string[] }) {
  const tone = STATUS_TONE[status];
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ backgroundColor: `${tone}1f`, color: tone }}><Rocket className="h-6 w-6" /></span>
        <div className="min-w-0">
          <div className="text-label uppercase tracking-wide text-text-muted">Can we launch beta today?</div>
          <div className="text-h3 font-bold" style={{ color: tone }}>{status}</div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">Readiness score</div>
          <div className="text-h3 font-bold tabular-nums text-text-primary">{score}%</div>
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${score}%`, backgroundColor: tone }} /></div>
      <ul className="space-y-1">
        {reasons.map((r, i) => <li key={i} className="text-caption text-text-secondary">• {r}</li>)}
      </ul>
    </Card>
  );
}

export function MetricGrid({ title, icon, rows }: { title: string; icon: React.ReactNode; rows: MetricRow[] }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">{icon}<h3 className="text-h6 font-semibold text-text-primary">{title}</h3></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {rows.map((r) => (
          <div key={r.label} className="rounded-card border border-border bg-background-deep/40 px-3 py-2">
            <div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{r.label}</div>
            <div className="mt-0.5 truncate text-body-sm font-semibold text-text-primary" title={r.value}>{r.value}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function SystemHealthPanel({ rows }: { rows: HealthRow[] }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">System health</h3></div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => {
          const Icon = CHECK_ICON[r.status];
          const tone = CHECK_TONE[r.status];
          return (
            <div key={r.label} className="flex items-start gap-2.5 rounded-card border border-border bg-background-deep/40 px-3 py-2">
              <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: tone }} />
              <div className="min-w-0"><div className="text-body-sm font-medium text-text-primary">{r.label}</div><div className="text-caption text-text-muted">{r.detail}</div></div>
              <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide" style={{ color: tone }}>{r.status}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function AlertsRisksPanel({ risks }: { risks: RiskRow[] }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-risk" /><h3 className="text-h6 font-semibold text-text-primary">Alerts & risks</h3></div>
      {risks.length === 0 ? (
        <p className="rounded-card border border-verified/30 bg-verified/10 px-4 py-6 text-center text-caption text-verified">No triggered alerts or risks.</p>
      ) : (
        <ul className="space-y-2">
          {risks.map((r, i) => (
            <li key={i} className="flex items-start gap-2.5 rounded-card border border-border bg-background-deep/40 px-3 py-2">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: r.severity === 'high' ? '#EF4444' : '#F59E0B' }} />
              <div className="min-w-0 flex-1"><div className="text-body-sm font-medium text-text-primary">{r.label}</div><div className="text-caption text-text-muted">{r.detail}</div></div>
              <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: r.severity === 'high' ? '#EF4444' : '#F59E0B' }}>{r.severity}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function NetworkReadinessPanel({ rows, score, scoreReason }: { rows: MetricRow[]; score: number; scoreReason: string }) {
  const tone = score >= 80 ? '#10B981' : score >= 60 ? '#F59E0B' : '#EF4444';
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><Network className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Network readiness</h3>
        <span className="ml-auto text-h6 font-bold tabular-nums" style={{ color: tone }}>{score}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${score}%`, backgroundColor: tone }} /></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {rows.map((r) => (
          <div key={r.label} className="rounded-card border border-border bg-background-deep/40 px-3 py-2"><div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{r.label}</div><div className="mt-0.5 truncate text-body-sm font-semibold text-text-primary" title={r.value}>{r.value}</div></div>
        ))}
      </div>
      <p className="text-[11px] text-text-muted">Score = {scoreReason}.</p>
    </Card>
  );
}

export function LaunchBriefPanel({ brief }: { brief: LaunchBrief }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Executive launch brief</h3></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <BriefBlock title="Strengths" items={brief.strengths} tone="#10B981" empty="None recorded." />
        <BriefBlock title="Risks" items={brief.risks} tone="#EF4444" empty="None." />
        <BriefBlock title="Warnings" items={brief.warnings} tone="#F59E0B" empty="None." />
        <BriefBlock title="Coverage gaps" items={brief.coverageGaps} tone="#F59E0B" empty="Full coverage." />
      </div>
      <div className="rounded-card border border-electric/40 bg-electric/5 px-4 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Launch recommendation</div>
        <div className="mt-0.5 text-body-sm font-semibold text-text-primary">{brief.recommendation}</div>
      </div>
    </Card>
  );
}

function BriefBlock({ title, items, tone, empty }: { title: string; items: string[]; tone: string; empty: string }) {
  return (
    <div>
      <h4 className="mb-1.5 flex items-center gap-1.5 text-caption font-semibold uppercase tracking-wide text-text-muted"><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tone }} />{title}</h4>
      {items.length === 0 ? <p className="text-caption text-text-muted">{empty}</p> : (
        <ul className="space-y-1">{items.map((it, i) => <li key={i} className="text-caption text-text-secondary">• {it}</li>)}</ul>
      )}
    </div>
  );
}

export function ReleaseChecklist({ items }: { items: ChecklistItem[] }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><ListChecks className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Release checklist</h3></div>
      <ul className="space-y-2">
        {items.map((c) => {
          const Icon = CHECK_ICON[c.status];
          const tone = CHECK_TONE[c.status];
          return (
            <li key={c.label} className="flex items-center gap-2.5 rounded-card border border-border bg-background-deep/40 px-3 py-2">
              <Icon className="h-4 w-4 shrink-0" style={{ color: tone }} />
              <span className="min-w-0 flex-1 text-body-sm font-medium text-text-primary">{c.label}</span>
              <span className="shrink-0 text-caption text-text-muted">{c.detail}</span>
              <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ backgroundColor: `${tone}1f`, color: tone }}>{c.status}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export const ICONS = { ShieldCheck: <ShieldCheck className="h-4 w-4 text-electric" />, Activity: <Activity className="h-4 w-4 text-electric" />, Layers: <Layers className="h-4 w-4 text-electric" />, Rocket: <Rocket className="h-4 w-4 text-electric" /> };
