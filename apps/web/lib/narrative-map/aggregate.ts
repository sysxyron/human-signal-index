// =============================================================================
// HSI Phase 72 — Geo aggregation (PURE, deterministic). Rolls real per-source
// intelligence points up into geography buckets, computes contradiction ratios,
// trust aggregates, blind spots, and per-layer weights. No fabrication; empty
// inputs yield zeros. No I/O.
// =============================================================================

import type { GeoIntelPoint, RegionBucket, GeoGranularity, MapLayer, GeoMetrics } from './types';
import type { GeospatialIntelligence } from './data';
import { aggregateTrust } from './trust';
import { detectBlindSpot, severityRank } from './blindspots';

export function contradictionRatio(contradicts: number, supports: number): number {
  const total = contradicts + supports;
  return total === 0 ? 0 : Math.round((contradicts / total) * 100) / 100;
}

/** The numeric a map point/region contributes to a layer (for sizing/coloring). */
export function layerWeight(p: { signalCount: number; narrativeCount: number; evidenceCount: number; forecastCount: number; contradicts: number; trustScore: number | null; blindSpot: { severity: string } }, layer: MapLayer): number {
  switch (layer) {
    case 'SOURCES': return 1;
    case 'NARRATIVES': return p.narrativeCount;
    case 'EVIDENCE': return p.evidenceCount;
    case 'FORECASTS': return p.forecastCount;
    case 'CONTRADICTIONS': return p.contradicts;
    case 'TRUST': return p.trustScore ?? 0;
    case 'BLIND_SPOTS': return severityRank(p.blindSpot.severity as never);
    default: return 0;
  }
}

function bucketKey(p: GeoIntelPoint, g: GeoGranularity): string {
  const country = p.country ?? 'Unknown';
  if (g === 'country') return country;
  const region = p.region ?? 'Unknown';
  if (g === 'region') return `${country} · ${region}`;
  return `${country} · ${region} · ${p.city ?? 'Unknown'}`;
}

const ZERO = (): GeoMetrics => ({ sourceCount: 0, signalCount: 0, evidenceCount: 0, narrativeCount: 0, forecastCount: 0, contradicts: 0, supports: 0 });

/** Roll points up to a geography. Trust + blind spot are computed from the
 *  aggregated reality, not assumed. */
export function rollupByGeo(points: GeoIntelPoint[], granularity: GeoGranularity): RegionBucket[] {
  const acc = new Map<string, { m: GeoMetrics; trust: Array<number | null> }>();
  for (const p of points) {
    const key = bucketKey(p, granularity);
    const e = acc.get(key) ?? { m: ZERO(), trust: [] };
    e.m.sourceCount += 1;
    e.m.signalCount += p.signalCount;
    e.m.evidenceCount += p.evidenceCount;
    e.m.narrativeCount += p.narrativeCount;
    e.m.forecastCount += p.forecastCount;
    e.m.contradicts += p.contradicts;
    e.m.supports += p.supports;
    e.trust.push(p.trustScore);
    acc.set(key, e);
  }
  const out: RegionBucket[] = [];
  for (const [key, { m, trust }] of acc) {
    out.push({
      key, granularity, ...m,
      contradictionRatio: contradictionRatio(m.contradicts, m.supports),
      trust: aggregateTrust(trust),
      blindSpot: detectBlindSpot(m),
    });
  }
  return out.sort((a, b) => b.narrativeCount - a.narrativeCount || b.signalCount - a.signalCount || a.key.localeCompare(b.key));
}

/**
 * Phase 75 — narrow a geospatial-intelligence bundle to a single narrative's
 * member sources (by source id). Points + all geography rollups + totals are
 * recomputed from the retained real points; filter dropdowns are preserved.
 * PURE: no fabrication — an empty/absent id set yields an empty footprint.
 */
export function focusIntelligenceOnSources(intel: GeospatialIntelligence, allowed: ReadonlySet<string>): GeospatialIntelligence {
  const points = intel.points.filter((p) => allowed.has(p.id));
  const totals = {
    sources: points.length,
    signals: points.reduce((s, p) => s + p.signalCount, 0),
    evidence: points.reduce((s, p) => s + p.evidenceCount, 0),
    narratives: points.reduce((s, p) => s + p.narrativeCount, 0),
    forecasts: points.reduce((s, p) => s + p.forecastCount, 0),
    contradicts: points.reduce((s, p) => s + p.contradicts, 0),
    supports: points.reduce((s, p) => s + p.supports, 0),
    blindSpots: points.filter((p) => p.blindSpot.isBlindSpot).length,
  };
  return {
    ...intel,
    points,
    pointTotal: points.length,
    capped: false,
    byCountry: rollupByGeo(points, 'country'),
    byRegion: rollupByGeo(points, 'region'),
    byCity: rollupByGeo(points, 'city'),
    totals,
  };
}
