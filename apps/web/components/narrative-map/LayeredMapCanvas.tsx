'use client';
// =============================================================================
// HSI Phase 72 — Layered MapLibre canvas (client). MapLibre from the LOCAL npm
// package (no CDN) + OpenStreetMap raster tiles + clustering. Each point carries
// a `weight` = the active layer's REAL metric. Changing layer recomputes weights
// and re-renders the SAME real points. Degrades to a notice if the map can't
// initialize. No fabricated points. Only loaded client-side (dynamic ssr:false).
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { layerWeight } from '@/lib/narrative-map/aggregate';
import { pointFeature, type PointFeature } from '@/lib/global-map/geometry';
import type { GeoIntelPoint, MapLayer } from '@/lib/narrative-map/types';

// Circle-only style: NO `glyphs` and NO symbol/text layers. (The external glyph
// PBF endpoint returned HTML, breaking MapLibre with "Unimplemented type: 4".)
// Clusters are sized circles instead of numeric text labels.
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
      // Point-only: coerce + validate; skip anything that isn't a valid Point.
      // weight is always a finite number so cluster/paint expressions never see null.
      .map(({ p, w }) => pointFeature({ id: p.id, name: p.name, weight: Number.isFinite(w) ? w : 0 }, p.lat, p.lng))
      .filter((f): f is PointFeature => f !== null),
  };
}

export function LayeredMapCanvas({ points, layer, onSelect }: { points: GeoIntelPoint[]; layer: MapLayer; onSelect: (id: string) => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const readyRef = useRef(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [count, setCount] = useState(0);
  const color = LAYER_COLOR[layer];

  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;
    const dev = process.env.NODE_ENV !== 'production';
    if (dev) console.debug('[global-map] LayeredMapCanvas mounted; container', el.clientWidth, 'x', el.clientHeight);
    let ro: ResizeObserver | null = null;
    let rafId = 0; let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const map: any = new maplibregl.Map({ container: el, style: OSM_STYLE as never, center: [0, 20], zoom: 1.4 });
      mapRef.current = map;
      if (dev) console.debug('[global-map] Map instance created');
      // The container can be 0×0 at construction (dynamic import + layout timing),
      // which leaves a blank canvas. Resize after paint, shortly after, and on any
      // future container resize so the canvas always matches its box.
      rafId = requestAnimationFrame(() => { try { map.resize(); } catch { /* noop */ } });
      timer = setTimeout(() => { try { map.resize(); } catch { /* noop */ } }, 300);
      if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(() => { try { map.resize(); } catch { /* noop */ } }); ro.observe(el); }
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      map.on('error', () => { /* tile/network errors must not crash the page */ });
      map.on('load', () => {
        // Clusters are sized by point_count only — no custom clusterProperties
        // accumulator (an unused expression that can crash the GeoJSON worker).
        const fc = toGeoJSON(points, layer);
        map.addSource('intel', { type: 'geojson', data: fc, cluster: true, clusterRadius: 50, clusterMaxZoom: 12 });
        // Circle-only clusters (radius scales with point_count; no text labels).
        map.addLayer({ id: 'clusters', type: 'circle', source: 'intel', filter: ['has', 'point_count'], paint: { 'circle-color': color, 'circle-opacity': 0.6, 'circle-stroke-width': 1.5, 'circle-stroke-color': color, 'circle-radius': ['step', ['get', 'point_count'], 14, 10, 20, 50, 28] } });
        map.addLayer({ id: 'pts', type: 'circle', source: 'intel', filter: ['!', ['has', 'point_count']], paint: { 'circle-color': color, 'circle-radius': ['interpolate', ['linear'], ['get', 'weight'], 0, 4, 1, 6, 10, 12, 50, 20], 'circle-stroke-width': 1, 'circle-stroke-color': '#0b1220' } });
        readyRef.current = true; setStatus('ready'); setCount(fc.features.length);
        map.resize(); // ensure the canvas matches the container now that it's laid out
        if (dev) {
          const canvas = el.querySelector('canvas.maplibregl-canvas');
          console.debug('[global-map] style loaded; source added; features added =', fc.features.length, '| layer =', layer,
            '| container', el.clientWidth, 'x', el.clientHeight, '| .maplibregl-map?', !!el.querySelector('.maplibregl-map'),
            '| canvas?', !!canvas, '| center', map.getCenter(), '| zoom', map.getZoom());
        }
        map.on('click', 'clusters', (e: any) => { const f = map.queryRenderedFeatures(e.point, { layers: ['clusters'] })[0]; if (!f) return; map.getSource('intel').getClusterExpansionZoom(f.properties.cluster_id, (_e: unknown, z: number) => { if (z != null) map.easeTo({ center: f.geometry.coordinates, zoom: z }); }); });
        map.on('click', 'pts', (e: any) => { const id = e.features?.[0]?.properties?.id; if (id) onSelect(id); });
        for (const lyr of ['pts', 'clusters']) { map.on('mouseenter', lyr, () => { map.getCanvas().style.cursor = 'pointer'; }); map.on('mouseleave', lyr, () => { map.getCanvas().style.cursor = ''; }); }
      });
    } catch (err) {
      if (dev) console.error('[global-map] MapLibre init failed', err);
      setStatus('error');
    }
    return () => {
      if (ro) ro.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
      if (timer) clearTimeout(timer);
      if (mapRef.current) { try { mapRef.current.remove(); } catch { /* noop */ } mapRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // re-style + re-data on layer or filter change
  useEffect(() => {
    const map = mapRef.current; if (!map || !readyRef.current) return;
    const fc = toGeoJSON(points, layer);
    const src = map.getSource('intel'); if (src) src.setData(fc);
    setCount(fc.features.length);
    if (map.getLayer('clusters')) { map.setPaintProperty('clusters', 'circle-color', color); map.setPaintProperty('clusters', 'circle-stroke-color', color); }
    if (map.getLayer('pts')) map.setPaintProperty('pts', 'circle-color', color);
    if (process.env.NODE_ENV !== 'production') console.debug('[global-map] layer change →', layer, 'features =', fc.features.length);
  }, [points, layer, color]);

  return (
    <div className="relative h-[600px] w-full overflow-hidden rounded-card border border-border bg-background-deep">
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
      {status !== 'ready' ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rounded-card border border-border bg-surface-2/80 px-3 py-1.5 text-caption text-text-muted">{status === 'error' ? 'Map temporarily unavailable — use the layer tables below (all server-rendered).' : 'Loading map…'}</span>
        </div>
      ) : null}
      {status === 'ready' && count === 0 ? (
        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2">
          <span className="rounded-card border border-border bg-surface-2/80 px-3 py-1.5 text-caption text-text-muted">No points available for this layer.</span>
        </div>
      ) : null}
    </div>
  );
}
