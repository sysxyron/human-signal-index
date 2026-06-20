'use client';
// =============================================================================
// HSI Phase 72 — Layered map explorer (client). Switchable layers (Step 8),
// deterministic filters, the layered MapLibre canvas, an attribution panel, and
// a live region table for the active layer. All values are real; switching a
// layer only re-weights the same real points. No fabricated data.
// =============================================================================

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Card } from '@hsi/ui';
import { Layers, MapPin, X } from 'lucide-react';
import type { GeospatialIntelligence } from '@/lib/narrative-map/data';
import { MAP_LAYERS, type MapLayer, type GeoIntelPoint } from '@/lib/narrative-map/types';
import { layerWeight } from '@/lib/narrative-map/aggregate';

const LayeredMapCanvas = dynamic(() => import('./LayeredMapCanvas').then((m) => m.LayeredMapCanvas), { ssr: false, loading: () => <div className="h-[60vh] min-h-[420px] w-full animate-pulse rounded-card border border-border bg-surface-2/30" /> });

const LAYER_LABEL: Record<MapLayer, string> = { SOURCES: 'Sources', NARRATIVES: 'Narratives', EVIDENCE: 'Evidence', FORECASTS: 'Forecasts', CONTRADICTIONS: 'Contradictions', TRUST: 'Trust', BLIND_SPOTS: 'Blind spots' };
const n = (v: number) => v.toLocaleString('en-US');

interface Filters { type: string; category: string; country: string; minNarratives: number; minEvidence: number; minForecasts: number }
const EMPTY: Filters = { type: '', category: '', country: '', minNarratives: 0, minEvidence: 0, minForecasts: 0 };

export function LayeredMapExplorer({ data }: { data: GeospatialIntelligence }) {
  const [layer, setLayer] = useState<MapLayer>('NARRATIVES');
  const [f, setF] = useState<Filters>(EMPTY);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setF((p) => ({ ...p, [k]: v }));

  const points = useMemo(() => data.points.filter((p) =>
    (!f.type || p.sourceType === f.type) && (!f.category || p.category === f.category) && (!f.country || p.country === f.country) &&
    p.narrativeCount >= f.minNarratives && p.evidenceCount >= f.minEvidence && p.forecastCount >= f.minForecasts,
  ), [data.points, f]);

  const selected: GeoIntelPoint | null = useMemo(() => data.points.find((p) => p.id === selectedId) ?? null, [data.points, selectedId]);

  // top countries for the active layer (from full server rollup)
  const topRegions = useMemo(() => [...data.byCountry]
    .map((b) => ({ key: b.key, weight: layerWeight({ signalCount: b.signalCount, narrativeCount: b.narrativeCount, evidenceCount: b.evidenceCount, forecastCount: b.forecastCount, contradicts: b.contradicts, trustScore: b.trust.avg, blindSpot: b.blindSpot }, layer), bucket: b }))
    .filter((r) => r.weight > 0 || layer === 'SOURCES')
    .sort((a, b) => b.weight - a.weight).slice(0, 12), [data.byCountry, layer]);

  return (
    <div className="space-y-4">
      {/* layer switcher (Step 8) */}
      <div className="flex flex-wrap gap-1.5">
        {MAP_LAYERS.map((l) => (
          <button key={l} onClick={() => setLayer(l)} className={`rounded-full border px-3 py-1 text-caption ${layer === l ? 'border-electric bg-electric/15 text-electric' : 'border-border bg-surface-2/40 text-text-secondary hover:text-text-primary'}`}>
            <Layers className="mr-1 inline h-3 w-3" />{LAYER_LABEL[l]}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        {/* filters */}
        <Card className="space-y-3 self-start">
          <div className="flex items-center gap-2"><h3 className="text-h6 font-semibold text-text-primary">Filters</h3>{Object.values(f).some((v) => v !== '' && v !== 0) ? <button onClick={() => setF(EMPTY)} className="ml-auto inline-flex items-center gap-1 text-[10px] text-text-muted hover:text-electric"><X className="h-3 w-3" /> reset</button> : null}</div>
          <Select label="Source type" value={f.type} onChange={(v) => set('type', v)} options={data.filters.types} />
          <Select label="Category" value={f.category} onChange={(v) => set('category', v)} options={data.filters.categories} />
          <Select label="Country" value={f.country} onChange={(v) => set('country', v)} options={data.filters.countries} />
          <div className="grid grid-cols-3 gap-2">
            <Num label="Min narr" value={f.minNarratives} onChange={(v) => set('minNarratives', v)} />
            <Num label="Min ev" value={f.minEvidence} onChange={(v) => set('minEvidence', v)} />
            <Num label="Min fc" value={f.minForecasts} onChange={(v) => set('minForecasts', v)} />
          </div>
          <p className="text-[11px] text-text-muted">{n(points.length)} of {n(data.pointTotal)} geo-ready sources{data.capped ? ` (first ${n(data.points.length)})` : ''}.</p>
        </Card>

        <div className="space-y-4">
          <LayeredMapCanvas points={points} layer={layer} onSelect={setSelectedId} />
          {selected ? <Attribution p={selected} onClose={() => setSelectedId(null)} /> : null}

          {/* live region table for active layer */}
          <Card className="space-y-2">
            <h3 className="text-h6 font-semibold text-text-primary">Top countries — {LAYER_LABEL[layer]}</h3>
            {topRegions.length === 0 ? <p className="text-caption text-text-muted">No {LAYER_LABEL[layer].toLowerCase()} observed in any geography yet.</p> : (
              <ul className="space-y-0.5">
                {topRegions.map((r) => (
                  <li key={r.key} className="flex items-center gap-2 text-caption">
                    <span className="min-w-0 flex-1 truncate text-text-secondary">{r.key}</span>
                    <span className="tabular-nums text-text-muted">{layer === 'TRUST' ? `avg ${r.bucket.trust.avg ?? '—'}` : layer === 'CONTRADICTIONS' ? `${r.bucket.contradicts} c / ${r.bucket.supports} s` : n(r.weight)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return <label className="block space-y-1"><span className="text-[10px] uppercase tracking-wide text-text-muted">{label}</span><select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-card border border-border bg-background-deep px-2 py-1 text-caption text-text-primary"><option value="">All</option>{options.map((o) => <option key={o} value={o}>{o}</option>)}</select></label>;
}
function Num({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return <label className="block space-y-1"><span className="text-[10px] uppercase tracking-wide text-text-muted">{label}</span><input type="number" min={0} value={value} onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))} className="w-full rounded-card border border-border bg-background-deep px-2 py-1 text-caption text-text-primary" /></label>;
}

function Attribution({ p, onClose }: { p: GeoIntelPoint; onClose: () => void }) {
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <MapPin className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">{p.name}</h3>
        <span className="text-[10px] uppercase tracking-wide text-text-muted">{p.sourceType ?? '—'}{p.category ? ` · ${p.category}` : ''}</span>
        {p.blindSpot.isBlindSpot ? <span className="rounded-full border border-risk/40 bg-risk/10 px-2 py-0.5 text-[10px] text-risk">blind spot · {p.blindSpot.severity}</span> : null}
        <button onClick={onClose} className="ml-auto inline-flex items-center gap-1 text-[10px] text-text-muted hover:text-electric"><X className="h-3 w-3" /> close</button>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {[['Signals', p.signalCount], ['Evidence', p.evidenceCount], ['Narratives', p.narrativeCount], ['Forecasts', p.forecastCount], ['Contradict', p.contradicts], ['Trust', p.trustScore ?? 0]].map(([l, v]) => <div key={l} className="rounded-card border border-border bg-background-deep/40 px-2 py-2 text-center"><div className="text-body-sm font-bold tabular-nums text-text-primary">{n(v as number)}</div><div className="text-[10px] uppercase tracking-wide text-text-muted">{l}</div></div>)}
      </div>
      <p className="text-[11px] text-text-muted">{p.country ?? '—'}{p.region ? `, ${p.region}` : ''}{p.city ? `, ${p.city}` : ''} · {p.lat.toFixed(2)}, {p.lng.toFixed(2)}{p.blindSpot.isBlindSpot ? ` · ${p.blindSpot.reasons.join('; ')}` : ''}</p>
      <div className="flex flex-wrap gap-2">
        <Link href={`/dashboard/source-discovery/source/${p.id}` as never} className="rounded-card border border-border bg-surface-2/40 px-3 py-1.5 text-caption text-electric hover:underline">Source detail & lineage →</Link>
        <Link href={'/dashboard/signal-network' as never} className="rounded-card border border-border bg-surface-2/40 px-3 py-1.5 text-caption text-text-secondary hover:text-electric">Signal network</Link>
      </div>
    </Card>
  );
}
