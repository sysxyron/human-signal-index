'use client';
// =============================================================================
// HSI Phase 71 — MapLibre GL canvas (client). Loads MapLibre GL JS + OpenStreetMap
// raster tiles from the CDN (no paid provider, no API key, no 3D globe). Renders
// REAL source points with MapLibre's built-in clustering (cluster only real
// points). Degrades to a notice if MapLibre can't load — the list/readiness view
// stays fully usable. No fabricated points.
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import type { MapPoint } from '@/lib/global-map/geo-model';

const MAPLIBRE_JS = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';
const MAPLIBRE_CSS = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';

const OSM_STYLE = {
  version: 8,
  sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' } },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
} as const;

function toGeoJSON(points: MapPoint[]) {
  return {
    type: 'FeatureCollection',
    features: points.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: { id: p.id, name: p.name, health: p.health, signalCount: p.signalCount, narrativeCount: p.narrativeCount, forecastCount: p.forecastCount },
    })),
  };
}

function loadMaplibre(): Promise<unknown> {
  const w = window as unknown as { maplibregl?: unknown };
  if (w.maplibregl) return Promise.resolve(w.maplibregl);
  return new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${MAPLIBRE_CSS}"]`)) {
      const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = MAPLIBRE_CSS; document.head.appendChild(link);
    }
    const existing = document.querySelector(`script[src="${MAPLIBRE_JS}"]`) as HTMLScriptElement | null;
    if (existing) { existing.addEventListener('load', () => resolve(w.maplibregl)); existing.addEventListener('error', reject); return; }
    const s = document.createElement('script'); s.src = MAPLIBRE_JS; s.async = true;
    s.onload = () => resolve(w.maplibregl); s.onerror = reject; document.head.appendChild(s);
  });
}

export function MapCanvas({ points, onSelect }: { points: MapPoint[]; onSelect: (id: string) => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const readyRef = useRef(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  // init once
  useEffect(() => {
    let cancelled = false;
    loadMaplibre().then((mlg: any) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = new mlg.Map({ container: containerRef.current, style: OSM_STYLE as never, center: [0, 20], zoom: 1.4, attributionControl: true });
      mapRef.current = map;
      map.addControl(new mlg.NavigationControl({ showCompass: false }), 'top-right');
      map.on('load', () => {
        map.addSource('sources', { type: 'geojson', data: toGeoJSON(points), cluster: true, clusterRadius: 50, clusterMaxZoom: 12 });
        map.addLayer({ id: 'clusters', type: 'circle', source: 'sources', filter: ['has', 'point_count'], paint: { 'circle-color': '#3B82F6', 'circle-opacity': 0.65, 'circle-radius': ['step', ['get', 'point_count'], 14, 10, 20, 50, 28] } });
        map.addLayer({ id: 'cluster-count', type: 'symbol', source: 'sources', filter: ['has', 'point_count'], layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 11 }, paint: { 'text-color': '#ffffff' } });
        map.addLayer({ id: 'unclustered', type: 'circle', source: 'sources', filter: ['!', ['has', 'point_count']], paint: { 'circle-color': '#10B981', 'circle-radius': 6, 'circle-stroke-width': 1, 'circle-stroke-color': '#0b1220' } });
        readyRef.current = true; setStatus('ready');

        map.on('click', 'clusters', (e: any) => {
          const f = map.queryRenderedFeatures(e.point, { layers: ['clusters'] })[0]; if (!f) return;
          map.getSource('sources').getClusterExpansionZoom(f.properties.cluster_id, (_err: unknown, zoom: number) => { if (zoom != null) map.easeTo({ center: f.geometry.coordinates, zoom }); });
        });
        map.on('click', 'unclustered', (e: any) => { const id = e.features?.[0]?.properties?.id; if (id) onSelect(id); });
        map.on('mouseenter', 'unclustered', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'unclustered', () => { map.getCanvas().style.cursor = ''; });
        map.on('mouseenter', 'clusters', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'clusters', () => { map.getCanvas().style.cursor = ''; });
      });
    }).catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; if (mapRef.current) { try { mapRef.current.remove(); } catch { /* noop */ } mapRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // update data when filtered points change
  useEffect(() => {
    const map = mapRef.current; if (!map || !readyRef.current) return;
    const src = map.getSource('sources'); if (src) src.setData(toGeoJSON(points));
  }, [points]);

  return (
    <div className="relative h-[60vh] min-h-[420px] w-full overflow-hidden rounded-card border border-border bg-background-deep">
      <div ref={containerRef} className="absolute inset-0" />
      {status !== 'ready' ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rounded-card border border-border bg-surface-2/80 px-3 py-1.5 text-caption text-text-muted">
            {status === 'error' ? 'Map tiles unavailable — use the filters & list below (all data is server-rendered).' : 'Loading map…'}
          </span>
        </div>
      ) : null}
    </div>
  );
}
