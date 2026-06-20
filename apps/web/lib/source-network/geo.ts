// =============================================================================
// HSI Phase 70.3.3 — Geo readiness classification (PURE, deterministic).
// Decides whether a source is mappable for the Phase 71 Global Intelligence Map.
// Coordinates are only ever counted when actually present — never invented.
// No I/O.
// =============================================================================

import { normalizeSourceType } from '../source-discovery/types';
import type { GeoInput, GeoReadiness, ClassifiedResult } from './types';

/** Pure-infrastructure types with no single physical location → not mappable. */
const NON_GEO_TYPES = new Set(['api_foundation', 'webhook', 'intelligence_feed']);

function hasText(v: string | null): boolean { return typeof v === 'string' && v.trim().length > 0; }
function hasNum(v: number | null): boolean { return typeof v === 'number' && Number.isFinite(v); }

/** geo_ready (coords) > partial_geo (place text/metadata) > missing_geo > not_applicable. */
export function computeGeoReadiness(input: GeoInput): ClassifiedResult<GeoReadiness> {
  const type = normalizeSourceType(input.sourceType) ?? '';
  if (NON_GEO_TYPES.has(type)) return { value: 'not_applicable', reason: `${type} has no physical location — not applicable to the map.` };

  const hasCoords = hasNum(input.latitude) && hasNum(input.longitude);
  if (hasCoords) {
    const conf = hasNum(input.geoConfidence) ? ` (confidence ${input.geoConfidence})` : '';
    const src = hasText(input.geoSource) ? `, source ${input.geoSource}` : '';
    return { value: 'geo_ready', reason: `Latitude/longitude present${conf}${src}.` };
  }

  const placeBits = [input.country, input.region, input.city].filter(hasText);
  if (placeBits.length > 0 || hasText(input.geoSource)) {
    return { value: 'partial_geo', reason: `Place text present (${placeBits.join(', ') || input.geoSource}) but no coordinates — geocoding needed.` };
  }

  return { value: 'missing_geo', reason: 'No coordinates and no place fields.' };
}
