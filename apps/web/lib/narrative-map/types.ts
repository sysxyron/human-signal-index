// =============================================================================
// HSI Phase 72 — Geospatial Narrative Intelligence: shared types (PURE).
//
// A geospatial intelligence layer OVER existing intelligence. Geo is inherited
// ONLY through verified relationships, all rooted at the SOURCE (the only
// geo-bearing entity):  X → Signal → Source → candidate coordinates. Nothing
// here geocodes, infers a location, fabricates a coordinate, or invents an
// association. If a relationship is absent it is reported as NOT OBSERVED (0).
// PURE: no I/O, no @/ value imports.
// =============================================================================

export const MAP_LAYERS = ['SOURCES', 'NARRATIVES', 'EVIDENCE', 'FORECASTS', 'CONTRADICTIONS', 'TRUST', 'BLIND_SPOTS'] as const;
export type MapLayer = (typeof MAP_LAYERS)[number];

export const GEO_GRANULARITIES = ['country', 'region', 'city'] as const;
export type GeoGranularity = (typeof GEO_GRANULARITIES)[number];

export const BLIND_SPOT_SEVERITIES = ['none', 'low', 'medium', 'high'] as const;
export type BlindSpotSeverity = (typeof BLIND_SPOT_SEVERITIES)[number];

/** Real metrics for one geo-bearing source (or an aggregated region). Every
 *  field is a count/sum of existing records — never estimated. */
export interface GeoMetrics {
  sourceCount: number;
  signalCount: number;
  evidenceCount: number;
  narrativeCount: number;
  forecastCount: number;
  contradicts: number;   // CONTRADICTS graph edges touching this geography
  supports: number;      // SUPPORTS graph edges touching this geography
}

export interface BlindSpot {
  isBlindSpot: boolean;
  severity: BlindSpotSeverity;
  reasons: string[];
}

/** A plottable intelligence point — one geo-ready source carrying all layer
 *  metrics. Built ONLY from real coordinates. */
export interface GeoIntelPoint extends GeoMetrics {
  id: string;            // source id
  name: string;
  sourceType: string | null;
  category: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  lat: number;
  lng: number;
  trustScore: number | null;   // hsin_source_trust (0–100), null = NOT OBSERVED
  trustBand: string | null;
  contradictionRatio: number;  // contradicts / (contradicts + supports)
  blindSpot: BlindSpot;
}

/** A geography rollup (country / region / city). */
export interface RegionBucket extends GeoMetrics {
  key: string;                 // e.g. "United States" or "United States · New York"
  granularity: GeoGranularity;
  contradictionRatio: number;
  trust: TrustAggregate;
  blindSpot: BlindSpot;
}

export interface TrustAggregate {
  observed: number;            // sources with a real trust score
  avg: number | null;          // null when none observed (NOT OBSERVED)
  high: number; medium: number; low: number;
}

export interface ClassifiedResult<T> { value: T; reason: string }
