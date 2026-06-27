import { test } from 'node:test';
import assert from 'node:assert/strict';

import { detectBlindSpot, severityRank } from './blindspots';
import { aggregateTrust } from './trust';
import { contradictionRatio, layerWeight, rollupByGeo, focusIntelligenceOnSources } from './aggregate';
import { MAP_LAYERS, type GeoIntelPoint } from './types';
import type { GeospatialIntelligence } from './data';

function pt(over: Partial<GeoIntelPoint>): GeoIntelPoint {
  return {
    id: 'x', name: 'X', sourceType: 'website', category: 'A', country: 'United States', region: 'New York', city: 'Albany',
    lat: 42.6, lng: -73.7, trustScore: null, trustBand: null,
    sourceCount: 1, signalCount: 0, evidenceCount: 0, narrativeCount: 0, forecastCount: 0, contradicts: 0, supports: 0,
    contradictionRatio: 0, blindSpot: { isBlindSpot: false, severity: 'none', reasons: [] }, ...over,
  };
}

// ---- blind spots (Step 7) --------------------------------------------------

test('blind spot: narratives with no evidence → flagged', () => {
  const b = detectBlindSpot({ narrativeCount: 3, forecastCount: 0, evidenceCount: 0 });
  assert.equal(b.isBlindSpot, true); assert.equal(b.severity, 'medium'); assert.ok(b.reasons.length > 0);
});
test('blind spot: forecasts with no evidence → flagged', () => {
  assert.equal(detectBlindSpot({ narrativeCount: 0, forecastCount: 1, evidenceCount: 0 }).isBlindSpot, true);
});
test('blind spot: evidence present → never a blind spot', () => {
  const b = detectBlindSpot({ narrativeCount: 9, forecastCount: 9, evidenceCount: 1 });
  assert.equal(b.isBlindSpot, false); assert.equal(b.severity, 'none');
});
test('blind spot: severity scales with unsupported activity', () => {
  assert.equal(detectBlindSpot({ narrativeCount: 1, forecastCount: 0, evidenceCount: 0 }).severity, 'low');
  assert.equal(detectBlindSpot({ narrativeCount: 6, forecastCount: 0, evidenceCount: 0 }).severity, 'high');
  assert.ok(severityRank('high') > severityRank('low'));
});
test('blind spot: no activity at all → not a blind spot', () => {
  assert.equal(detectBlindSpot({ narrativeCount: 0, forecastCount: 0, evidenceCount: 0 }).isBlindSpot, false);
});

// ---- trust aggregation (Step 6) --------------------------------------------

test('trust: real values only; bands high/medium/low', () => {
  const t = aggregateTrust([80, 55, 30, null, undefined]);
  assert.equal(t.observed, 3); assert.equal(t.high, 1); assert.equal(t.medium, 1); assert.equal(t.low, 1);
  assert.equal(t.avg, 55);
});
test('trust: none observed → avg null (NOT OBSERVED, no synthetic score)', () => {
  const t = aggregateTrust([null, undefined]);
  assert.equal(t.observed, 0); assert.equal(t.avg, null);
});

// ---- contradiction ratio (Step 5) ------------------------------------------

test('contradictionRatio: real edge counts; 0 when none', () => {
  assert.equal(contradictionRatio(3, 1), 0.75);
  assert.equal(contradictionRatio(0, 0), 0);
  assert.equal(contradictionRatio(0, 5), 0);
});

// ---- layer weights (Step 8) ------------------------------------------------

test('layerWeight: each layer maps to its real metric', () => {
  const p = { signalCount: 4, narrativeCount: 2, evidenceCount: 5, forecastCount: 1, contradicts: 3, trustScore: 70, blindSpot: { severity: 'high' } };
  assert.equal(layerWeight(p, 'SOURCES'), 1);
  assert.equal(layerWeight(p, 'NARRATIVES'), 2);
  assert.equal(layerWeight(p, 'EVIDENCE'), 5);
  assert.equal(layerWeight(p, 'FORECASTS'), 1);
  assert.equal(layerWeight(p, 'CONTRADICTIONS'), 3);
  assert.equal(layerWeight(p, 'TRUST'), 70);
  assert.equal(layerWeight(p, 'BLIND_SPOTS'), 3);
  assert.equal(MAP_LAYERS.length, 7);
});
test('layerWeight: null trust → 0 (not fabricated)', () => {
  assert.equal(layerWeight({ signalCount: 0, narrativeCount: 0, evidenceCount: 0, forecastCount: 0, contradicts: 0, trustScore: null, blindSpot: { severity: 'none' } }, 'TRUST'), 0);
});

// ---- geo rollup (Steps 2/3/4/10) -------------------------------------------

test('rollupByGeo: sums metrics per geography + recomputes ratio/trust/blindspot', () => {
  const points = [
    pt({ id: '1', country: 'United States', region: 'New York', narrativeCount: 2, signalCount: 3, evidenceCount: 0, forecastCount: 1, contradicts: 2, supports: 2, trustScore: 80 }),
    pt({ id: '2', country: 'United States', region: 'New York', narrativeCount: 1, signalCount: 1, evidenceCount: 0, forecastCount: 0, contradicts: 0, supports: 2, trustScore: 40 }),
    pt({ id: '3', country: 'France', region: 'Île-de-France', narrativeCount: 0, signalCount: 5, evidenceCount: 4, contradicts: 1, supports: 1, trustScore: null }),
  ];
  const byCountry = rollupByGeo(points, 'country');
  const us = byCountry.find((b) => b.key === 'United States');
  assert.equal(us?.sourceCount, 2); assert.equal(us?.narrativeCount, 3); assert.equal(us?.signalCount, 4);
  assert.equal(us?.contradictionRatio, contradictionRatio(2, 4));
  assert.equal(us?.trust.observed, 2); assert.equal(us?.trust.avg, 60);
  assert.equal(us?.blindSpot.isBlindSpot, true); // narratives+forecasts, zero evidence
  const fr = byCountry.find((b) => b.key === 'France');
  assert.equal(fr?.blindSpot.isBlindSpot, false); // has evidence
  assert.equal(fr?.trust.observed, 0); assert.equal(fr?.trust.avg, null);
});
test('rollupByGeo: region/city granularity keys', () => {
  const points = [pt({ country: 'United States', region: 'New York', city: 'Albany' })];
  assert.equal(rollupByGeo(points, 'region')[0].key, 'United States · New York');
  assert.equal(rollupByGeo(points, 'city')[0].key, 'United States · New York · Albany');
});
test('rollupByGeo: empty → empty (no fabrication)', () => {
  assert.deepEqual(rollupByGeo([], 'country'), []);
});

// ---- narrative map isolation (Phase 75) ------------------------------------

function intel(points: GeoIntelPoint[]): GeospatialIntelligence {
  return {
    points, pointTotal: points.length, capped: false,
    byCountry: rollupByGeo(points, 'country'), byRegion: rollupByGeo(points, 'region'), byCity: rollupByGeo(points, 'city'),
    totals: { sources: points.length, signals: 0, evidence: 0, narratives: 0, forecasts: 0, contradicts: 0, supports: 0, blindSpots: 0 },
    filters: { types: ['website'], categories: ['A'], countries: ['United States', 'France'] },
  };
}

test('focusIntelligenceOnSources: keeps only the narrative member sources + recomputes rollups', () => {
  const base = intel([
    pt({ id: 'a', country: 'United States', narrativeCount: 2, signalCount: 3 }),
    pt({ id: 'b', country: 'France', narrativeCount: 1, signalCount: 1 }),
    pt({ id: 'c', country: 'United States', narrativeCount: 0, signalCount: 5 }),
  ]);
  const focused = focusIntelligenceOnSources(base, new Set(['a', 'b']));
  assert.equal(focused.points.length, 2);
  assert.equal(focused.pointTotal, 2);
  assert.equal(focused.totals.narratives, 3);
  assert.equal(focused.totals.signals, 4);
  assert.deepEqual(focused.byCountry.map((b) => b.key).sort(), ['France', 'United States']);
  // filter dropdowns are preserved (not narrowed)
  assert.deepEqual(focused.filters.countries, ['United States', 'France']);
});

test('focusIntelligenceOnSources: empty id set → empty footprint (no fabrication)', () => {
  const focused = focusIntelligenceOnSources(intel([pt({ id: 'a' })]), new Set<string>());
  assert.equal(focused.points.length, 0);
  assert.equal(focused.totals.sources, 0);
  assert.deepEqual(focused.byCountry, []);
});
