// =============================================================================
// HSI Phase 60 — Beta Launch read panels (server-rendered). Compose the cached
// beta-operations + release-readiness data; admin-only page. Honest "—" for
// metrics not yet instrumented (DAU/WAU/retention). No gamification / no ranking.
// =============================================================================

import { Card, MetricCard } from '@hsi/ui';
import {
  Users, UserCheck, UserPlus, Microscope, ShieldCheck, Crown, Activity, Radio, FileCheck2,
  ClipboardCheck, Gauge, AlertTriangle, Rocket, Layers,
} from 'lucide-react';
import type { BetaOperationsData, BetaRisk } from '@/lib/beta-operations';
import type { OnboardingStep } from '@/lib/beta-launch/persistence';
import type { LaunchStage } from '@/lib/beta-launch/data';

const n = (v: number) => v.toLocaleString('en-US');
const TONE: Record<string, string> = { green: '#10B981', amber: '#F59E0B', red: '#EF4444' };
const SEV: Record<string, string> = { high: '#EF4444', medium: '#F59E0B' };

function Spark({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return <span className="text-caption text-text-muted">—</span>;
  const max = Math.max(1, ...data);
  return (
    <div className="flex h-8 items-end gap-0.5">
      {data.map((v, i) => <div key={i} className="w-1.5 rounded-t" style={{ height: `${Math.max(8, (v / max) * 100)}%`, backgroundColor: color, opacity: 0.8 }} />)}
    </div>
  );
}

export function ProgramOverview({ beta }: { beta: BetaOperationsData }) {
  const o = beta.overview;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total beta users" value={n(o.totalUsers)} accent="#3B82F6" icon={Users} />
        <MetricCard label="Active users" value={n(o.activeUsers)} accent="#10B981" icon={UserCheck} />
        <MetricCard label="New this week" value={n(o.newThisWeek)} accent="#F59E0B" icon={UserPlus} />
        <MetricCard label="Researchers" value={n(o.researchers)} accent="#8B5CF6" icon={Microscope} />
        <MetricCard label="Reviewers" value={n(o.reviewers)} accent="#06B6D4" icon={ShieldCheck} />
        <MetricCard label="Contributors" value={n(o.contributors)} accent="#3B82F6" icon={Users} />
        <MetricCard label="Admins" value={n(o.admins)} accent="#EF4444" icon={Crown} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="space-y-1"><div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">Growth trend (signals)</div><Spark data={beta.health.trendSignals} color="#3B82F6" /></Card>
        <Card className="space-y-1"><div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">Participation trend (publications)</div><Spark data={beta.health.trendPublications} color="#10B981" /></Card>
      </div>
    </div>
  );
}

export function OnboardingFunnel({ steps }: { steps: OnboardingStep[] }) {
  return (
    <Card className="space-y-4">
      <h3 className="text-h6 font-semibold text-text-primary">Onboarding funnel</h3>
      <ul className="space-y-2.5">
        {steps.map((s) => (
          <li key={s.label} className="space-y-1">
            <div className="flex items-center justify-between text-caption">
              <span className="font-medium text-text-secondary">{s.label}</span>
              {s.tracked ? <span className="font-semibold tabular-nums text-text-primary">{s.count} · {s.pct}%</span> : <span className="text-[11px] text-text-muted">Not tracked yet</span>}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-electric" style={{ width: `${s.pct ?? 0}%` }} /></div>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-text-muted">Dropoff = the gap between consecutive tracked steps. Login / profile / publication-view steps require client telemetry not yet wired.</p>
    </Card>
  );
}

export function BetaHealthDashboard({ beta }: { beta: BetaOperationsData }) {
  const e = beta.engagement;
  const cells = [
    { label: 'Daily active', value: e.dau == null ? '—' : n(e.dau), c: '#3B82F6' },
    { label: 'Weekly active', value: e.wau == null ? '—' : n(e.wau), c: '#3B82F6' },
    { label: 'Retention', value: e.retention == null ? '—' : `${e.retention}%`, c: '#10B981' },
    { label: 'Churn', value: e.retention == null ? '—' : `${Math.max(0, 100 - e.retention)}%`, c: '#EF4444' },
    { label: 'Signals submitted', value: n(beta.health.signalsSubmitted), c: '#3B82F6' },
    { label: 'Reviews completed', value: n(beta.health.reviewsCompleted), c: '#F59E0B' },
    { label: 'Publications', value: n(beta.health.reportsPublished), c: '#10B981' },
    { label: 'Traceability', value: `${beta.health.traceability.toFixed(1)}%`, c: '#10B981' },
  ];
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Beta health</h3></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cells.map((c) => (
          <div key={c.label} className="rounded-card border border-border bg-background-deep/40 px-3 py-2"><div className="text-h6 font-bold tabular-nums" style={{ color: c.c }}>{c.value}</div><div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{c.label}</div></div>
        ))}
      </div>
      <p className="text-[11px] text-text-muted">DAU / WAU / retention / churn require session analytics (not yet wired) — shown as “—”, never estimated.</p>
    </Card>
  );
}

export function ResearchParticipation({ beta }: { beta: BetaOperationsData }) {
  const o = beta.overview;
  const rows = [
    { label: 'Active researchers', value: o.researchers, icon: Microscope, c: '#8B5CF6' },
    { label: 'Active reviewers', value: o.reviewers, icon: ShieldCheck, c: '#06B6D4' },
    { label: 'Active contributors', value: o.contributors, icon: Users, c: '#3B82F6' },
  ];
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><Users className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Research participation</h3></div>
      <div className="grid grid-cols-3 gap-2">
        {rows.map((r) => { const Icon = r.icon; return (
          <div key={r.label} className="rounded-card border border-border bg-background-deep/40 px-3 py-2"><div className="flex items-center gap-1.5"><Icon className="h-3.5 w-3.5" style={{ color: r.c }} /><span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{r.label}</span></div><div className="mt-0.5 text-h6 font-bold tabular-nums text-text-primary">{n(r.value)}</div></div>
        ); })}
      </div>
      <p className="text-[11px] text-text-muted">Aggregate role counts only — no individual ranking, no gamification.</p>
    </Card>
  );
}

export function RiskMonitoring({ risks, lowParticipation }: { risks: BetaRisk[]; lowParticipation: { active: boolean; detail: string } }) {
  const all = [...(lowParticipation.active ? [{ label: 'Low participation', severity: 'medium' as const, detail: lowParticipation.detail }] : []), ...risks];
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-risk" /><h3 className="text-h6 font-semibold text-text-primary">Beta risk monitoring</h3></div>
      {all.length === 0 ? (
        <p className="rounded-card border border-verified/30 bg-verified/10 px-4 py-6 text-center text-caption text-verified">No operational risks flagged.</p>
      ) : (
        <ul className="space-y-2">
          {all.map((r, i) => (
            <li key={`${r.label}-${i}`} className="flex items-start gap-2.5 rounded-card border border-border bg-background-deep/40 px-3 py-2">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: SEV[r.severity] }} />
              <div className="min-w-0 flex-1"><div className="text-body-sm font-medium text-text-primary">{r.label}</div><div className="text-caption text-text-muted">{r.detail}</div></div>
              <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: SEV[r.severity] }}>{r.severity}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function ExecutiveSummary({ beta, releaseScore }: { beta: BetaOperationsData; releaseScore: number }) {
  const s = beta.summary;
  const dot = TONE[s.readinessTone];
  const items = [
    { label: 'Growth', value: s.growth }, { label: 'Participation', value: s.participation },
    { label: 'Trust', value: s.trust }, { label: 'Quality', value: `${beta.health.traceability.toFixed(1)}% traceable` },
    { label: 'Risk', value: s.risk }, { label: 'Readiness score', value: `${releaseScore}%` },
  ];
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><Gauge className="h-4 w-4 text-electric" /><h2 className="text-h6 font-semibold text-text-primary">How is the beta performing?</h2>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-semibold" style={{ backgroundColor: `${dot}1f`, color: dot }}><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dot }} />{s.readiness}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {items.map((it) => (
          <div key={it.label} className="rounded-card border border-border bg-background-deep/40 px-3 py-2"><div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{it.label}</div><div className="mt-0.5 truncate text-body-sm font-semibold text-text-primary" title={it.value}>{it.value}</div></div>
        ))}
      </div>
    </Card>
  );
}

export function LaunchStageTracker({ stage, releaseScore }: { stage: LaunchStage; releaseScore: number }) {
  const stages = [
    { n: 1, label: 'Stage 1', range: '1–10' }, { n: 2, label: 'Stage 2', range: '10–25' },
    { n: 3, label: 'Stage 3', range: '25–100' }, { n: 4, label: 'Stage 4', range: '100–500' },
  ];
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><Rocket className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Launch readiness tracking</h3>
        <span className="ml-auto text-h6 font-bold tabular-nums text-electric">{releaseScore}%</span>
      </div>
      <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
        {stages.map((s) => {
          const active = s.n === stage.current;
          const done = s.n < stage.current;
          const color = done ? '#10B981' : active ? '#3B82F6' : '#94A3B8';
          return (
            <div key={s.n} className="flex w-28 shrink-0 flex-col gap-1 rounded-card border px-3 py-3" style={{ borderColor: active ? '#3B82F6' : 'var(--border, #243352)' }}>
              <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color }}>{s.label}{active ? ' · current' : done ? ' · done' : ''}</span>
              <span className="text-body-sm font-semibold text-text-primary">{s.range} users</span>
            </div>
          );
        })}
      </div>
      <p className="text-caption text-text-secondary"><span className="font-semibold text-text-primary">{stage.label}.</span> {stage.nextMilestone}</p>
    </Card>
  );
}
