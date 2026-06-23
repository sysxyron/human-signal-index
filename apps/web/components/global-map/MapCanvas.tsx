'use client';
// =============================================================================
// HSI Phase 71 — MapLibre GL canvas (client). Loads MapLibre from the LOCAL npm
// package (no CDN) + OpenStreetMap raster tiles (no paid provider, no API key).
// Renders REAL source points with built-in clustering. Degrades to a notice if
// the map can't initialize — the list/readiness view stays fully usable. No
// fabricated points. This file is only loaded client-side (dynamic ssr:false).
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import type { MapPoint } from '@/lib/global-map/geo-model';
import { pointFeature, type PointFeature } from '@/lib/global-map/geometry';

// Circle-only style: NO `glyphs` and NO symbol/text layers. (The external glyph
// PBF endpoint returned HTML, breaking MapLibre with "Unimplemented type: 4".)
// Clusters are shown as sized circles instead of numeric text labels.
const OSM_STYLE = {
  version: 8,
  sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' } },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
} as const;

function toGeoJSON(points: MapPoint[]) {
  return {
    type: 'FeatureCollection',
    // Point-only: coerce + validate coordinates; skip anything that isn't a valid Point.
    features: points
      .map((p) => pointFeature({ id: p.id, name: p.name, health: p.health, signalCount: p.signalCount, narrativeCount: p.narrativeCount, forecastCount: p.forecastCount }, p.lat, p.lng))
      .filter((f): f is PointFeature => f !== null),
  };
}

export function MapCanvas({ points, onSelect }: { points: MapPoint[]; onSelect: (id: string) => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const readyRef = useRef(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [count, setCount] = useState(0);

  // init once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    try {
      const map: any = new maplibregl.Map({ container: containerRef.current, style: OSM_STYLE as never, center: [0, 20], zoom: 1.4 });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      map.on('error', () => { /* tile/network errors must not crash the page */ });
      map.on('load', () => {
        const fc = toGeoJSON(points);
        map.addSource('sources', { type: 'geojson', data: fc, cluster: true, clusterRadius: 50, clusterMaxZoom: 12 });
        // Circle-only clusters (radius scales with point_count; no text labels).
        map.addLayer({ id: 'clusters', type: 'circle', source: 'sources', filter: ['has', 'point_count'], paint: { 'circle-color': '#3B82F6', 'circle-opacity': 0.65, 'circle-stroke-width': 1.5, 'circle-stroke-color': '#3B82F6', 'circle-radius': ['step', ['get', 'point_count'], 14, 10, 20, 50, 28] } });
        map.addLayer({ id: 'unclustered', type: 'circle', source: 'sources', filter: ['!', ['has', 'point_count']], paint: { 'circle-color': '#10B981', 'circle-radius': 6, 'circle-stroke-width': 1, 'circle-stroke-color': '#0b1220' } });
        readyRef.current = true; setStatus('ready'); setCount(fc.features.length);
        if (process.env.NODE_ENV !== 'production') console.debug('[global-map] MapCanvas: map+style loaded, source+layers added, features =', fc.features.length);

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
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') console.error('[global-map] MapLibre init failed', err);
      setStatus('error');
    }
    return () => { if (mapRef.current) { try { mapRef.current.remove(); } catch { /* noop */ } mapRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // update data when filtered points change
  useEffect(() => {
    const map = mapRef.current; if (!map || !readyRef.current) return;
    const fc = toGeoJSON(points);
    const src = map.getSource('sources'); if (src) src.setData(fc);
    setCount(fc.features.length);
  }, [points]);

  return (
    <div className="relative h-[60vh] min-h-[420px] w-full overflow-hidden rounded-card border border-border bg-background-deep">
      <div ref={containerRef} className="absolute inset-0" />
      {status !== 'ready' ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rounded-card border border-border bg-surface-2/80 px-3 py-1.5 text-caption text-text-muted">
            {status === 'error' ? 'Map temporarily unavailable — use the filters & list below (all data is server-rendered).' : 'Loading map…'}
          </span>
        </div>
      ) : null}
      {status === 'ready' && count === 0 ? (
        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2">
          <span className="rounded-card border border-border bg-surface-2/80 px-3 py-1.5 text-caption text-text-muted">No points available for this view.</span>
        </div>
      ) : null}
    </div>
  );
}
