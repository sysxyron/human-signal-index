// =============================================================================
// HSI Phase 73.3 bugfix — GeoJSON geometry normalization (PURE).
//
// The map is a strict Point-only model: every source resolves to exactly one
// { type:"Point", coordinates:[lng,lat] }. Postgres `numeric` lat/lng can
// deserialize as STRINGS, and string/NaN coordinates corrupt MapLibre's GeoJSON
// worker ("Unimplemented type: 4"). This module coerces coordinates to finite
// numbers and emits ONLY valid Point features; anything else is classified
// INVALID and skipped — never coerced into a fake geometry. No I/O.
// =============================================================================

/** Coerce a value (number or numeric string) to a finite number, else null. */
export function toNum(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') { const n = Number(v); return Number.isFinite(n) ? n : null; }
  return null;
}

export function inRange(lat: number, lng: number): boolean {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export interface PointFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: Record<string, string | number>;
}

/** MapLibre's GeoJSON worker (vt-pbf) can only encode string / finite-number
 *  property values. null / undefined / NaN / objects / arrays corrupt the tile
 *  stream and throw "Unimplemented type: 4". Keep only safe values; coerce
 *  booleans to 0/1; drop everything else. */
export function sanitizeProperties(props: Record<string, unknown>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(props)) {
    if (typeof v === 'number') { if (Number.isFinite(v)) out[k] = v; }
    else if (typeof v === 'string') out[k] = v;
    else if (typeof v === 'boolean') out[k] = v ? 1 : 0;
    // null / undefined / object / array → skipped (never sent to MapLibre)
  }
  return out;
}

/** Build a valid GeoJSON Point feature with sanitized properties, or null if the
 *  coordinate is invalid. The ONLY way features reach the map. */
export function pointFeature(properties: Record<string, unknown>, latRaw: unknown, lngRaw: unknown): PointFeature | null {
  const lat = toNum(latRaw); const lng = toNum(lngRaw);
  if (lat == null || lng == null || !inRange(lat, lng)) return null;
  return { type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties: sanitizeProperties(properties) };
}

/** A guaranteed-safe FeatureCollection: only valid Point features, sanitized
 *  properties, finite in-range coordinates. Never throws. */
export function sanitizeFeatureCollection(rows: Array<{ properties: Record<string, unknown>; lat: unknown; lng: unknown }>): { type: 'FeatureCollection'; features: PointFeature[] } {
  const features: PointFeature[] = [];
  for (const r of rows) { const f = pointFeature(r.properties, r.lat, r.lng); if (f) features.push(f); }
  return { type: 'FeatureCollection', features };
}

export type GeometryKind = 'Point' | 'INVALID';
export function classifyCoordinate(latRaw: unknown, lngRaw: unknown): GeometryKind {
  const lat = toNum(latRaw); const lng = toNum(lngRaw);
  return lat != null && lng != null && inRange(lat, lng) ? 'Point' : 'INVALID';
}

export interface GeometryAudit { total: number; point: number; invalid: number; byType: Record<string, number> }

/** Count coordinate rows by geometry validity. The data model is Point-only, so
 *  the only categories are Point (valid) and INVALID (skipped). */
export function auditGeometries(rows: Array<{ lat: unknown; lng: unknown }>): GeometryAudit {
  let point = 0; let invalid = 0;
  for (const r of rows) { if (classifyCoordinate(r.lat, r.lng) === 'Point') point++; else invalid++; }
  return { total: rows.length, point, invalid, byType: { Point: point, INVALID: invalid } };
}
