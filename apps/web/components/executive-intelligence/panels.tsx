// =============================================================================
// HSI Phase 74 — Executive Intelligence panels (server, display-only). Overview,
// risk board, early-warning alerts, executive brief, narrative velocity, trust,
// forecast health + divergence, blind spots, contradictions, geo, and platform
// health. Real data only; deterministic statuses with explainable detail.
// =============================================================================

import { Card, MetricCard } from '@hsi/ui';
import { Radio, FolderOpen, ListChecks, FileText, AlertTriangle, Gauge, Activity, Layers, Target, MapPin, ShieldCheck, Compass, TrendingDown } from 'lucide-react';
import type { ExecutiveIntelligence, PlatformHealthSignal } from '@/lib/executive/data';
import type { AlertSeverity, RiskStatus, DivergenceStatus } from '@/lib/executive/types';

const n = (v: number) => v.toLocaleString('en-US');
const RISK_STYLE: Record<RiskStatus, string> = { GREEN: 'border-verified/40 bg-verified/10 text-verified', YELLOW: 'border-warning/40 bg-warning/10 text-warning', RED: 'border-risk/40 bg-risk/10 text-risk' };
const SEV_STYLE: Record<AlertSeverity, string> = { CRITICAL: 'border-risk/40 bg-risk/10 text-risk', HIGH: 'border-warning/40 bg-warning/10 text-warning', MEDIUM: 'border-electric/40 bg-electric/10 text-electric', LOW: 'border-border bg-surface-2/50 text-text-secondary', INFO: 'border-border bg-surface-2/50 text-text-muted' };
const HEALTH_STYLE: Record<string, string> = { PASS: 'text-verified', WARNING: 'text-warning', FAIL: 'text-risk', NOT_OBSERVED: 'text-text-muted', NOT_CONFIGURED: 'text-text-secondary' };
const DIV_STYLE: Record<DivergenceStatus, string> = { on_track: 'text-verified', diverging: 'text-warning', missed: 'text-risk', unresolved: 'text-text-muted' };

export function ExecutiveOverview({ d }: { d: ExecutiveIntelligence }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Active signals" value={n(d.overview.activeSignals)} accent="#3B82F6" icon={Radio} />
      <MetricCard label="Open investigations" value={n(d.overview.openInvestigations)} accent="#8B5CF6" icon={FolderOpen} />
      <MetricCard label="Review queue" value={n(d.overview.reviewQueue)} accent="#F59E0B" icon={ListChecks} />
      <MetricCard label="Published reports" value={n(d.overview.publishedReports)} accent="#10B981" icon={FileText} />
    </div>
  );
}

export function RiskBoard({ d }: { d: ExecutiveIntelligence }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><Gauge className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Risk monitor</h3><span className={`ml-auto rounded-full border px-2.5 py-0.5 text-caption font-semibold ${RISK_STYLE[d.overallRisk]}`}>{d.overallRisk}</span></div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {d.risks.map((r) => (
          <div key={r.category} className="rounded-card border border-border bg-background-deep/40 px-3 py-2">
            <div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${r.status === 'GREEN' ? 'bg-verified' : r.status === 'YELLOW' ? 'bg-warning' : 'bg-risk'}`} /><span className="text-body-sm font-medium text-text-primary">{r.label}</span><span className={`ml-auto text-[10px] font-semibold ${r.status === 'GREEN' ? 'text-verified' : r.status === 'YELLOW' ? 'text-warning' : 'text-risk'}`}>{r.status}</span></div>
            <p className="mt-0.5 text-[11px] text-text-muted">{r.detail}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function AlertsPanel({ d }: { d: ExecutiveIntelligence }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-risk" /><h3 className="text-h6 font-semibold text-text-primary">Early-warning alerts</h3><span className="ml-auto text-caption text-text-muted">{d.alerts.length}</span></div>
      {d.alerts.length === 0 ? <p className="text-caption text-verified">No warnings triggered — all rules within thresholds.</p> : (
        <ul className="space-y-1.5">
          {d.alerts.map((a) => (
            <li key={a.id} className="space-y-0.5 rounded-card border border-border bg-background-deep/40 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2 text-body-sm"><span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${SEV_STYLE[a.severity]}`}>{a.severity}</span><span className="font-medium text-text-primary">{a.title}</span><span className="ml-auto text-[10px] uppercase tracking-wide text-text-muted">{a.type.replace(/_/g, ' ')}</span></div>
              <p className="text-[11px] text-text-muted">{a.summary}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function ExecutiveBriefPanel({ d }: { d: ExecutiveIntelligence }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Executive brief</h3><span className="ml-auto text-caption text-text-muted">platform-derived</span></div>
      <div className="grid gap-4 sm:grid-cols-2">
        {d.brief.sections.map((s) => (
          <div key={s.heading} className="space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-text-muted">{s.heading}</p>
            <ul className="space-y-0.5">{s.lines.map((l, i) => <li key={i} className="text-body-sm text-text-secondary">{l}</li>)}</ul>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function NarrativeVelocityPanel({ d }: { d: ExecutiveIntelligence }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><Layers className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Narrative velocity</h3></div>
      {d.narrativeVelocity.length === 0 ? <p className="text-caption text-text-muted">No attributed narratives yet.</p> : (
        <ul className="space-y-1">{d.narrativeVelocity.map((nr) => (
          <li key={nr.id} className="flex flex-wrap items-center gap-2 text-caption"><span className="min-w-0 flex-1 truncate text-text-primary">{nr.name}</span>{nr.status ? <span className="text-[10px] uppercase tracking-wide text-text-muted">{nr.status}</span> : null}<span className="shrink-0 tabular-nums text-text-secondary">{n(nr.signalCount)} sig · {n(nr.evidenceCount)} ev · {n(nr.forecastCount)} fc</span></li>
        ))}</ul>
      )}
    </Card>
  );
}

export function TrustForecastRow({ d }: { d: ExecutiveIntelligence }) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card className="space-y-3">
        <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Trust overview</h3></div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[['High', d.trustOverview.high], ['Medium', d.trustOverview.medium], ['Low', d.trustOverview.low], ['Scored', d.trustOverview.observed]].map(([l, v]) => <div key={l} className="rounded-card border border-border bg-background-deep/40 px-3 py-2 text-center"><div className="text-h6 font-bold tabular-nums text-text-primary">{n(v as number)}</div><div className="text-[10px] uppercase tracking-wide text-text-muted">{l}</div></div>)}
        </div>
        <p className="text-[11px] text-text-muted">Sources with trust deterioration appear in the low band.</p>
      </Card>
      <Card className="space-y-3">
        <div className="flex items-center gap-2"><Target className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Forecast health</h3></div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[['On track', d.forecastHealth.onTrack], ['Diverging', d.forecastHealth.diverging], ['Missed', d.forecastHealth.missed], ['Unresolved', d.forecastHealth.unresolved]].map(([l, v]) => <div key={l} className="rounded-card border border-border bg-background-deep/40 px-3 py-2 text-center"><div className="text-h6 font-bold tabular-nums text-text-primary">{n(v as number)}</div><div className="text-[10px] uppercase tracking-wide text-text-muted">{l}</div></div>)}
        </div>
      </Card>
    </div>
  );
}

export function DivergencePanel({ d }: { d: ExecutiveIntelligence }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><TrendingDown className="h-4 w-4 text-warning" /><h3 className="text-h6 font-semibold text-text-primary">Forecast divergence</h3><span className="ml-auto text-caption text-text-muted">attention required</span></div>
      {d.divergenceRows.length === 0 ? <p className="text-caption text-verified">No diverging, missed, or unresolved forecasts.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-caption">
            <thead><tr className="text-left text-[10px] uppercase tracking-wide text-text-muted"><th className="py-1 pr-2">Forecast</th><th className="px-1">Status</th><th className="px-1">Age</th><th className="px-1">Owner</th><th className="px-1">Conf.</th><th className="px-1">Outcome</th></tr></thead>
            <tbody>
              {d.divergenceRows.map((r) => (
                <tr key={r.id} className="border-t border-border/50 text-text-secondary">
                  <td className="py-1 pr-2 text-text-primary">{r.title}</td>
                  <td className={`px-1 font-semibold ${DIV_STYLE[r.status]}`}>{r.status.replace('_', ' ')}</td>
                  <td className="px-1 tabular-nums">{r.ageDays != null ? `${r.ageDays}d` : '—'}</td>
                  <td className="px-1 truncate">{r.owner}</td>
                  <td className="px-1 tabular-nums">{r.confidence != null ? `${Math.round(r.confidence * 100)}%` : '—'}</td>
                  <td className="px-1 truncate">{r.outcome ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function MonitorsRow({ d }: { d: ExecutiveIntelligence }) {
  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <Card className="space-y-3">
        <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-warning" /><h3 className="text-h6 font-semibold text-text-primary">Blind spot monitor</h3></div>
        {d.blindSpots.length === 0 ? <p className="text-caption text-text-muted">No blind-spot regions.</p> : <ul className="space-y-1">{d.blindSpots.map((b) => <li key={b.key} className="flex items-center justify-between text-caption"><span className="truncate text-text-secondary">{b.key}</span><span className="text-warning">{b.severity}</span></li>)}</ul>}
      </Card>
      <Card className="space-y-3">
        <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warning" /><h3 className="text-h6 font-semibold text-text-primary">Contradiction monitor</h3></div>
        {d.contradictions.length === 0 ? <p className="text-caption text-text-muted">No contradiction clusters.</p> : <ul className="space-y-1">{d.contradictions.map((c) => <li key={c.key} className="flex items-center justify-between text-caption"><span className="truncate text-text-secondary">{c.key}</span><span className="tabular-nums text-text-muted">{c.contradicts} c / {c.supports} s</span></li>)}</ul>}
      </Card>
      <Card className="space-y-3">
        <div className="flex items-center gap-2"><Compass className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Geo intelligence</h3></div>
        <div className="grid grid-cols-3 gap-2">
          {[['Geo-ready src', d.geo.geoReadySources], ['Geo signals', d.geo.geoActiveSignals], ['Geo narratives', d.geo.geoActiveNarratives]].map(([l, v]) => <div key={l} className="rounded-card border border-border bg-background-deep/40 px-2 py-2 text-center"><div className="text-h6 font-bold tabular-nums text-text-primary">{n(v as number)}</div><div className="text-[10px] uppercase tracking-wide text-text-muted">{l}</div></div>)}
        </div>
      </Card>
    </div>
  );
}

export function PlatformHealthPanel({ signals }: { signals: PlatformHealthSignal[] }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Platform health signals</h3></div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {signals.map((s, i) => (
          <div key={`${s.label}-${i}`} className="flex items-center justify-between rounded-card border border-border bg-background-deep/40 px-3 py-2 text-caption">
            <span className="truncate text-text-secondary">{s.label}</span>
            <span className={`shrink-0 font-semibold ${HEALTH_STYLE[s.status] ?? 'text-text-muted'}`}>{s.status.replace('_', ' ')}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
