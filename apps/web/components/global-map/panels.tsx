// =============================================================================
// HSI Phase 71 — Map readiness panels (server, display-only). Geo readiness
// report (D8) + Phase 72 readiness (D10). Real counts only.
// =============================================================================

import { Card, MetricCard } from '@hsi/ui';
import { Map as MapIcon, Globe, CheckCircle2, CircleDashed, CircleOff, Compass } from 'lucide-react';
import type { Phase72Readiness } from '@/lib/global-map/data';
import type { MapReadiness, BreakdownRow } from '@/lib/global-map/readiness';

const n = (v: number) => v.toLocaleString('en-US');

export function MapReadinessOverview({ r, plottable }: { r: MapReadiness; plottable: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <MetricCard label="Total sources" value={n(r.totalSources)} accent="#3B82F6" icon={Globe} />
      <MetricCard label="Map-ready" value={n(r.geoReady)} accent="#10B981" icon={CheckCircle2} />
      <MetricCard label="Partial geo" value={n(r.partialGeo)} accent="#F59E0B" icon={CircleDashed} />
      <MetricCard label="Missing geo" value={n(r.missingGeo)} accent="#94A3B8" icon={CircleOff} />
      <MetricCard label="Plotted points" value={n(plottable)} accent="#8B5CF6" icon={MapIcon} />
    </div>
  );
}

function BreakdownTable({ title, rows }: { title: string; rows: BreakdownRow[] }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-wide text-text-muted">{title}</p>
      {rows.length === 0 ? <p className="text-caption text-text-muted">—</p> : (
        <ul className="space-y-0.5">
          {rows.slice(0, 10).map((b) => (
            <li key={b.key} className="flex items-center gap-2 text-caption">
              <span className="min-w-0 flex-1 truncate text-text-secondary">{b.key}</span>
              <span className="shrink-0 tabular-nums text-verified">{n(b.ready)}</span>
              <span className="shrink-0 tabular-nums text-warning">{n(b.partial)}</span>
              <span className="shrink-0 tabular-nums text-text-muted">{n(b.missing)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MapReadinessReport({ r }: { r: MapReadiness }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><Compass className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Geo readiness report</h3><span className="ml-auto text-caption text-text-muted">ready · partial · missing</span></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <BreakdownTable title="By source type" rows={r.byType} />
        <BreakdownTable title="By category" rows={r.byCategory} />
        <BreakdownTable title="By family" rows={r.byFamily} />
        <BreakdownTable title="By country" rows={r.byCountry} />
      </div>
    </Card>
  );
}

export function Phase72Panel({ r }: { r: Phase72Readiness }) {
  const cells = [
    { l: 'Map-ready sources', v: `${n(r.mapReadySources)} / ${n(r.totalSources)}` },
    { l: 'Signals inherit geo', v: `${n(r.signalsInheritingGeo)} / ${n(r.totalSignals)}` },
    { l: 'Narratives inherit geo', v: `${n(r.narrativesInheritingGeo)} / ${n(r.totalNarratives)}` },
    { l: 'Forecasts inherit geo', v: `${n(r.forecastsInheritingGeo)} / ${n(r.totalForecasts)}` },
  ];
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><MapIcon className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Phase 72 — Geospatial Narrative Intelligence readiness</h3></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cells.map((c) => <div key={c.l} className="rounded-card border border-border bg-background-deep/40 px-3 py-2 text-center"><div className="text-body-sm font-bold tabular-nums text-text-primary">{c.v}</div><div className="text-[10px] uppercase tracking-wide text-text-muted">{c.l}</div></div>)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><p className="text-[10px] uppercase tracking-wide text-text-muted">What remains missing</p><ul className="space-y-0.5">{r.missing.map((m, i) => <li key={i} className="text-[11px] text-warning">• {m}</li>)}</ul></div>
        <div className="space-y-1"><p className="text-[10px] uppercase tracking-wide text-text-muted">Required for Phase 72</p><ul className="space-y-0.5">{r.requiredForPhase72.map((m, i) => <li key={i} className="text-[11px] text-text-muted">• {m}</li>)}</ul></div>
      </div>
    </Card>
  );
}
