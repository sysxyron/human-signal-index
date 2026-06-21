import { test } from 'node:test';
import assert from 'node:assert/strict';

import { toNum, inRange, pointFeature, classifyCoordinate, auditGeometries } from './geometry';

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
