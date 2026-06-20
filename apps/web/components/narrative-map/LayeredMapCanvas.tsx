'use client';
// =============================================================================
// HSI Phase 72 — Layered MapLibre canvas (client). Same MapLibre + OpenStreetMap
// + clustering as Phase 71 (no new map framework). Each point carries a `weight`
// = the active layer's REAL metric; clusters sum it (clusterProperties). Changing
// layer recomputes weights and re-renders the SAME real points. Degrades to a
// notice if tiles can't load. No fabricated points.
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import { layerWeight } from '@/lib/narrative-map/aggregate';
import type { GeoIntelPoint, MapLayer } from '@/lib/narrative-map/types';

const MAPLIBRE_JS = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';
const MAPLIBRE_CSS = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
const OSM_STYLE = { version: 8, sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' } }, layers: [{ id: 'osm', type: 'raster', source: 'osm' }] } as const;

const LAYER_COLOR: Record<MapLayer, string> = {
  SOURCES: '#94A3B8', NARRATIVES: '#8B5CF6', EVIDENCE: '#EC4899', FORECASTS: '#10B981', CONTRADICTIONS: '#F59E0B', TRUST: '#3B82F6', BLIND_SPOTS: '#EF4444',
};

function toGeoJSON(points: GeoIntelPoint[], layer: MapLayer) {
  return {
    type: 'FeatureCollection',
    features: points
      .map((p) => ({ p, w: layerWeight(p, layer) }))
      .filter(({ w }) => (layer === 'BLIND_SPOTS' ? w > 0 : true)) // blind-spot layer shows only flagged points
      .map(({ p, w }) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: { id: p.id, name: p.name, weight: w } })),
  };
}

function loadMaplibre(): Promise<unknown> {
  const w = window as unknown as { maplibregl?: unknown };
  if (w.maplibregl) return Promise.resolve(w.maplibregl);
  return new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${MAPLIBRE_CSS}"]`)) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = MAPLIBRE_CSS; document.head.appendChild(l); }
    const ex = document.querySelector(`script[src="${MAPLIBRE_JS}"]`) as HTMLScriptElement | null;
    if (ex) { ex.addEventListener('load', () => resolve(w.maplibregl)); ex.addEventListener('error', reject); return; }
    const s = document.createElement('script'); s.src = MAPLIBRE_JS; s.async = true; s.onload = () => resolve(w.maplibregl); s.onerror = reject; document.head.appendChild(s);
  });
}

export function LayeredMapCanvas({ points, layer, onSelect }: { points: GeoIntelPoint[]; layer: MapLayer; onSelect: (id: string) => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const readyRef = useRef(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const color = LAYER_COLOR[layer];

  useEffect(() => {
    let cancelled = false;
    loadMaplibre().then((mlg: any) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = new mlg.Map({ container: containerRef.current, style: OSM_STYLE as never, center: [0, 20], zoom: 1.4 });
      mapRef.current = map;
      map.addControl(new mlg.NavigationControl({ showCompass: false }), 'top-right');
      map.on('load', () => {
        map.addSource('intel', { type: 'geojson', data: toGeoJSON(points, layer), cluster: true, clusterRadius: 50, clusterMaxZoom: 12, clusterProperties: { weightSum: ['+', ['get', 'weight']] } });
        map.addLayer({ id: 'clusters', type: 'circle', source: 'intel', filter: ['has', 'point_count'], paint: { 'circle-color': color, 'circle-opacity': 0.6, 'circle-radius': ['step', ['get', 'point_count'], 14, 10, 20, 50, 28] } });
        map.addLayer({ id: 'cluster-count', type: 'symbol', source: 'intel', filter: ['has', 'point_count'], layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 11 }, paint: { 'text-color': '#ffffff' } });
        map.addLayer({ id: 'pts', type: 'circle', source: 'intel', filter: ['!', ['has', 'point_count']], paint: { 'circle-color': color, 'circle-radius': ['interpolate', ['linear'], ['get', 'weight'], 0, 4, 1, 6, 10, 12, 50, 20], 'circle-stroke-width': 1, 'circle-stroke-color': '#0b1220' } });
        readyRef.current = true; setStatus('ready');
        map.on('click', 'clusters', (e: any) => { const f = map.queryRenderedFeatures(e.point, { layers: ['clusters'] })[0]; if (!f) return; map.getSource('intel').getClusterExpansionZoom(f.properties.cluster_id, (_e: unknown, z: number) => { if (z != null) map.easeTo({ center: f.geometry.coordinates, zoom: z }); }); });
        map.on('click', 'pts', (e: any) => { const id = e.features?.[0]?.properties?.id; if (id) onSelect(id); });
        for (const lyr of ['pts', 'clusters']) { map.on('mouseenter', lyr, () => { map.getCanvas().style.cursor = 'pointer'; }); map.on('mouseleave', lyr, () => { map.getCanvas().style.cursor = ''; }); }
      });
    }).catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; if (mapRef.current) { try { mapRef.current.remove(); } catch { /* noop */ } mapRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // re-style + re-data on layer or filter change
  useEffect(() => {
    const map = mapRef.current; if (!map || !readyRef.current) return;
    const src = map.getSource('intel'); if (src) src.setData(toGeoJSON(points, layer));
    if (map.getLayer('clusters')) map.setPaintProperty('clusters', 'circle-color', color);
    if (map.getLayer('pts')) map.setPaintProperty('pts', 'circle-color', color);
  }, [points, layer, color]);

  return (
    <div className="relative h-[60vh] min-h-[420px] w-full overflow-hidden rounded-card border border-border bg-background-deep">
      <div ref={containerRef} className="absolute inset-0" />
      {status !== 'ready' ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rounded-card border border-border bg-surface-2/80 px-3 py-1.5 text-caption text-text-muted">{status === 'error' ? 'Map tiles unavailable — use the layer tables below (all server-rendered).' : 'Loading map…'}</span>
        </div>
      ) : null}
    </div>
  );
}
