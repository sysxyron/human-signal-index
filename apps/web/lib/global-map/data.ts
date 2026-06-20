// =============================================================================
// HSI Phase 71 — Global Intelligence Map DAL (SERVER-ONLY, reviewer+). READS
// approved sources + candidate geo (migration 0057) + per-source signal /
// narrative / forecast rollups (via the evidence graph + narratives + forecasts)
// and assembles map points, the readiness report, and Phase 72 readiness.
// Real records only — no fabricated coordinates, no inferred locations. Memoized
// (server-side aggregation) for D9 performance. Degrades to empty.
// =============================================================================

import { createClient } from '@/lib/supabase/server';
import { computeSourceHealth } from '@/lib/source-network/health';
import { familyKey } from '@/lib/source-network/family';
import { geoStatus, isPlottable, type MapPoint, type GeoStatus } from './geo-model';
import { computeMapReadiness, type ReadinessSource, type MapReadiness } from './readiness';

const POINT_CAP = 8000; // client render cap (D9); readiness uses full counts

async function safe<T>(p: PromiseLike<{ data: T | null }>, fb: T): Promise<T> {
  try { const { data } = await p; return (data as T) ?? fb; } catch { return fb; }
}

interface SrcRow { id: string; name: string | null; source_type: string | null; status: string | null; homepage_url: string | null; rss_url: string | null; risk_level: number | null; monitoring_enabled: boolean | null; }
interface CandRow { source_id: string | null; classification_category: string | null; country: string | null; region: string | null; city: string | null; latitude: number | null; longitude: number | null; geo_confidence: number | null; geo_source: string | null; tags: string[] | null; identity_key: string | null; }

export interface GlobalMapData {
  points: MapPoint[];                 // plottable (capped)
  plottableTotal: number;             // real total of plottable sources (pre-cap)
  capped: boolean;
  readiness: MapReadiness;
  filters: { types: string[]; categories: string[]; healths: string[]; geoStatuses: GeoStatus[]; countries: string[]; regions: string[] };
}

// NOTE (hotfix): NOT wrapped in unstable_cache — it reads cookies via the
// per-request RLS client (createClient). Caching cookie reads crashes the Server
// Component. The page is force-dynamic; per-user RLS is preserved.
export async function getGlobalMapData(): Promise<GlobalMapData> {
  const db = createClient();
  const nowIso = new Date().toISOString(); const now = new Date(nowIso).getTime();

  const [sources, cands, mons, events, signals, nodes, members, forecasts] = await Promise.all([
    safe(db.from('hsin_sources').select('id, name, source_type, status, homepage_url, rss_url, risk_level, monitoring_enabled').neq('status', 'archived').limit(60000), [] as SrcRow[]),
    safe(db.from('source_candidates').select('source_id, classification_category, country, region, city, latitude, longitude, geo_confidence, geo_source, tags, identity_key').not('source_id', 'is', null).limit(60000), [] as CandRow[]),
    safe(db.from('source_monitoring_state').select('source_id, source_name, state, last_success_at, last_failure_at').limit(60000), [] as Array<{ source_id: string | null; source_name: string | null; state: string | null; last_success_at: string | null; last_failure_at: string | null }>),
    safe(db.from('source_capture_events').select('source_id, status, captured_at').order('captured_at', { ascending: false }).limit(20000), [] as Array<{ source_id: string | null; status: string | null; captured_at: string | null }>),
    safe(db.from('hsin_signals').select('id, source_id').limit(60000), [] as Array<{ id: string; source_id: string | null }>),
    safe(db.from('graph_nodes').select('id, node_type, entity_id').eq('node_type', 'SIGNAL').limit(60000), [] as Array<{ id: string; node_type: string; entity_id: string }>),
    safe(db.from('narrative_members').select('node_id, narrative_id').limit(60000), [] as Array<{ node_id: string; narrative_id: string }>),
    safe(db.from('forecasts').select('id, narrative_id').limit(20000), [] as Array<{ id: string; narrative_id: string | null }>),
  ]);

  // candidate geo + category by source
  const candBySource = new Map<string, CandRow>();
  for (const c of cands) if (c.source_id) candBySource.set(c.source_id, c);

  // monitoring + events for health
  const monBySource = new Map<string, { state: string | null; last_success_at: string | null; last_failure_at: string | null }>();
  const monByName = new Map<string, { state: string | null; last_success_at: string | null; last_failure_at: string | null }>();
  for (const m of mons) { if (m.source_id) monBySource.set(m.source_id, m); if (m.source_name) monByName.set(m.source_name.toLowerCase(), m); }
  const eventsBySource = new Map<string, Array<{ status: string | null; captured_at: string | null }>>();
  for (const e of events) { if (!e.source_id) continue; const a = eventsBySource.get(e.source_id) ?? []; if (a.length < 6) a.push(e); eventsBySource.set(e.source_id, a); }

  // signal → source ; signal → graph node ; node → narratives ; narrative → forecasts
  const signalNodeBySignal = new Map<string, string>();
  for (const nd of nodes) signalNodeBySignal.set(nd.entity_id, nd.id);
  const narrativesByNode = new Map<string, string[]>();
  for (const mem of members) { const a = narrativesByNode.get(mem.node_id) ?? []; a.push(mem.narrative_id); narrativesByNode.set(mem.node_id, a); }
  const forecastsByNarrative = new Map<string, string[]>();
  for (const f of forecasts) { if (!f.narrative_id) continue; const a = forecastsByNarrative.get(f.narrative_id) ?? []; a.push(f.id); forecastsByNarrative.set(f.narrative_id, a); }

  // per-source rollups
  const signalCountBySource = new Map<string, number>();
  const narrativesBySource = new Map<string, Set<string>>();
  const forecastsBySource = new Map<string, Set<string>>();
  for (const s of signals) {
    if (!s.source_id) continue;
    signalCountBySource.set(s.source_id, (signalCountBySource.get(s.source_id) ?? 0) + 1);
    const nodeId = signalNodeBySignal.get(s.id); if (!nodeId) continue;
    const narrs = narrativesByNode.get(nodeId) ?? [];
    if (narrs.length === 0) continue;
    const nset = narrativesBySource.get(s.source_id) ?? new Set(); const fset = forecastsBySource.get(s.source_id) ?? new Set();
    for (const nid of narrs) { nset.add(nid); for (const fid of (forecastsByNarrative.get(nid) ?? [])) fset.add(fid); }
    narrativesBySource.set(s.source_id, nset); forecastsBySource.set(s.source_id, fset);
  }

  const points: MapPoint[] = [];
  const readinessRows: ReadinessSource[] = [];
  const typeSet = new Set<string>(); const catSet = new Set<string>(); const healthSet = new Set<string>(); const countrySet = new Set<string>(); const regionSet = new Set<string>();

  for (const s of sources) {
    const cand = candBySource.get(s.id);
    const mon = monBySource.get(s.id) ?? (s.name ? monByName.get(s.name.toLowerCase()) : undefined);
    const ev = eventsBySource.get(s.id) ?? [];
    const health = computeSourceHealth({
      status: s.status, monitoringEnabled: s.monitoring_enabled, monitoringState: mon?.state ?? null,
      lastSuccessAt: mon?.last_success_at ?? null, lastFailureAt: mon?.last_failure_at ?? null,
      recentEvents: ev.map((e) => ({ status: e.status, capturedAt: e.captured_at })), nowIso,
    }).value;

    const gs = geoStatus({
      sourceType: s.source_type, country: cand?.country ?? null, region: cand?.region ?? null, state: null, city: cand?.city ?? null,
      latitude: cand?.latitude ?? null, longitude: cand?.longitude ?? null, geoConfidence: cand?.geo_confidence ?? null, geoSource: cand?.geo_source ?? null,
    });
    const category = cand?.classification_category ?? null;
    const fam = familyKey({ id: s.id, name: s.name, homepageUrl: s.homepage_url, feedUrl: s.rss_url, sourceType: s.source_type, identityKey: cand?.identity_key ?? null, platform: null, tags: cand?.tags ?? [], organization: null });

    if (s.source_type) typeSet.add(s.source_type);
    if (category) catSet.add(category);
    healthSet.add(health);
    if (cand?.country) countrySet.add(cand.country);
    if (cand?.region) regionSet.add(cand.region);

    readinessRows.push({ geoStatus: gs.status, sourceType: s.source_type, category, familyKey: fam, country: cand?.country ?? null });

    if (gs.status === 'GEO_READY' && isPlottable(cand?.latitude ?? null, cand?.longitude ?? null)) {
      points.push({
        id: s.id, name: s.name ?? 'Source', sourceType: s.source_type, category, health,
        signalCount: signalCountBySource.get(s.id) ?? 0, narrativeCount: narrativesBySource.get(s.id)?.size ?? 0, forecastCount: forecastsBySource.get(s.id)?.size ?? 0,
        geoStatus: gs.status, geoConfidence: cand?.geo_confidence ?? null, geoSource: cand?.geo_source ?? null,
        country: cand?.country ?? null, region: cand?.region ?? null, lat: cand!.latitude as number, lng: cand!.longitude as number, familyKey: fam,
      });
    }
  }

  const plottableTotal = points.length;
  points.sort((a, b) => b.signalCount - a.signalCount);
  const capped = points.length > POINT_CAP;

  return {
    points: capped ? points.slice(0, POINT_CAP) : points,
    plottableTotal, capped,
    readiness: computeMapReadiness(readinessRows),
    filters: {
      types: Array.from(typeSet).sort(), categories: Array.from(catSet).sort(), healths: Array.from(healthSet).sort(),
      geoStatuses: ['GEO_READY', 'PARTIAL_GEO', 'MISSING_GEO', 'NOT_APPLICABLE'],
      countries: Array.from(countrySet).sort(), regions: Array.from(regionSet).sort(),
    },
  };
}

// ---- Phase 72 readiness (D10) ----------------------------------------------

export interface Phase72Readiness {
  mapReadySources: number; totalSources: number;
  signalsInheritingGeo: number; totalSignals: number;
  narrativesInheritingGeo: number; totalNarratives: number;
  forecastsInheritingGeo: number; totalForecasts: number;
  missing: string[]; requiredForPhase72: string[];
}

export async function getPhase72Readiness(): Promise<Phase72Readiness> {
  const db = createClient();
  const m = await getGlobalMapData();
  const geoReadySourceIds = new Set(m.points.map((p) => p.id));
  // re-include any beyond the cap by recomputing from readiness totals
  const mapReadySources = m.plottableTotal;

  const [signals, narrCount, fcCount, nodes, members, forecasts] = await Promise.all([
    safe(db.from('hsin_signals').select('id, source_id').limit(60000), [] as Array<{ id: string; source_id: string | null }>),
    safe(db.from('narratives').select('id').limit(20000), [] as Array<{ id: string }>),
    safe(db.from('forecasts').select('id, narrative_id').limit(20000), [] as Array<{ id: string; narrative_id: string | null }>),
    safe(db.from('graph_nodes').select('id, entity_id').eq('node_type', 'SIGNAL').limit(60000), [] as Array<{ id: string; entity_id: string }>),
    safe(db.from('narrative_members').select('node_id, narrative_id').limit(60000), [] as Array<{ node_id: string; narrative_id: string }>),
    safe(db.from('forecasts').select('id, narrative_id').limit(20000), [] as Array<{ id: string; narrative_id: string | null }>),
  ]);

  // a signal inherits geo if its source is map-ready
  const signalsInheritingGeo = signals.filter((s) => s.source_id && geoReadySourceIds.has(s.source_id)).length;

  // a narrative inherits geo if any of its member signals' source is map-ready
  const nodeBySignal = new Map<string, string>(); for (const n of nodes) nodeBySignal.set(n.entity_id, n.id);
  const sourceBySignalNode = new Map<string, string | null>();
  for (const s of signals) { const nid = nodeBySignal.get(s.id); if (nid) sourceBySignalNode.set(nid, s.source_id); }
  const geoNarratives = new Set<string>();
  for (const mem of members) { const src = sourceBySignalNode.get(mem.node_id); if (src && geoReadySourceIds.has(src)) geoNarratives.add(mem.narrative_id); }
  const forecastsInheritingGeo = forecasts.filter((f) => f.narrative_id && geoNarratives.has(f.narrative_id)).length;

  const missing: string[] = [];
  if (m.readiness.missingGeo > 0) missing.push(`${m.readiness.missingGeo} sources have no geo at all.`);
  if (m.readiness.partialGeo > 0) missing.push(`${m.readiness.partialGeo} sources have place text but no coordinates — run the geocoder.`);
  missing.push('hsin_sources, hsin_signals, narratives, and forecasts have no native geo columns — geo is inherited from the source via its candidate.');

  const requiredForPhase72 = [
    'Geocode the PARTIAL_GEO sources (deterministic gazetteer ready; live geocoder optional).',
    'Persist coordinates on hsin_sources (or keep the candidate join) so non-candidate sources can map.',
    'Add narrative/forecast geo rollup so the map can render narrative & forecast layers, not just sources.',
    'Time dimension (event dates) for Phase 72 geospatial narrative motion.',
  ];

  return {
    mapReadySources, totalSources: m.readiness.totalSources,
    signalsInheritingGeo, totalSignals: signals.length,
    narrativesInheritingGeo: geoNarratives.size, totalNarratives: narrCount.length,
    forecastsInheritingGeo, totalForecasts: fcCount.length,
    missing, requiredForPhase72,
  };
}
