// =============================================================================
// HSI Phase 73.3 — Geo backfill resolver (PURE, deterministic). Resolves a
// source's coordinates from REAL inputs only, in strict priority:
//   1) exact location registry match (known org HQ, exact name/domain)
//   2) deterministic gazetteer IF the source already carries place text
//   3) otherwise null → GEO_UNKNOWN is preserved.
// No AI, no probabilistic geocoding, no invented coordinates. No I/O.
// =============================================================================

import { lookupLocation } from '../location-registry';
import { geocode } from '../geocoder';

export interface BackfillInput {
  sourceName: string | null;
  primaryUrl: string | null;
  feedUrl?: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface ResolvedGeo {
  country: string | null; region: string | null; city: string | null;
  latitude: number; longitude: number; geoConfidence: number; geoSource: string;
  method: 'location_registry' | 'gazetteer';
}

/** Resolve coordinates deterministically, or null if unprovable (GEO_UNKNOWN). */
export function resolveGeo(input: BackfillInput): ResolvedGeo | null {
  // Already has real coordinates — nothing to backfill.
  if (input.latitude != null && input.longitude != null) return null;

  // 1) exact location registry (known organization HQ).
  const reg = lookupLocation(input.sourceName, input.primaryUrl) ?? lookupLocation(input.sourceName, input.feedUrl);
  if (reg) {
    return { country: reg.country, region: reg.region, city: reg.city, latitude: reg.latitude, longitude: reg.longitude, geoConfidence: reg.confidence, geoSource: 'location_registry', method: 'location_registry' };
  }

  // 2) deterministic gazetteer — ONLY if the source already carries place text.
  if (input.country || input.region || input.city) {
    const g = geocode({ country: input.country, region: input.region, state: null, city: input.city });
    if (g) return { country: input.country, region: input.region, city: input.city, latitude: g.lat, longitude: g.lng, geoConfidence: g.confidence, geoSource: g.source, method: 'gazetteer' };
  }

  // 3) unprovable → GEO_UNKNOWN preserved.
  return null;
}
