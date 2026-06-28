// =============================================================================
// HSI Phase 75 — Narrative geographic footprint tests (PURE).
// Verifies inheritance from member sources, the no-fabrication discipline (only
// real coordinates plot; absent geo → NOT OBSERVED), and deterministic rollups.
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { rollupNarrativeGeography, type NarrativeGeoSource } from './geography';

function src(over: Partial<NarrativeGeoSource>): NarrativeGeoSource {
  return { sourceId: 's', name: 'Source', country: null, region: null, city: null, lat: null, lng: null, ...over };
}

// ---- no fabrication --------------------------------------------------------

test('empty input → fully zeroed, NOT OBSERVED footprint', () => {
  const g = rollupNarrativeGeography([]);
  assert.equal(g.totalSources, 0);
  assert.equal(g.geoReadySources, 0);
  assert.equal(g.ungeolocatedSources, 0);
  assert.equal(g.coverageRatio, 0);
  assert.deepEqual(g.countries, []);
  assert.deepEqual(g.regions, []);
  assert.deepEqual(g.points, []);
  assert.equal(g.dominantCountry, null);
  assert.equal(g.centroid, null);
  assert.equal(g.bounds, null);
  assert.match(g.reason, /NOT OBSERVED/);
});

test('member sources without coordinates never plot (counted as ungeolocated)', () => {
  const g = rollupNarrativeGeography([
    src({ sourceId: 'a', country: 'United States' }), // place text but no coords
    src({ sourceId: 'b' }),
  ]);
  assert.equal(g.totalSources, 2);
  assert.equal(g.geoReadySources, 0);
  assert.equal(g.ungeolocatedSources, 2);
  assert.equal(g.points.length, 0);
  assert.equal(g.dominantCountry, null); // no plotted coords → no fabricated country
  assert.equal(g.centroid, null);
  assert.match(g.reason, /none with real coordinates/);
});

test('out-of-range / non-finite coordinates are rejected (not fabricated)', () => {
  const g = rollupNarrativeGeography([
    src({ sourceId: 'a', country: 'X', lat: 200, lng: 0 }),
    src({ sourceId: 'b', country: 'Y', lat: 0, lng: 999 }),
    src({ sourceId: 'c', country: 'Z', lat: Number.NaN, lng: 0 }),
    src({ sourceId: 'd', country: 'W', lat: Number.POSITIVE_INFINITY, lng: 0 }),
  ]);
  assert.equal(g.geoReadySources, 0);
  assert.equal(g.ungeolocatedSources, 4);
});

// ---- numeric-string coordinates (Postgres `numeric` → string via PostgREST) --
// Regression: production source_candidates.latitude/longitude arrive as STRINGS,
// which must coerce to real plotted coordinates — not be dropped as ungeolocated.

test('numeric-string coordinates coerce and plot (not dropped as ungeolocated)', () => {
  const g = rollupNarrativeGeography([
    src({ sourceId: 'a', name: 'A', country: 'United States', region: 'New York', lat: '42.6' as never, lng: '-73.7' as never }),
  ]);
  assert.equal(g.geoReadySources, 1);
  assert.equal(g.ungeolocatedSources, 0);
  assert.deepEqual(g.centroid, { lat: 42.6, lng: -73.7 });
  assert.deepEqual(g.points[0] && { lat: g.points[0].lat, lng: g.points[0].lng }, { lat: 42.6, lng: -73.7 });
  // coerced to real numbers (never the raw string)
  assert.equal(typeof g.points[0].lat, 'number');
  assert.equal(typeof g.points[0].lng, 'number');
});

test('mixed number / numeric-string / invalid / null coordinates: only real ones plot', () => {
  const g = rollupNarrativeGeography([
    src({ sourceId: 'a', name: 'A', country: 'C', lat: 10, lng: 20 }),          // real number
    src({ sourceId: 'b', name: 'B', country: 'C', lat: '30' as never, lng: '40' as never }), // numeric string
    src({ sourceId: 'c', name: 'C', country: 'C', lat: 'NaN' as never, lng: '0' as never }), // non-numeric string
    src({ sourceId: 'd', name: 'D', country: 'C', lat: '' as never, lng: '' as never }),     // empty string
    src({ sourceId: 'e', name: 'E', country: 'C', lat: '200' as never, lng: '0' as never }), // out of range string
    src({ sourceId: 'f', name: 'F', country: 'C' }),                            // null
  ]);
  assert.equal(g.totalSources, 6);
  assert.equal(g.geoReadySources, 2);
  assert.equal(g.ungeolocatedSources, 4);
  assert.deepEqual(g.centroid, { lat: 20, lng: 30 }); // mean of (10,20) & (30,40)
  assert.deepEqual(g.bounds, { minLat: 10, maxLat: 30, minLng: 20, maxLng: 40 });
});

test('object / boolean coordinate values are rejected (never fabricated)', () => {
  const g = rollupNarrativeGeography([
    src({ sourceId: 'a', country: 'C', lat: {} as never, lng: 0 }),
    src({ sourceId: 'b', country: 'C', lat: true as never, lng: 0 }),
    src({ sourceId: 'c', country: 'C', lat: [] as never, lng: 0 }),
  ]);
  assert.equal(g.geoReadySources, 0);
  assert.equal(g.ungeolocatedSources, 3);
  assert.equal(g.centroid, null);
  assert.equal(g.bounds, null);
});

// ---- inheritance + rollups -------------------------------------------------

test('inherits geography from plottable member sources', () => {
  const g = rollupNarrativeGeography([
    src({ sourceId: 'a', name: 'A', country: 'United States', region: 'New York', city: 'Albany', lat: 42.6, lng: -73.7 }),
    src({ sourceId: 'b', name: 'B', country: 'United States', region: 'California', lat: 34, lng: -118 }),
    src({ sourceId: 'c', name: 'C', country: 'France', region: 'Île-de-France', lat: 48.85, lng: 2.35 }),
    src({ sourceId: 'd', name: 'D' }), // ungeolocated
  ]);
  assert.equal(g.totalSources, 4);
  assert.equal(g.geoReadySources, 3);
  assert.equal(g.ungeolocatedSources, 1);
  assert.equal(g.coverageRatio, 0.75);
  assert.equal(g.dominantCountry, 'United States'); // 2 vs 1
  assert.deepEqual(g.countries, [
    { country: 'United States', sourceCount: 2 },
    { country: 'France', sourceCount: 1 },
  ]);
  assert.equal(g.regions.length, 3);
  assert.match(g.reason, /3\/4 member sources plotted across 2 countries/);
});

test('centroid is the arithmetic mean of plotted coordinates; bounds wrap them', () => {
  const g = rollupNarrativeGeography([
    src({ sourceId: 'a', name: 'A', country: 'C', lat: 0, lng: 0 }),
    src({ sourceId: 'b', name: 'B', country: 'C', lat: 10, lng: 20 }),
  ]);
  assert.deepEqual(g.centroid, { lat: 5, lng: 10 });
  assert.deepEqual(g.bounds, { minLat: 0, maxLat: 10, minLng: 0, maxLng: 20 });
});

test('rollups are deterministic (count desc, then name/key)', () => {
  const g = rollupNarrativeGeography([
    src({ sourceId: '1', name: 'Z', country: 'Brazil', lat: -15, lng: -47 }),
    src({ sourceId: '2', name: 'Y', country: 'Argentina', lat: -34, lng: -58 }),
  ]);
  // tie on count(1) → alphabetical country
  assert.deepEqual(g.countries.map((c) => c.country), ['Argentina', 'Brazil']);
});

test('coverageRatio is 1 when every member source is plottable', () => {
  const g = rollupNarrativeGeography([
    src({ sourceId: 'a', name: 'A', country: 'C', lat: 1, lng: 1 }),
    src({ sourceId: 'b', name: 'B', country: 'C', lat: 2, lng: 2 }),
  ]);
  assert.equal(g.coverageRatio, 1);
  assert.equal(g.ungeolocatedSources, 0);
});
