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
  properties: Record<string, unknown>;
}

/** Build a valid GeoJSON Point feature, or null if the coordinate is invalid. */
export function pointFeature(properties: Record<string, unknown>, latRaw: unknown, lngRaw: unknown): PointFeature | null {
  const lat = toNum(latRaw); const lng = toNum(lngRaw);
  if (lat == null || lng == null || !inRange(lat, lng)) return null;
  return { type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties };
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
