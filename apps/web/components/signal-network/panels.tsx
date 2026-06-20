// =============================================================================
// HSI Phase 70.4 — Signal Network panels (server, display-only). Totals, signal
// health, relationship counts, influence rankings, narrative + forecast
// attribution. List + metrics only (no graph visualization). Read-only.
// =============================================================================

import Link from 'next/link';
import { Card, MetricCard } from '@hsi/ui';
import { Activity, GitBranch, TrendingUp, Layers, Target, Radio, Network } from 'lucide-react';
import { Map as MapIcon } from 'lucide-react';
import type { SignalNetworkDashboard, SignalNetworkRow, SignalReadiness } from '@/lib/signal-network/data';
import type { SignalHealth, SignalRelationship } from '@/lib/signal-network/types';

const n = (v: number) => v.toLocaleString('en-US');

const HEALTH_STYLE: Record<SignalHealth, string> = {
  ESCALATING: 'border-risk/40 bg-risk/10 text-risk', ACTIVE: 'border-verified/40 bg-verified/10 text-verified',
  DORMANT: 'border-border bg-surface-2/50 text-text-muted', CONTRADICTED: 'border-warning/40 bg-warning/10 text-warning',
  RESOLVED: 'border-electric/40 bg-electric/10 text-electric', ARCHIVED: 'border-border bg-surface-2/50 text-text-muted',
  UNKNOWN: 'border-border bg-surface-2/50 text-text-muted',
};

function Badge({ label, className }: { label: string; className: string }) {
  return <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${className}`}>{label}</span>;
}
function SignalLink({ r }: { r: SignalNetworkRow }) {
  return <Link href={`/dashboard/signal-network/${r.id}` as never} className="min-w-0 flex-1 truncate font-medium text-text-primary hover:text-electric">{r.title}</Link>;
}

export function SignalNetworkOverview({ d }: { d: SignalNetworkDashboard }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <MetricCard label="Signals" value={n(d.totals.signals)} accent="#3B82F6" icon={Radio} />
      <MetricCard label="With narrative" value={n(d.totals.withNarrative)} accent="#8B5CF6" icon={Layers} />
      <MetricCard label="With forecast" value={n(d.totals.withForecast)} accent="#10B981" icon={Target} />
      <MetricCard label="With relationships" value={n(d.totals.withRelationship)} accent="#F59E0B" icon={GitBranch} />
      <MetricCard label="With evidence" value={n(d.totals.withEvidence)} accent="#EC4899" icon={Network} />
    </div>
  );
}

export function SignalHealthPanel({ d }: { d: SignalNetworkDashboard }) {
  const total = d.healthBreakdown.reduce((s, b) => s + b.count, 0) || 1;
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Signal health</h3></div>
      <ul className="space-y-1.5">
        {d.healthBreakdown.map((b) => (
          <li key={b.health} className="flex items-center gap-2 text-caption">
            <Badge label={b.health} className={HEALTH_STYLE[b.health]} />
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2/50"><div className="h-full rounded-full bg-electric/50" style={{ width: `${Math.round((b.count / total) * 100)}%` }} /></div>
            <span className="w-10 shrink-0 text-right tabular-nums text-text-muted">{n(b.count)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

const REL_LABEL: Record<SignalRelationship, string> = { SUPPORTS: 'Supports', CONTRADICTS: 'Contradicts', REFERENCES: 'References', DERIVED_FROM: 'Derived from', RELATED_TO: 'Related to' };
export function RelationshipCountsPanel({ d }: { d: SignalNetworkDashboard }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><GitBranch className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Relationship counts</h3><span className="ml-auto text-caption text-text-muted">real edges only</span></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {d.relationshipCounts.map((r) => <div key={r.type} className="rounded-card border border-border bg-background-deep/40 px-3 py-2 text-center"><div className="text-h6 font-bold tabular-nums text-text-primary">{n(r.count)}</div><div className="text-[10px] uppercase tracking-wide text-text-muted">{REL_LABEL[r.type]}</div></div>)}
      </div>
    </Card>
  );
}

export function InfluenceRankingPanel({ d }: { d: SignalNetworkDashboard }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Influence rankings</h3><span className="ml-auto text-caption text-text-muted">reach + downstream usage + evidence</span></div>
      {d.topInfluence.length === 0 ? <p className="text-caption text-text-muted">No signals with observed relationships yet.</p> : (
        <ul className="space-y-1.5">
          {d.topInfluence.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 text-caption">
              <Badge label={r.health} className={HEALTH_STYLE[r.health]} />
              <SignalLink r={r} />
              <span className="shrink-0 tabular-nums text-text-secondary">reach {n(r.influence.reach)} · use {n(r.influence.downstreamUsage)} · ev {n(r.influence.evidenceCount)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function NarrativeAttributionPanel({ d }: { d: SignalNetworkDashboard }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><Layers className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Narrative attribution</h3><span className="ml-auto text-caption text-text-muted">{d.narrativeAttribution.length}</span></div>
      {d.narrativeAttribution.length === 0 ? <p className="text-caption text-text-muted">No signals are attributed to a narrative yet.</p> : (
        <ul className="space-y-1.5">
          {d.narrativeAttribution.map((nr) => (
            <li key={nr.id} className="flex flex-wrap items-center gap-2 text-caption">
              <Link href={'/dashboard/narratives' as never} className="min-w-0 flex-1 truncate text-text-primary hover:text-electric">{nr.name}</Link>
              {nr.status ? <span className="text-[10px] uppercase tracking-wide text-text-muted">{nr.status}</span> : null}
              <span className="shrink-0 tabular-nums text-text-secondary">{n(nr.signalCount)} sig · {n(nr.evidenceCount)} ev · {n(nr.forecastCount)} fc</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function SignalReadinessPanel({ r }: { r: SignalReadiness }) {
  const cells = [
    { l: 'Source lineage', v: r.withSourceLineage }, { l: 'Narrative', v: r.withNarrative }, { l: 'Forecast', v: r.withForecast },
    { l: 'Relationship', v: r.withRelationship }, { l: 'Geo', v: r.withGeo },
    { l: 'Missing geo', v: r.missingGeo }, { l: 'Missing narrative', v: r.missingNarrative }, { l: 'Missing evidence', v: r.missingEvidence },
  ];
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><MapIcon className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Phase 71 — signal map readiness</h3><span className="ml-auto text-caption text-text-muted">{n(r.totalSignals)} signals · real counts</span></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cells.map((c) => <div key={c.l} className="rounded-card border border-border bg-background-deep/40 px-3 py-2 text-center"><div className="text-h6 font-bold tabular-nums text-text-primary">{n(c.v)}</div><div className="text-[10px] uppercase tracking-wide text-text-muted">{c.l}</div></div>)}
      </div>
      <p className="text-[11px] text-text-muted">Signals have no geo columns of their own — geo is inherited from the source (via approved candidate coordinates). Most signals are <span className="text-warning">missing geo</span> until sources are geocoded; this is the primary Phase 71 gap for the signal layer.</p>
    </Card>
  );
}

export function ForecastAttributionPanel({ d }: { d: SignalNetworkDashboard }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><Target className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Forecast attribution</h3><span className="ml-auto text-caption text-text-muted">why each forecast exists</span></div>
      {d.forecastAttribution.length === 0 ? <p className="text-caption text-text-muted">No forecasts recorded yet.</p> : (
        <ul className="space-y-1.5">
          {d.forecastAttribution.map((f) => (
            <li key={f.id} className="space-y-0.5 rounded-card border border-border bg-background-deep/40 px-3 py-2 text-caption">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={'/dashboard/forecast-validation' as never} className="min-w-0 flex-1 truncate font-medium text-text-primary hover:text-electric">{f.title}</Link>
                {f.status ? <span className="text-[10px] uppercase tracking-wide text-text-muted">{f.status}</span> : null}
              </div>
              <p className="text-[11px] text-text-muted">{f.narrativeName ? <>via narrative <span className="text-text-secondary">{f.narrativeName}</span> · </> : 'no narrative link · '}{n(f.signalCount)} signals · {n(f.evidenceCount)} evidence</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
