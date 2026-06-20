// =============================================================================
// HSI Phase 73 — Operations Center panels (server, display-only). Mission
// control, executive overview, attention queue, intelligence health, narrative/
// forecast/geo/transparency watch, relationship audit, and timeline. Real counts
// only; statuses use the documented deterministic thresholds. Everything links.
// =============================================================================

import Link from 'next/link';
import { Card, MetricCard } from '@hsi/ui';
import { Gauge, AlertTriangle, Activity, Layers, Target, Compass, ShieldCheck, GitBranch, Clock } from 'lucide-react';
import type { OperationsCenterData } from '@/lib/operations-center/data';
import type { MissionStatus, Severity } from '@/lib/operations-center/types';

const n = (v: number) => v.toLocaleString('en-US');
const STATUS_STYLE: Record<MissionStatus, string> = { GREEN: 'border-verified/40 bg-verified/10 text-verified', YELLOW: 'border-warning/40 bg-warning/10 text-warning', RED: 'border-risk/40 bg-risk/10 text-risk' };
const SEV_STYLE: Record<Severity, string> = { critical: 'border-risk/40 bg-risk/10 text-risk', high: 'border-warning/40 bg-warning/10 text-warning', medium: 'border-electric/40 bg-electric/10 text-electric', low: 'border-border bg-surface-2/50 text-text-secondary' };

export function MissionControl({ d }: { d: OperationsCenterData }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><Gauge className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Mission control</h3>
        <span className={`ml-auto rounded-full border px-2.5 py-0.5 text-caption font-semibold ${STATUS_STYLE[d.mission.overall]}`}>{d.mission.overall}</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {d.mission.domains.map((m) => (
          <div key={m.key} className="rounded-card border border-border bg-background-deep/40 px-3 py-2">
            <div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${m.status === 'GREEN' ? 'bg-verified' : m.status === 'YELLOW' ? 'bg-warning' : 'bg-risk'}`} /><span className="text-body-sm font-medium text-text-primary">{m.label}</span><span className={`ml-auto text-[10px] font-semibold ${m.status === 'GREEN' ? 'text-verified' : m.status === 'YELLOW' ? 'text-warning' : 'text-risk'}`}>{m.status}</span></div>
            <p className="mt-0.5 text-[11px] text-text-muted">{m.detail}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function ExecutiveOverview({ d }: { d: OperationsCenterData }) {
  const o = d.overview;
  const cells = [
    ['Sources', o.sources], ['Signals', o.signals], ['Narratives', o.narratives], ['Evidence', o.evidence], ['Forecasts', o.forecasts], ['Investigations', o.investigations],
    ['Published reports', o.publishedReports], ['Pending review', o.pendingReview], ['Active watchlists', o.activeWatchlists], ['Active alerts', o.activeAlerts], ['Trust records', o.trustRecords],
  ] as const;
  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
      {cells.map(([l, v]) => <div key={l} className="rounded-card border border-border bg-background-deep/40 px-3 py-2 text-center"><div className="text-h6 font-bold tabular-nums text-text-primary">{n(v as number)}</div><div className="text-[10px] uppercase tracking-wide text-text-muted">{l}</div></div>)}
    </div>
  );
}

export function AttentionQueue({ d }: { d: OperationsCenterData }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-risk" /><h3 className="text-h6 font-semibold text-text-primary">Attention queue</h3><span className="ml-auto text-caption text-text-muted">what requires attention now</span></div>
      {d.attention.length === 0 ? <p className="text-caption text-text-muted">Nothing requires attention — all observable conditions clear.</p> : (
        <ul className="space-y-1.5">
          {d.attention.map((a) => (
            <li key={a.key} className="flex flex-wrap items-center gap-2 text-caption">
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${SEV_STYLE[a.severity]}`}>{a.severity}</span>
              <Link href={a.href as never} className="font-medium text-text-primary hover:text-electric">{a.label}</Link>
              <span className="shrink-0 tabular-nums text-text-secondary">{n(a.count)}</span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-text-muted">{a.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function HealthRow({ label, h }: { label: string; h: { healthy: number; degraded: number; offline: number; unknown: number } }) {
  return (
    <div className="flex items-center gap-2 text-caption">
      <span className="w-24 shrink-0 text-text-secondary">{label}</span>
      <span className="tabular-nums text-verified">{n(h.healthy)}</span><span className="text-text-muted">healthy</span>
      <span className="tabular-nums text-warning">{n(h.degraded)}</span><span className="text-text-muted">degraded</span>
      <span className="tabular-nums text-risk">{n(h.offline)}</span><span className="text-text-muted">offline</span>
      <span className="tabular-nums text-text-muted">{n(h.unknown)}</span><span className="text-text-muted">unknown</span>
    </div>
  );
}

export function IntelligenceHealthPanel({ d }: { d: OperationsCenterData }) {
  const h = d.health;
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Intelligence health</h3></div>
      <div className="space-y-1.5">
        <HealthRow label="Sources" h={h.source} />
        <HealthRow label="Signals" h={h.signal} />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 pt-1">
        {[['Trust high', h.trust.high], ['Trust medium', h.trust.medium], ['Trust low', h.trust.low], ['Map-ready', h.map.geoReady]].map(([l, v]) => <div key={l} className="rounded-card border border-border bg-background-deep/40 px-3 py-2 text-center"><div className="text-h6 font-bold tabular-nums text-text-primary">{n(v as number)}</div><div className="text-[10px] uppercase tracking-wide text-text-muted">{l}</div></div>)}
      </div>
    </Card>
  );
}

export function NarrativeWatch({ d }: { d: OperationsCenterData }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><Layers className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Narrative watch</h3></div>
      {d.narrativeWatch.top.length === 0 ? <p className="text-caption text-text-muted">No attributed narratives yet.</p> : (
        <ul className="space-y-1">
          {d.narrativeWatch.top.map((nr) => (
            <li key={nr.id} className="flex flex-wrap items-center gap-2 text-caption">
              <Link href={'/dashboard/narratives' as never} className="min-w-0 flex-1 truncate text-text-primary hover:text-electric">{nr.name}</Link>
              {nr.status ? <span className="text-[10px] uppercase tracking-wide text-text-muted">{nr.status}</span> : null}
              <span className="shrink-0 tabular-nums text-text-secondary">{n(nr.signalCount)} sig · {n(nr.evidenceCount)} ev · {n(nr.forecastCount)} fc</span>
            </li>
          ))}
        </ul>
      )}
      {d.narrativeWatch.mostContradicted.length > 0 ? (
        <div className="border-t border-border pt-2"><p className="text-[10px] uppercase tracking-wide text-text-muted">Most contradicted regions</p>
          <ul className="mt-1 space-y-0.5">{d.narrativeWatch.mostContradicted.map((c) => <li key={c.key} className="flex items-center justify-between text-caption"><span className="truncate text-text-secondary">{c.key}</span><span className="tabular-nums text-warning">{c.contradicts} c / {c.supports} s</span></li>)}</ul>
        </div>
      ) : null}
    </Card>
  );
}

export function ForecastWatch({ d }: { d: OperationsCenterData }) {
  const f = d.forecastWatch;
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><Target className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Forecast watch</h3></div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {f.byStatus.map((s) => <div key={s.status} className="rounded-card border border-border bg-background-deep/40 px-2 py-2 text-center"><div className="text-h6 font-bold tabular-nums text-text-primary">{n(s.count)}</div><div className="text-[10px] uppercase tracking-wide text-text-muted">{s.status}</div></div>)}
      </div>
      <p className="text-[11px] text-text-muted">{n(f.lackingNarrative)} of {n(f.total)} forecasts lack narrative attribution (GEO_UNKNOWN).</p>
    </Card>
  );
}

export function GeoWatch({ d }: { d: OperationsCenterData }) {
  const g = d.geoWatch;
  const List = ({ title, rows }: { title: string; rows: { key: string; v: string }[] }) => (
    <div className="space-y-1"><p className="text-[10px] uppercase tracking-wide text-text-muted">{title}</p>{rows.length === 0 ? <p className="text-caption text-text-muted">—</p> : <ul className="space-y-0.5">{rows.map((r) => <li key={r.key} className="flex items-center justify-between text-caption"><span className="truncate text-text-secondary">{r.key}</span><span className="tabular-nums text-text-muted">{r.v}</span></li>)}</ul>}</div>
  );
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><Compass className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Geospatial watch</h3></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <List title="Top countries" rows={g.topCountries.map((c) => ({ key: c.key, v: `${n(c.signalCount)} sig` }))} />
        <List title="Highest trust" rows={g.highestTrust.map((c) => ({ key: c.key, v: `${c.avg}` }))} />
        <List title="Lowest trust" rows={g.lowestTrust.map((c) => ({ key: c.key, v: `${c.avg}` }))} />
        <List title="Highest contradiction" rows={g.highestContradiction.map((c) => ({ key: c.key, v: `${c.ratio}` }))} />
      </div>
      {g.blindSpots.length > 0 ? <p className="text-[11px] text-warning">Blind-spot regions: {g.blindSpots.map((b) => `${b.key} (${b.severity})`).join(', ')}</p> : null}
    </Card>
  );
}

export function TransparencyWatch({ d }: { d: OperationsCenterData }) {
  const t = d.transparencyWatch;
  const Row = ({ label, value, total }: { label: string; value: number; total: number }) => (
    <div className="flex items-center gap-2 text-caption"><span className="w-40 shrink-0 text-text-secondary">{label}</span><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2/50"><div className="h-full rounded-full bg-electric/60" style={{ width: `${total > 0 ? Math.round((value / total) * 100) : 0}%` }} /></div><span className="w-20 shrink-0 text-right tabular-nums text-text-muted">{n(value)}/{n(total)}</span></div>
  );
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Transparency watch</h3></div>
      <div className="space-y-1.5">
        <Row label="Signals → source lineage" value={t.signalWithSource} total={t.totalSignals} />
        <Row label="Signals → evidence" value={t.signalWithEvidence} total={t.totalSignals} />
        <Row label="Signals → narrative" value={t.signalWithNarrative} total={t.totalSignals} />
        <Row label="Forecasts → narrative" value={t.forecastWithNarrative} total={t.totalForecasts} />
      </div>
      <p className="text-[11px] text-text-muted">{n(t.brokenChains)} broken transparency chain(s) — published reports with no linked signal.</p>
    </Card>
  );
}

export function RelationshipAudit({ d }: { d: OperationsCenterData }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><GitBranch className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Relationship audit</h3></div>
      <ul className="space-y-1">
        {d.integrity.map((c) => (
          <li key={c.key} className="flex flex-wrap items-center gap-2 text-caption">
            <span className="min-w-0 flex-1 truncate text-text-secondary">{c.label}</span>
            {c.observed ? <span className={`tabular-nums ${(c.count ?? 0) > 0 ? 'text-warning' : 'text-verified'}`}>{n(c.count ?? 0)}</span> : <span className="text-[10px] uppercase tracking-wide text-text-muted">not observed</span>}
            <span className="hidden text-[11px] text-text-muted sm:block">{c.note}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function OperationsTimeline({ d }: { d: OperationsCenterData }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Operations timeline</h3><span className="ml-auto text-caption text-text-muted">7d · 30d</span></div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {d.timeline.map((r) => <div key={r.label} className="flex items-center justify-between rounded-card border border-border bg-background-deep/40 px-3 py-2 text-caption"><span className="text-text-secondary">{r.label}</span><span className="tabular-nums text-text-primary">{n(r.last7)} <span className="text-text-muted">/ {n(r.last30)}</span></span></div>)}
      </div>
    </Card>
  );
}
