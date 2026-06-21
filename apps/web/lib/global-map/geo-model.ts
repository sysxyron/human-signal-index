// =============================================================================
// HSI Phase 71 — Global Intelligence Map: geo model (PURE).
//
// The map reads geo from source_candidates (country/region/city/lat/lng/
// geo_confidence/geo_source — added in migration 0057). This module defines the
// uppercase geo_status vocabulary the map uses and derives it deterministically.
// Coordinates are only ever counted when actually present — never fabricated.
// PURE: no I/O, no @/ value imports.
// =============================================================================

import { computeGeoReadiness } from '../source-network/geo';
import { toNum, inRange } from './geometry';

export const GEO_STATUSES = ['GEO_READY', 'PARTIAL_GEO', 'MISSING_GEO', 'NOT_APPLICABLE'] as const;
export type GeoStatus = (typeof GEO_STATUSES)[number];

export interface GeoFields {
  sourceType: string | null;
  country: string | null;
  region: string | null;
  state: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  geoConfidence: number | null;
  geoSource: string | null;
}

/** Derive the uppercase map geo_status, reusing the Phase 70.3.3 readiness rule.
 *  (region carries state when a discrete state column is absent.) */
export function geoStatus(f: GeoFields): { status: GeoStatus; reason: string } {
  // Coerce numeric-string coordinates so geo_status agrees with the renderer.
  const r = computeGeoReadiness({
    sourceType: f.sourceType,
    country: f.country, region: f.region ?? f.state, city: f.city,
    latitude: toNum(f.latitude), longitude: toNum(f.longitude),
    geoConfidence: f.geoConfidence, geoSource: f.geoSource,
  });
  const map: Record<string, GeoStatus> = { geo_ready: 'GEO_READY', partial_geo: 'PARTIAL_GEO', missing_geo: 'MISSING_GEO', not_applicable: 'NOT_APPLICABLE' };
  return { status: map[r.value], reason: r.reason };
}

/** A plottable point — only ever built from REAL coordinates. */
export interface MapPoint {
  id: string;
  name: string;
  sourceType: string | null;
  category: string | null;
  health: string;
  signalCount: number;
  narrativeCount: number;
  forecastCount: number;
  geoStatus: GeoStatus;
  geoConfidence: number | null;
  geoSource: string | null;
  country: string | null;
  region: string | null;
  lat: number;
  lng: number;
  familyKey: string;
}

/** A point is valid for the map ONLY with finite real coordinates in range.
 *  Coerces numeric strings (Postgres `numeric` can deserialize as a string). */
export function isPlottable(lat: unknown, lng: unknown): boolean {
  const la = toNum(lat); const ln = toNum(lng);
  return la != null && ln != null && inRange(la, ln);
}
