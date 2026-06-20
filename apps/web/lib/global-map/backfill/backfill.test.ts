import { test } from 'node:test';
import assert from 'node:assert/strict';

import { lookupLocation, REGISTRY_SIZE } from '../location-registry';
import { resolveGeo } from './resolve';

// ---- location registry: exact matching only --------------------------------

test('registry: exact name match resolves real HQ coords', () => {
  const r = lookupLocation('Reuters');
  assert.ok(r); assert.equal(r?.city, 'London'); assert.equal(r?.country, 'United Kingdom');
  assert.ok(Math.abs((r?.latitude ?? 0) - 51.5074) < 0.001);
});
test('registry: case-insensitive + strips leading "the"', () => {
  assert.equal(lookupLocation('  reuters ')?.city, 'London');
  assert.equal(lookupLocation('The Guardian')?.city, 'London');
  assert.equal(lookupLocation('FBI')?.city, 'Washington');
});
test('registry: exact domain match', () => {
  assert.equal(lookupLocation(null, 'https://www.npr.org/sections/news')?.city, 'Washington');
  assert.equal(lookupLocation('Unknown Org', 'https://who.int/feed')?.city, 'Geneva');
});
test('registry: unknown source → null (NO fuzzy match, no fabrication)', () => {
  assert.equal(lookupLocation('Acme Intelligence Co'), null);
  assert.equal(lookupLocation('reuter'), null);        // not exact
  assert.equal(lookupLocation(null, 'https://example.com'), null);
  assert.equal(lookupLocation(null, null), null);
});
test('registry has a real seeded size', () => {
  assert.ok(REGISTRY_SIZE.names >= 30);
  assert.ok(REGISTRY_SIZE.domains >= 30);
});

// ---- backfill resolver: deterministic priority -----------------------------

const base = { sourceName: null as string | null, primaryUrl: null as string | null, feedUrl: null as string | null, country: null as string | null, region: null as string | null, city: null as string | null, latitude: null as number | null, longitude: null as number | null };

test('resolveGeo: registry match → location_registry method', () => {
  const g = resolveGeo({ ...base, sourceName: 'BBC' });
  assert.ok(g); assert.equal(g?.method, 'location_registry'); assert.equal(g?.geoSource, 'location_registry'); assert.equal(g?.city, 'London');
});
test('resolveGeo: place text only → gazetteer method', () => {
  const g = resolveGeo({ ...base, sourceName: 'Some Local Outlet', country: 'United States', region: 'New York' });
  assert.ok(g); assert.equal(g?.method, 'gazetteer'); assert.match(g?.geoSource ?? '', /gazetteer/);
});
test('resolveGeo: already has coords → null (nothing to backfill)', () => {
  assert.equal(resolveGeo({ ...base, sourceName: 'BBC', latitude: 1, longitude: 2 }), null);
});
test('resolveGeo: unprovable → null (GEO_UNKNOWN preserved, never fabricated)', () => {
  assert.equal(resolveGeo({ ...base, sourceName: 'Acme Co' }), null);
  assert.equal(resolveGeo({ ...base, sourceName: 'Acme Co', country: 'Atlantis' }), null); // unknown country
  assert.equal(resolveGeo({ ...base }), null);
});
test('resolveGeo: never returns 0,0 or partial coords', () => {
  const g = resolveGeo({ ...base, sourceName: 'WHO' });
  assert.ok(g && Number.isFinite(g.latitude) && Number.isFinite(g.longitude));
  assert.ok(!(g!.latitude === 0 && g!.longitude === 0));
});
test('resolveGeo: registry wins over place text', () => {
  // Reuters is in the registry (London); even with a misleading country it resolves to the HQ.
  const g = resolveGeo({ ...base, sourceName: 'Reuters', country: 'United States' });
  assert.equal(g?.city, 'London'); assert.equal(g?.method, 'location_registry');
});
