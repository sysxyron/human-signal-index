'use client';
// =============================================================================
// HSI Phase 71 — Map explorer (client). Deterministic sidebar filters (D6), the
// MapLibre canvas (D3/D4/D5), and the attribution panel (D7). All filtering is
// exact/threshold-based — no fuzzy matching, no fabricated data. The map only
// ever plots real GEO_READY points handed down from the server.
// =============================================================================

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Card } from '@hsi/ui';
import { Filter, MapPin, X } from 'lucide-react';
import type { MapPoint } from '@/lib/global-map/geo-model';
import type { GlobalMapData } from '@/lib/global-map/data';

const MapCanvas = dynamic(() => import('./MapCanvas').then((m) => m.MapCanvas), { ssr: false, loading: () => <div className="h-[60vh] min-h-[420px] w-full animate-pulse rounded-card border border-border bg-surface-2/30" /> });

interface Filters { type: string; category: string; health: string; country: string; region: string; minSignals: number; minNarratives: number; minForecasts: number }
const EMPTY: Filters = { type: '', category: '', health: '', country: '', region: '', minSignals: 0, minNarratives: 0, minForecasts: 0 };

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] uppercase tracking-wide text-text-muted">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-card border border-border bg-background-deep px-2 py-1 text-caption text-text-primary">
        <option value="">All</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}
function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] uppercase tracking-wide text-text-muted">{label}</span>
      <input type="number" min={0} value={value} onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))} className="w-full rounded-card border border-border bg-background-deep px-2 py-1 text-caption text-text-primary" />
    </label>
  );
}

export function MapExplorer({ data }: { data: GlobalMapData }) {
  const [f, setF] = useState<Filters>(EMPTY);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setF((p) => ({ ...p, [k]: v }));

  const points = useMemo(() => data.points.filter((p) =>
    (!f.type || p.sourceType === f.type) &&
    (!f.category || p.category === f.category) &&
    (!f.health || p.health === f.health) &&
    (!f.country || p.country === f.country) &&
    (!f.region || p.region === f.region) &&
    p.signalCount >= f.minSignals && p.narrativeCount >= f.minNarratives && p.forecastCount >= f.minForecasts,
  ), [data.points, f]);

  const selected: MapPoint | null = useMemo(() => points.find((p) => p.id === selectedId) ?? data.points.find((p) => p.id === selectedId) ?? null, [points, data.points, selectedId]);
  const active = Object.values(f).some((v) => v !== '' && v !== 0);

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      {/* sidebar filters (D6) */}
      <Card className="space-y-3 self-start">
        <div className="flex items-center gap-2"><Filter className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Filters</h3>{active ? <button onClick={() => setF(EMPTY)} className="ml-auto inline-flex items-center gap-1 text-[10px] text-text-muted hover:text-electric"><X className="h-3 w-3" /> reset</button> : null}</div>
        <Select label="Source type" value={f.type} onChange={(v) => set('type', v)} options={data.filters.types} />
        <Select label="Category" value={f.category} onChange={(v) => set('category', v)} options={data.filters.categories} />
        <Select label="Health" value={f.health} onChange={(v) => set('health', v)} options={data.filters.healths} />
        <Select label="Country" value={f.country} onChange={(v) => set('country', v)} options={data.filters.countries} />
        <Select label="Region" value={f.region} onChange={(v) => set('region', v)} options={data.filters.regions} />
        <div className="grid grid-cols-3 gap-2">
          <NumberField label="Min sig" value={f.minSignals} onChange={(v) => set('minSignals', v)} />
          <NumberField label="Min narr" value={f.minNarratives} onChange={(v) => set('minNarratives', v)} />
          <NumberField label="Min fc" value={f.minForecasts} onChange={(v) => set('minForecasts', v)} />
        </div>
        <p className="text-[11px] text-text-muted">{points.length.toLocaleString('en-US')} of {data.plottableTotal.toLocaleString('en-US')} map-ready sources{data.capped ? ` (showing first ${data.points.length.toLocaleString('en-US')})` : ''}.</p>
      </Card>

      {/* map + attribution */}
      <div className="space-y-4">
        <MapCanvas points={points} onSelect={setSelectedId} />
        {selected ? <AttributionPanel p={selected} onClose={() => setSelectedId(null)} /> : (
          <Card className="space-y-1"><p className="text-caption text-text-muted">Click a source point to see its full attribution — signals, evidence, narratives, forecasts, and transparency lineage.</p></Card>
        )}
      </div>
    </div>
  );
}

// ---- attribution panel (D7) -------------------------------------------------
function AttributionPanel({ p, onClose }: { p: MapPoint; onClose: () => void }) {
  const n = (v: number) => v.toLocaleString('en-US');
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <MapPin className="h-4 w-4 text-electric" />
        <h3 className="text-h6 font-semibold text-text-primary">{p.name}</h3>
        <span className="text-[10px] uppercase tracking-wide text-text-muted">{p.sourceType ?? '—'}{p.category ? ` · ${p.category}` : ''} · {p.health}</span>
        <button onClick={onClose} className="ml-auto inline-flex items-center gap-1 text-[10px] text-text-muted hover:text-electric"><X className="h-3 w-3" /> close</button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { l: 'Signals', v: p.signalCount }, { l: 'Narratives', v: p.narrativeCount }, { l: 'Forecasts', v: p.forecastCount },
          { l: 'Geo conf.', v: p.geoConfidence ?? 0 },
        ].map((c) => <div key={c.l} className="rounded-card border border-border bg-background-deep/40 px-3 py-2 text-center"><div className="text-h6 font-bold tabular-nums text-text-primary">{typeof c.v === 'number' && c.l === 'Geo conf.' ? c.v : n(c.v as number)}</div><div className="text-[10px] uppercase tracking-wide text-text-muted">{c.l}</div></div>)}
      </div>
      <p className="text-[11px] text-text-muted">{p.country ?? '—'}{p.region ? `, ${p.region}` : ''} · {p.lat.toFixed(3)}, {p.lng.toFixed(3)} · geo source {p.geoSource ?? '—'}</p>
      <div className="flex flex-wrap gap-2">
        <Link href={`/dashboard/source-discovery/source/${p.id}` as never} className="rounded-card border border-border bg-surface-2/40 px-3 py-1.5 text-caption text-electric hover:underline">Source detail & lineage →</Link>
        <Link href={'/dashboard/signal-network' as never} className="rounded-card border border-border bg-surface-2/40 px-3 py-1.5 text-caption text-text-secondary hover:text-electric">Signal network</Link>
        <Link href={'/transparency' as never} className="rounded-card border border-border bg-surface-2/40 px-3 py-1.5 text-caption text-text-secondary hover:text-electric">Transparency</Link>
      </div>
      <p className="text-[11px] text-text-muted">Every figure is a real count; coordinates come from {p.geoSource ?? 'an imported geo field'}. Full evidence/narrative/forecast lineage is on the source detail page.</p>
    </Card>
  );
}
