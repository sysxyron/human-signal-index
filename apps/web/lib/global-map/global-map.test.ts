import { test } from 'node:test';
import assert from 'node:assert/strict';

import { geocode, GAZETTEER_COVERAGE } from './geocoder';
import { geoStatus, isPlottable, GEO_STATUSES } from './geo-model';
import { computeMapReadiness, type ReadinessSource } from './readiness';

// ---- D2: deterministic geocoder --------------------------------------------

test('geocode: city → high confidence (Albany, NY)', () => {
  const r = geocode({ country: 'United States', region: 'NY', state: null, city: 'Albany' });
  assert.ok(r); assert.equal(r?.granularity, 'city'); assert.equal(r?.confidence, 0.9);
  assert.ok(Math.abs((r?.lat ?? 0) - 42.65) < 0.1);
  assert.match(r?.source ?? '', /city/);
});
test('geocode: US state → medium confidence', () => {
  const r = geocode({ country: 'United States', region: 'New York', state: null, city: null });
  assert.equal(r?.granularity, 'state'); assert.equal(r?.confidence, 0.6);
});
test('geocode: state abbreviation resolves', () => {
  const r = geocode({ country: 'USA', region: 'tx', state: null, city: null });
  assert.equal(r?.granularity, 'state'); assert.ok(Math.abs((r?.lat ?? 0) - 31.5) < 0.5);
});
test('geocode: country only → low confidence centroid', () => {
  const r = geocode({ country: 'France', region: null, state: null, city: null });
  assert.equal(r?.granularity, 'country'); assert.equal(r?.confidence, 0.3);
});
test('geocode: unknown place → null (NEVER fabricates a coordinate)', () => {
  assert.equal(geocode({ country: 'Atlantis', region: null, state: null, city: null }), null);
  assert.equal(geocode({ country: null, region: null, state: null, city: null }), null);
  assert.equal(geocode({ country: null, region: null, state: null, city: 'Nowheresville' }), null);
});
test('geocode: most specific wins (city beats country)', () => {
  const r = geocode({ country: 'United Kingdom', region: null, state: null, city: 'London' });
  assert.equal(r?.granularity, 'city');
});
test('gazetteer has real coverage', () => {
  assert.ok(GAZETTEER_COVERAGE.countries >= 40);
  assert.ok(GAZETTEER_COVERAGE.usStates >= 50);
  assert.ok(GAZETTEER_COVERAGE.cities >= 30);
});

// ---- D1: geo status model --------------------------------------------------

test('geoStatus: coords → GEO_READY; place text → PARTIAL_GEO; nothing → MISSING_GEO', () => {
  assert.equal(geoStatus({ sourceType: 'website', country: 'US', region: null, state: null, city: null, latitude: 40, longitude: -74, geoConfidence: 0.9, geoSource: 'x' }).status, 'GEO_READY');
  assert.equal(geoStatus({ sourceType: 'website', country: 'US', region: null, state: null, city: null, latitude: null, longitude: null, geoConfidence: null, geoSource: null }).status, 'PARTIAL_GEO');
  assert.equal(geoStatus({ sourceType: 'website', country: null, region: null, state: null, city: null, latitude: null, longitude: null, geoConfidence: null, geoSource: null }).status, 'MISSING_GEO');
});
test('geoStatus: infrastructure types → NOT_APPLICABLE; all statuses valid', () => {
  const s = geoStatus({ sourceType: 'api_foundation', country: null, region: null, state: null, city: null, latitude: null, longitude: null, geoConfidence: null, geoSource: null }).status;
  assert.equal(s, 'NOT_APPLICABLE');
  assert.ok((GEO_STATUSES as readonly string[]).includes(s));
});

test('isPlottable: only finite in-range coords', () => {
  assert.equal(isPlottable(40, -74), true);
  assert.equal(isPlottable(null, -74), false);
  assert.equal(isPlottable(91, 0), false);
  assert.equal(isPlottable(0, 200), false);
});

// ---- D8: readiness aggregation (real counts only) --------------------------

const rows: ReadinessSource[] = [
  { geoStatus: 'GEO_READY', sourceType: 'website', category: 'A', familyKey: 'reuters', country: 'United States' },
  { geoStatus: 'GEO_READY', sourceType: 'rss_feed', category: 'D', familyKey: 'reuters', country: 'United States' },
  { geoStatus: 'PARTIAL_GEO', sourceType: 'website', category: 'B', familyKey: 'bbc', country: 'United Kingdom' },
  { geoStatus: 'MISSING_GEO', sourceType: 'website', category: 'C', familyKey: 'x', country: null },
  { geoStatus: 'NOT_APPLICABLE', sourceType: 'api_foundation', category: 'Foundation', familyKey: 'y', country: null },
];

test('computeMapReadiness: totals are exact tallies', () => {
  const r = computeMapReadiness(rows);
  assert.equal(r.totalSources, 5);
  assert.equal(r.geoReady, 2); assert.equal(r.partialGeo, 1); assert.equal(r.missingGeo, 1); assert.equal(r.notApplicable, 1);
});
test('computeMapReadiness: breakdowns by type/category/family/country', () => {
  const r = computeMapReadiness(rows);
  const website = r.byType.find((b) => b.key === 'website');
  assert.equal(website?.total, 3); assert.equal(website?.ready, 1); assert.equal(website?.partial, 1); assert.equal(website?.missing, 1);
  const reuters = r.byFamily.find((b) => b.key === 'reuters'); // multi-member only
  assert.equal(reuters?.total, 2); assert.equal(reuters?.ready, 2);
  const us = r.byCountry.find((b) => b.key === 'United States');
  assert.equal(us?.ready, 2);
});
test('computeMapReadiness: empty input → all zero (no fabrication)', () => {
  const r = computeMapReadiness([]);
  assert.equal(r.totalSources, 0); assert.equal(r.geoReady, 0); assert.deepEqual(r.byType, []);
});
