// =============================================================================
// HSI Phase 72 — Geospatial Narrative Intelligence DAL (SERVER-ONLY, reviewer+).
// REUSES the Phase 70.4 signal network (per-signal evidence/contradicts/supports/
// narrative/forecast attribution) + Phase 71 geo (source_candidates coordinates)
// + Phase 16 source trust. Rolls everything up by source → geography. Geo is
// inherited only through verified relationships; absent links are NOT OBSERVED.
// Server-side aggregation + unstable_cache (Step 11). Degrades to empty.
// =============================================================================

import { unstable_cache } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSignalNetworkDashboard } from '@/lib/signal-network/data';
import { geoStatus, isPlottable } from '@/lib/global-map/geo-model';
import { contradictionRatio, rollupByGeo } from './aggregate';
import { detectBlindSpot } from './blindspots';
import type { GeoIntelPoint, RegionBucket } from './types';

const POINT_CAP = 8000;

async function safe<T>(p: PromiseLike<{ data: T | null }>, fb: T): Promise<T> {
  try { const { data } = await p; return (data as T) ?? fb; } catch { return fb; }
}

interface CandRow { source_id: string | null; classification_category: string | null; country: string | null; region: string | null; city: string | null; latitude: number | null; longitude: number | null; }

interface SourceAgg { signalCount: number; evidenceCount: number; contradicts: number; supports: number; narratives: Set<string>; forecasts: Set<string> }

export interface GeospatialIntelligence {
  points: GeoIntelPoint[];          // capped for the browser
  pointTotal: number; capped: boolean;
  byCountry: RegionBucket[]; byRegion: RegionBucket[]; byCity: RegionBucket[];
  totals: { sources: number; signals: number; evidence: number; narratives: number; forecasts: number; contradicts: number; supports: number; blindSpots: number };
  filters: { types: string[]; categories: string[]; countries: string[] };
}

async function load(): Promise<GeospatialIntelligence> {
  const db = createClient();
  const [net, sources, cands, trust] = await Promise.all([
    getSignalNetworkDashboard(),
    safe(db.from('hsin_sources').select('id, name, source_type, status').neq('status', 'archived').limit(120000), [] as Array<{ id: string; name: string | null; source_type: string | null; status: string | null }>),
    safe(db.from('source_candidates').select('source_id, classification_category, country, region, city, latitude, longitude').not('source_id', 'is', null).limit(120000), [] as CandRow[]),
    safe(db.from('hsin_source_trust').select('source_id, trust_score, band').limit(120000), [] as Array<{ source_id: string; trust_score: number | null; band: string | null }>),
  ]);

  // roll the per-signal network rows up by source (real attribution)
  const bySource = new Map<string, SourceAgg>();
  for (const r of net.rows) {
    if (!r.sourceId) continue;
    const a = bySource.get(r.sourceId) ?? { signalCount: 0, evidenceCount: 0, contradicts: 0, supports: 0, narratives: new Set<string>(), forecasts: new Set<string>() };
    a.signalCount += 1;
    a.evidenceCount += r.influence.evidenceCount;
    a.contradicts += r.relationships.CONTRADICTS;
    a.supports += r.relationships.SUPPORTS;
    for (const nid of r.narrativeIds) a.narratives.add(nid);
    for (const fid of r.forecastIds) a.forecasts.add(fid);
    bySource.set(r.sourceId, a);
  }

  const candBySource = new Map<string, CandRow>(); for (const c of cands) if (c.source_id) candBySource.set(c.source_id, c);
  const trustBySource = new Map<string, { score: number | null; band: string | null }>(); for (const t of trust) trustBySource.set(t.source_id, { score: t.trust_score, band: t.band });

  const points: GeoIntelPoint[] = [];
  const typeSet = new Set<string>(); const catSet = new Set<string>(); const countrySet = new Set<string>();

  for (const s of sources) {
    const cand = candBySource.get(s.id);
    const gs = geoStatus({ sourceType: s.source_type, country: cand?.country ?? null, region: cand?.region ?? null, state: null, city: cand?.city ?? null, latitude: cand?.latitude ?? null, longitude: cand?.longitude ?? null, geoConfidence: null, geoSource: null });
    if (gs.status !== 'GEO_READY' || !isPlottable(cand?.latitude ?? null, cand?.longitude ?? null)) continue;

    const agg = bySource.get(s.id);
    const narrativeCount = agg?.narratives.size ?? 0; const forecastCount = agg?.forecasts.size ?? 0; const evidenceCount = agg?.evidenceCount ?? 0;
    const t = trustBySource.get(s.id);
    if (s.source_type) typeSet.add(s.source_type);
    if (cand?.classification_category) catSet.add(cand.classification_category);
    if (cand?.country) countrySet.add(cand.country);

    points.push({
      id: s.id, name: s.name ?? 'Source', sourceType: s.source_type, category: cand?.classification_category ?? null,
      country: cand?.country ?? null, region: cand?.region ?? null, city: cand?.city ?? null,
      lat: cand!.latitude as number, lng: cand!.longitude as number,
      sourceCount: 1, signalCount: agg?.signalCount ?? 0, evidenceCount, narrativeCount, forecastCount,
      contradicts: agg?.contradicts ?? 0, supports: agg?.supports ?? 0,
      contradictionRatio: contradictionRatio(agg?.contradicts ?? 0, agg?.supports ?? 0),
      trustScore: t?.score ?? null, trustBand: t?.band ?? null,
      blindSpot: detectBlindSpot({ narrativeCount, forecastCount, evidenceCount }),
    });
  }

  const byCountry = rollupByGeo(points, 'country');
  const byRegion = rollupByGeo(points, 'region');
  const byCity = rollupByGeo(points, 'city');

  const totals = {
    sources: points.length,
    signals: points.reduce((n, p) => n + p.signalCount, 0),
    evidence: points.reduce((n, p) => n + p.evidenceCount, 0),
    narratives: points.reduce((n, p) => n + p.narrativeCount, 0),
    forecasts: points.reduce((n, p) => n + p.forecastCount, 0),
    contradicts: points.reduce((n, p) => n + p.contradicts, 0),
    supports: points.reduce((n, p) => n + p.supports, 0),
    blindSpots: points.filter((p) => p.blindSpot.isBlindSpot).length,
  };

  const pointTotal = points.length;
  points.sort((a, b) => (b.narrativeCount + b.signalCount) - (a.narrativeCount + a.signalCount));
  const capped = points.length > POINT_CAP;

  return {
    points: capped ? points.slice(0, POINT_CAP) : points,
    pointTotal, capped, byCountry, byRegion, byCity, totals,
    filters: { types: Array.from(typeSet).sort(), categories: Array.from(catSet).sort(), countries: Array.from(countrySet).sort() },
  };
}

export const getGeospatialIntelligence = unstable_cache(load, ['narrative-map:intel:v1'], { revalidate: 60, tags: ['global-map', 'narrative-map'] });

// ---- geographic readiness report (Step 9) ----------------------------------

export interface GeoReadinessReport {
  sources: { total: number; geoReady: number; missing: number; partial: number };
  signals: { total: number; withGeo: number };
  narratives: { total: number; withGeo: number };
  forecasts: { total: number; withGeo: number; geoUnknown: number };
  evidence: { linkedToGeoSources: number; linkedToAnySource: number };
  missingGeoInventory: { sourcesMissingGeo: number; sourcesPartialGeo: number };
}

async function countRows(db: ReturnType<typeof createClient>, table: string): Promise<number> {
  try { const { count } = await db.from(table).select('id', { count: 'exact', head: true }); return count ?? 0; } catch { return 0; }
}

async function loadReadiness(): Promise<GeoReadinessReport> {
  const db = createClient();
  const [net, sources, cands, totalNarratives, totalForecasts] = await Promise.all([
    getSignalNetworkDashboard(),
    safe(db.from('hsin_sources').select('id, source_type, status').neq('status', 'archived').limit(120000), [] as Array<{ id: string; source_type: string | null; status: string | null }>),
    safe(db.from('source_candidates').select('source_id, classification_category, country, region, city, latitude, longitude').not('source_id', 'is', null).limit(120000), [] as CandRow[]),
    countRows(db, 'narratives'),
    countRows(db, 'forecasts'),
  ]);

  const candBySource = new Map<string, CandRow>(); for (const c of cands) if (c.source_id) candBySource.set(c.source_id, c);
  const status = (id: string, st: string | null) => geoStatus({ sourceType: st, country: candBySource.get(id)?.country ?? null, region: candBySource.get(id)?.region ?? null, state: null, city: candBySource.get(id)?.city ?? null, latitude: candBySource.get(id)?.latitude ?? null, longitude: candBySource.get(id)?.longitude ?? null, geoConfidence: null, geoSource: null }).status;

  const geoReadyIds = new Set<string>(); let missing = 0; let partial = 0;
  for (const s of sources) { const st = status(s.id, s.source_type); if (st === 'GEO_READY') geoReadyIds.add(s.id); else if (st === 'PARTIAL_GEO') partial++; else if (st === 'MISSING_GEO') missing++; }

  let signalsWithGeo = 0; const narrWithGeo = new Set<string>(); const fcWithGeo = new Set<string>(); let evidenceGeo = 0; let evidenceAny = 0;
  for (const r of net.rows) {
    evidenceAny += r.influence.evidenceCount;
    if (r.sourceId && geoReadyIds.has(r.sourceId)) {
      signalsWithGeo++; evidenceGeo += r.influence.evidenceCount;
      for (const nid of r.narrativeIds) narrWithGeo.add(nid);
      for (const fid of r.forecastIds) fcWithGeo.add(fid);
    }
  }

  return {
    sources: { total: sources.length, geoReady: geoReadyIds.size, missing, partial },
    signals: { total: net.rows.length, withGeo: signalsWithGeo },
    narratives: { total: totalNarratives, withGeo: narrWithGeo.size },
    forecasts: { total: totalForecasts, withGeo: fcWithGeo.size, geoUnknown: Math.max(0, totalForecasts - fcWithGeo.size) },
    evidence: { linkedToGeoSources: evidenceGeo, linkedToAnySource: evidenceAny },
    missingGeoInventory: { sourcesMissingGeo: missing, sourcesPartialGeo: partial },
  };
}

export const getGeoReadinessReport = unstable_cache(loadReadiness, ['narrative-map:readiness:v1'], { revalidate: 60, tags: ['global-map', 'narrative-map'] });
