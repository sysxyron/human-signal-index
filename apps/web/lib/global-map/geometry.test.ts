import { test } from 'node:test';
import assert from 'node:assert/strict';

import { toNum, inRange, pointFeature, classifyCoordinate, auditGeometries, sanitizeProperties, sanitizeFeatureCollection } from './geometry';

// ---- coercion (the "Unimplemented type: 4" root cause: numeric-as-string) ---

test('toNum: coerces numeric strings (Postgres numeric), rejects junk', () => {
  assert.equal(toNum(51.5), 51.5);
  assert.equal(toNum('51.5074'), 51.5074);   // PG numeric arrives as string
  assert.equal(toNum('-0.1278'), -0.1278);
  assert.equal(toNum(''), null);
  assert.equal(toNum('abc'), null);
  assert.equal(toNum(null), null);
  assert.equal(toNum(undefined), null);
  assert.equal(toNum(NaN), null);
  assert.equal(toNum(Infinity), null);
});
test('inRange: lat/lng bounds', () => {
  assert.equal(inRange(51.5, -0.12), true);
  assert.equal(inRange(91, 0), false);
  assert.equal(inRange(0, 181), false);
});

// ---- Point-only feature builder --------------------------------------------

test('pointFeature: valid number coords → Point [lng,lat]', () => {
  const f = pointFeature({ id: 'a' }, 51.5074, -0.1278);
  assert.ok(f); assert.equal(f?.geometry.type, 'Point');
  assert.deepEqual(f?.geometry.coordinates, [-0.1278, 51.5074]); // lng,lat order
});
test('pointFeature: numeric-string coords → coerced Point', () => {
  const f = pointFeature({ id: 'a' }, '51.5074', '-0.1278');
  assert.ok(f); assert.deepEqual(f?.geometry.coordinates, [-0.1278, 51.5074]);
});
test('pointFeature: invalid/out-of-range/null → null (skip, never fabricate)', () => {
  assert.equal(pointFeature({}, null, null), null);
  assert.equal(pointFeature({}, 'x', 'y'), null);
  assert.equal(pointFeature({}, 91, 0), null);
  assert.equal(pointFeature({}, 0, 999), null);
});

// ---- classification + audit ------------------------------------------------

test('classifyCoordinate: Point vs INVALID', () => {
  assert.equal(classifyCoordinate(40, -74), 'Point');
  assert.equal(classifyCoordinate('40', '-74'), 'Point');
  assert.equal(classifyCoordinate(null, -74), 'INVALID');
  assert.equal(classifyCoordinate(40, 'nope'), 'INVALID');
});
test('auditGeometries: counts Point vs INVALID (Point-only model)', () => {
  const a = auditGeometries([{ lat: 40, lng: -74 }, { lat: '51.5', lng: '-0.1' }, { lat: null, lng: 5 }, { lat: 999, lng: 0 }]);
  assert.equal(a.total, 4); assert.equal(a.point, 2); assert.equal(a.invalid, 2);
  assert.deepEqual(a.byType, { Point: 2, INVALID: 2 });
});
test('auditGeometries: empty → all zero', () => {
  assert.deepEqual(auditGeometries([]), { total: 0, point: 0, invalid: 0, byType: { Point: 0, INVALID: 0 } });
});

// ---- property sanitizer (the real "Unimplemented type: 4" guard) -----------

test('sanitizeProperties: keep string + finite number; drop null/undefined/NaN/object/array', () => {
  const out = sanitizeProperties({ id: 'x', name: 'Reuters', weight: 3, ratio: 0.5, bad: NaN, n: null, u: undefined, obj: {}, arr: [1], inf: Infinity });
  assert.deepEqual(out, { id: 'x', name: 'Reuters', weight: 3, ratio: 0.5 });
});
test('sanitizeProperties: boolean → 0/1', () => {
  assert.deepEqual(sanitizeProperties({ a: true, b: false }), { a: 1, b: 0 });
});

test('pointFeature: properties are sanitized (no null/NaN reach MapLibre)', () => {
  const f = pointFeature({ id: 'x', name: 'N', weight: NaN, junk: null, ok: 2 }, 40, -74);
  assert.ok(f);
  assert.deepEqual(f?.properties, { id: 'x', name: 'N', ok: 2 }); // weight(NaN)+junk(null) dropped
});

test('sanitizeFeatureCollection: only valid Point features survive', () => {
  const fc = sanitizeFeatureCollection([
    { properties: { id: '1', weight: 5 }, lat: 51.5, lng: -0.1 },
    { properties: { id: '2', weight: NaN }, lat: '40', lng: '-74' },   // string coords coerced
    { properties: { id: '3' }, lat: 999, lng: 0 },                       // out of range → skipped
    { properties: { id: '4' }, lat: null, lng: null },                   // invalid → skipped
  ]);
  assert.equal(fc.type, 'FeatureCollection');
  assert.equal(fc.features.length, 2);
  assert.ok(fc.features.every((f) => f.geometry.type === 'Point' && Number.isFinite(f.geometry.coordinates[0]) && Number.isFinite(f.geometry.coordinates[1])));
});
