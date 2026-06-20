// =============================================================================
// HSI Phase 72 — Geospatial intelligence panels (server, display-only). Totals,
// blind-spot regions, region drill-down tables (country/region/city), and the
// geographic readiness report. Real counts only.
// =============================================================================

import { Card, MetricCard } from '@hsi/ui';
import { Globe, Layers, FileSearch, Target, AlertTriangle, ShieldCheck, Compass } from 'lucide-react';
import type { GeospatialIntelligence, GeoReadinessReport } from '@/lib/narrative-map/data';
import type { RegionBucket } from '@/lib/narrative-map/types';

const n = (v: number) => v.toLocaleString('en-US');

export function IntelOverview({ d }: { d: GeospatialIntelligence }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
      <MetricCard label="Geo-ready sources" value={n(d.totals.sources)} accent="#3B82F6" icon={Globe} />
      <MetricCard label="Narratives" value={n(d.totals.narratives)} accent="#8B5CF6" icon={Layers} />
      <MetricCard label="Evidence" value={n(d.totals.evidence)} accent="#EC4899" icon={FileSearch} />
      <MetricCard label="Forecasts" value={n(d.totals.forecasts)} accent="#10B981" icon={Target} />
      <MetricCard label="Contradictions" value={n(d.totals.contradicts)} accent="#F59E0B" icon={AlertTriangle} />
      <MetricCard label="Blind spots" value={n(d.totals.blindSpots)} accent="#EF4444" icon={AlertTriangle} />
    </div>
  );
}

const SEV_STYLE: Record<string, string> = { high: 'border-risk/40 bg-risk/10 text-risk', medium: 'border-warning/40 bg-warning/10 text-warning', low: 'border-border bg-surface-2/50 text-text-secondary', none: 'border-border bg-surface-2/50 text-text-muted' };

export function BlindSpotPanel({ d }: { d: GeospatialIntelligence }) {
  const spots = d.byRegion.filter((b) => b.blindSpot.isBlindSpot).sort((a, b) => (a.blindSpot.severity === b.blindSpot.severity ? b.narrativeCount + b.forecastCount - (a.narrativeCount + a.forecastCount) : (a.blindSpot.severity === 'high' ? -1 : 1)));
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-risk" /><h3 className="text-h6 font-semibold text-text-primary">Intelligence blind spots</h3><span className="ml-auto text-caption text-text-muted">{spots.length} region(s)</span></div>
      <p className="text-[11px] text-text-muted">Regions with narrative/forecast activity but no corroborating evidence. Observable imbalance only — never inferred conflict.</p>
      {spots.length === 0 ? <p className="text-caption text-text-muted">No blind spots — every geography with narrative/forecast activity has evidence.</p> : (
        <ul className="space-y-1.5">
          {spots.slice(0, 20).map((b) => (
            <li key={b.key} className="flex flex-wrap items-center gap-2 text-caption">
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${SEV_STYLE[b.blindSpot.severity]}`}>{b.blindSpot.severity}</span>
              <span className="min-w-0 flex-1 truncate text-text-secondary">{b.key}</span>
              <span className="shrink-0 text-[11px] text-text-muted">{b.blindSpot.reasons.join('; ')}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function RegionDetailTable({ title, rows }: { title: string; rows: RegionBucket[] }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><Compass className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">{title}</h3></div>
      {rows.length === 0 ? <p className="text-caption text-text-muted">No geo-ready intelligence yet.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-caption">
            <thead><tr className="text-left text-[10px] uppercase tracking-wide text-text-muted"><th className="py-1 pr-2">Geography</th><th className="px-1">Src</th><th className="px-1">Sig</th><th className="px-1">Ev</th><th className="px-1">Narr</th><th className="px-1">Fc</th><th className="px-1">C:S</th><th className="px-1">Trust</th><th className="px-1">Blind</th></tr></thead>
            <tbody>
              {rows.slice(0, 20).map((b) => (
                <tr key={b.key} className="border-t border-border/50 text-text-secondary">
                  <td className="py-1 pr-2 text-text-primary">{b.key}</td>
                  <td className="px-1 tabular-nums">{n(b.sourceCount)}</td>
                  <td className="px-1 tabular-nums">{n(b.signalCount)}</td>
                  <td className="px-1 tabular-nums">{n(b.evidenceCount)}</td>
                  <td className="px-1 tabular-nums">{n(b.narrativeCount)}</td>
                  <td className="px-1 tabular-nums">{n(b.forecastCount)}</td>
                  <td className="px-1 tabular-nums">{b.contradicts}:{b.supports}</td>
                  <td className="px-1 tabular-nums">{b.trust.avg ?? '—'}</td>
                  <td className="px-1">{b.blindSpot.isBlindSpot ? <span className="text-risk">{b.blindSpot.severity}</span> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function GeoReadinessPanel({ r }: { r: GeoReadinessReport }) {
  const Row = ({ label, value, total }: { label: string; value: number; total: number }) => (
    <div className="flex items-center gap-2 text-caption">
      <span className="w-28 shrink-0 text-text-secondary">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2/50"><div className="h-full rounded-full bg-electric/60" style={{ width: `${total > 0 ? Math.round((value / total) * 100) : 0}%` }} /></div>
      <span className="w-24 shrink-0 text-right tabular-nums text-text-muted">{n(value)} / {n(total)}</span>
    </div>
  );
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Geographic readiness report</h3></div>
      <div className="space-y-1.5">
        <Row label="Sources" value={r.sources.geoReady} total={r.sources.total} />
        <Row label="Signals" value={r.signals.withGeo} total={r.signals.total} />
        <Row label="Narratives" value={r.narratives.withGeo} total={r.narratives.total} />
        <Row label="Forecasts" value={r.forecasts.withGeo} total={r.forecasts.total} />
        <Row label="Evidence" value={r.evidence.linkedToGeoSources} total={r.evidence.linkedToAnySource} />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { l: 'Forecasts GEO_UNKNOWN', v: r.forecasts.geoUnknown }, { l: 'Sources missing geo', v: r.missingGeoInventory.sourcesMissingGeo },
          { l: 'Sources partial geo', v: r.missingGeoInventory.sourcesPartialGeo }, { l: 'Sources geo-ready', v: r.sources.geoReady },
        ].map((c) => <div key={c.l} className="rounded-card border border-border bg-background-deep/40 px-3 py-2 text-center"><div className="text-h6 font-bold tabular-nums text-text-primary">{n(c.v)}</div><div className="text-[10px] uppercase tracking-wide text-text-muted">{c.l}</div></div>)}
      </div>
      <p className="text-[11px] text-text-muted">Missing-geo inventory is real: run the geocoder (Phase 71) to convert partial-geo place text into coordinates. Signals/narratives/forecasts inherit geo through their source — they have no native coordinates.</p>
    </Card>
  );
}
