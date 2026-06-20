// =============================================================================
// HSI Phase 70.3.3 — Source Network panels (server, display-only). Health,
// capability, geo readiness, source families, yield, collection priority queue,
// and the Phase 71 readiness report. No actions — read-only intelligence view.
// =============================================================================

import Link from 'next/link';
import { Card, MetricCard } from '@hsi/ui';
import { Activity, Gauge, MapPin, Network, TrendingUp, TrendingDown, ListChecks, Map as MapIcon, AlertTriangle, Boxes } from 'lucide-react';
import type { SourceNetworkDashboard, SourceNetworkRow, SourceNetworkDetail, Phase71Readiness } from '@/lib/source-network/data';
import type { SourceHealth, CapabilityTier, GeoReadiness, CollectionPriority } from '@/lib/source-network/types';

const n = (v: number) => v.toLocaleString('en-US');

const HEALTH_STYLE: Record<SourceHealth, string> = {
  healthy: 'border-verified/40 bg-verified/10 text-verified', degraded: 'border-warning/40 bg-warning/10 text-warning',
  offline: 'border-risk/40 bg-risk/10 text-risk', blocked: 'border-risk/40 bg-risk/10 text-risk',
  paused: 'border-border bg-surface-2/50 text-text-secondary', archived: 'border-border bg-surface-2/50 text-text-muted',
  unknown: 'border-border bg-surface-2/50 text-text-muted',
};
const CAP_STYLE: Record<CapabilityTier, string> = {
  high: 'border-verified/40 bg-verified/10 text-verified', medium: 'border-electric/40 bg-electric/10 text-electric',
  low: 'border-warning/40 bg-warning/10 text-warning', manual: 'border-border bg-surface-2/50 text-text-secondary',
  degraded: 'border-risk/40 bg-risk/10 text-risk',
};
const GEO_STYLE: Record<GeoReadiness, string> = {
  geo_ready: 'border-verified/40 bg-verified/10 text-verified', partial_geo: 'border-warning/40 bg-warning/10 text-warning',
  missing_geo: 'border-border bg-surface-2/50 text-text-muted', not_applicable: 'border-border bg-surface-2/50 text-text-muted',
};
const PRIO_STYLE: Record<CollectionPriority, string> = {
  critical: 'border-risk/40 bg-risk/10 text-risk', high: 'border-warning/40 bg-warning/10 text-warning',
  medium: 'border-electric/40 bg-electric/10 text-electric', low: 'border-border bg-surface-2/50 text-text-secondary',
  archive: 'border-border bg-surface-2/50 text-text-muted',
};

function Badge({ label, className }: { label: string; className: string }) {
  return <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${className}`}>{label.replace(/_/g, ' ')}</span>;
}

export function NetworkOverview({ d }: { d: SourceNetworkDashboard }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
      <MetricCard label="Total sources" value={n(d.totals.total)} accent="#3B82F6" icon={Network} />
      <MetricCard label="Healthy" value={n(d.totals.healthy)} accent="#10B981" icon={Activity} />
      <MetricCard label="Degraded" value={n(d.totals.degraded)} accent="#F59E0B" icon={Gauge} />
      <MetricCard label="Offline / blocked" value={n(d.totals.offline + d.totals.blocked)} accent="#EF4444" icon={AlertTriangle} />
      <MetricCard label="Paused" value={n(d.totals.paused)} accent="#94A3B8" icon={ListChecks} />
      <MetricCard label="Families" value={n(d.families.length)} accent="#8B5CF6" icon={Boxes} />
    </div>
  );
}

function BreakdownBar({ title, icon: Icon, rows }: { title: string; icon: typeof Activity; rows: { label: string; count: number; className: string }[] }) {
  const total = rows.reduce((s, r) => s + r.count, 0) || 1;
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><Icon className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">{title}</h3></div>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2 text-caption">
            <Badge label={r.label} className={r.className} />
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2/50"><div className="h-full rounded-full bg-electric/50" style={{ width: `${Math.round((r.count / total) * 100)}%` }} /></div>
            <span className="w-10 shrink-0 text-right tabular-nums text-text-muted">{n(r.count)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function HealthBreakdownPanel({ d }: { d: SourceNetworkDashboard }) {
  return <BreakdownBar title="Health breakdown" icon={Activity} rows={d.healthBreakdown.map((b) => ({ label: b.health, count: b.count, className: HEALTH_STYLE[b.health] }))} />;
}
export function CapabilityBreakdownPanel({ d }: { d: SourceNetworkDashboard }) {
  return <BreakdownBar title="Collection capability" icon={Gauge} rows={d.capabilityBreakdown.map((b) => ({ label: b.tier, count: b.count, className: CAP_STYLE[b.tier] }))} />;
}
export function GeoReadinessPanel({ d }: { d: SourceNetworkDashboard }) {
  return <BreakdownBar title="Geo readiness" icon={MapPin} rows={d.geoBreakdown.map((b) => ({ label: b.readiness, count: b.count, className: GEO_STYLE[b.readiness] }))} />;
}
export function PriorityBreakdownPanel({ d }: { d: SourceNetworkDashboard }) {
  return <BreakdownBar title="Collection priority" icon={ListChecks} rows={d.priorityBreakdown.map((b) => ({ label: b.priority, count: b.count, className: PRIO_STYLE[b.priority] }))} />;
}

function RowLink({ r }: { r: SourceNetworkRow }) {
  return <Link href={`/dashboard/source-discovery/source/${r.id}` as never} className="min-w-0 flex-1 truncate font-medium text-text-primary hover:text-electric" title={r.homepageUrl ?? ''}>{r.name}</Link>;
}

export function YieldPanels({ d }: { d: SourceNetworkDashboard }) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card className="space-y-3">
        <div className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-verified" /><h3 className="text-h6 font-semibold text-text-primary">Top yield sources</h3></div>
        {d.topYield.length === 0 ? <p className="text-caption text-text-muted">No signals observed from any source yet.</p> : (
          <ul className="space-y-1.5">{d.topYield.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-caption"><RowLink r={r} /><span className="shrink-0 tabular-nums text-text-secondary">{n(r.yield.signals)} sig · {n(r.yield.evidence)} ev · {n(r.yield.reports)} rep</span></li>
          ))}</ul>
        )}
      </Card>
      <Card className="space-y-3">
        <div className="flex items-center gap-2"><TrendingDown className="h-4 w-4 text-warning" /><h3 className="text-h6 font-semibold text-text-primary">Low-yield sources</h3></div>
        <p className="text-[11px] text-text-muted">Active sources with no observed signals/evidence/reports yet.</p>
        {d.lowYield.length === 0 ? <p className="text-caption text-text-muted">Every source has produced something.</p> : (
          <ul className="space-y-1.5">{d.lowYield.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-caption"><RowLink r={r} /><Badge label={r.health} className={HEALTH_STYLE[r.health]} /></li>
          ))}</ul>
        )}
      </Card>
    </div>
  );
}

export function PriorityQueuePanel({ d }: { d: SourceNetworkDashboard }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><ListChecks className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Collection priority queue</h3><span className="ml-auto text-caption text-text-muted">what to collect first</span></div>
      {d.priorityQueue.length === 0 ? <p className="text-caption text-text-muted">No sources in the registry.</p> : (
        <ul className="space-y-1.5">
          {d.priorityQueue.map((r) => (
            <li key={r.id} className="space-y-0.5 rounded-card border border-border bg-background-deep/40 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2 text-caption">
                <Badge label={r.priority} className={PRIO_STYLE[r.priority]} />
                <RowLink r={r} />
                <Badge label={r.health} className={HEALTH_STYLE[r.health]} />
                <Badge label={r.capabilityTier} className={CAP_STYLE[r.capabilityTier]} />
              </div>
              <p className="text-[11px] text-text-muted">{r.priorityReason}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function FamiliesPanel({ d }: { d: SourceNetworkDashboard }) {
  const multi = d.families.filter((f) => f.size > 1);
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><Boxes className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Source families</h3><span className="ml-auto text-caption text-text-muted">{multi.length} multi-asset</span></div>
      <p className="text-[11px] text-text-muted">Deterministic grouping of related assets (website + RSS + YouTube under one org). Grouping only — records are never merged.</p>
      {multi.length === 0 ? <p className="text-caption text-text-muted">No multi-asset families detected yet.</p> : (
        <ul className="space-y-1.5">
          {multi.slice(0, 20).map((f) => (
            <li key={f.familyKey} className="rounded-card border border-border bg-background-deep/40 px-3 py-2 text-caption">
              <div className="flex items-center gap-2"><span className="font-medium text-text-primary">{f.displayName}</span><span className="text-[10px] uppercase tracking-wide text-text-muted">{f.familyKey}</span><span className="ml-auto text-text-muted">{f.size} assets</span></div>
              <div className="mt-1 flex flex-wrap gap-1">{f.members.map((m) => <span key={m.id} className="rounded-full border border-border bg-surface-2/40 px-2 py-0.5 text-[10px] text-text-secondary">{m.role}</span>)}</div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function NeedsReviewPanel({ d }: { d: SourceNetworkDashboard }) {
  const items = d.needsReview;
  const missing = d.missingFeed;
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card className="space-y-3">
        <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-risk" /><h3 className="text-h6 font-semibold text-text-primary">Needs attention</h3><span className="ml-auto text-caption text-text-muted">{items.length}</span></div>
        {items.length === 0 ? <p className="text-caption text-text-muted">No offline/blocked/degraded sources.</p> : (
          <ul className="space-y-1.5">{items.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-caption"><Badge label={r.health} className={HEALTH_STYLE[r.health]} /><RowLink r={r} /></li>
          ))}</ul>
        )}
      </Card>
      <Card className="space-y-3">
        <div className="flex items-center gap-2"><Gauge className="h-4 w-4 text-warning" /><h3 className="text-h6 font-semibold text-text-primary">Missing feeds</h3><span className="ml-auto text-caption text-text-muted">{missing.length}</span></div>
        <p className="text-[11px] text-text-muted">Web sources without a structured feed/API — adding one raises collectability.</p>
        {missing.length === 0 ? <p className="text-caption text-text-muted">All collectable sources have a feed.</p> : (
          <ul className="space-y-1.5">{missing.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-caption"><RowLink r={r} /><Badge label={r.capabilityTier} className={CAP_STYLE[r.capabilityTier]} /></li>
          ))}</ul>
        )}
      </Card>
    </div>
  );
}

export function Phase71Panel({ r }: { r: Phase71Readiness }) {
  const cells = [
    { l: 'Geo-ready sources', v: r.geoReadySources }, { l: 'Partial geo', v: r.partialGeoSources }, { l: 'Missing geo', v: r.missingGeoSources }, { l: 'N/A', v: r.notApplicableSources },
    { l: 'Geo-ready candidates', v: r.geoReadyCandidates }, { l: 'Geo-ready signals', v: r.geoReadySignals }, { l: 'Geo-ready narratives', v: r.geoReadyNarratives }, { l: 'Geo-ready forecasts', v: r.geoReadyForecasts },
  ];
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><MapIcon className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Phase 71 — Global Intelligence Map readiness</h3></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cells.map((c) => <div key={c.l} className="rounded-card border border-border bg-background-deep/40 px-3 py-2 text-center"><div className="text-h6 font-bold tabular-nums text-text-primary">{n(c.v)}</div><div className="text-[10px] uppercase tracking-wide text-text-muted">{c.l}</div></div>)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wide text-text-muted">Highest-value map-ready categories</p>
          {r.topMapReadyCategories.length === 0 ? <p className="text-caption text-text-muted">None geocoded yet.</p> : <ul className="space-y-0.5">{r.topMapReadyCategories.map((c) => <li key={c.category} className="flex items-center justify-between text-caption"><span className="text-text-secondary">{c.category}</span><span className="tabular-nums text-text-muted">{c.count}</span></li>)}</ul>}
        </div>
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wide text-text-muted">Biggest map-readiness gaps</p>
          <ul className="space-y-0.5">{r.biggestGaps.map((g, i) => <li key={i} className="text-[11px] text-warning">• {g}</li>)}</ul>
        </div>
      </div>
    </Card>
  );
}
