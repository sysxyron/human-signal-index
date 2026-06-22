import { test } from 'node:test';
import assert from 'node:assert/strict';

import { decideReadBackend, availabilityFromHealth, isBackendAvailable } from './read-backends';
import { BACKEND_AVAILABILITY } from './backend-availability';

const AVAIL = BACKEND_AVAILABILITY; // primary live; replica/d1/cache unavailable

// ---- decideReadBackend (pure routing) --------------------------------------

test('primary requested → primary, no fallback', () => {
  const d = decideReadBackend('public', 'primary', AVAIL);
  assert.equal(d.effectiveBackend, 'primary'); assert.equal(d.fallbackReason, null);
});
test('invalid backend → primary with recorded fallback', () => {
  const d = decideReadBackend('dashboard', 'mysql', AVAIL);
  assert.equal(d.effectiveBackend, 'primary'); assert.match(d.fallbackReason ?? '', /invalid backend/);
});
test('replica requested but unavailable → falls back to primary (recorded)', () => {
  const d = decideReadBackend('public', 'replica', AVAIL);
  assert.equal(d.requestedBackend, 'replica'); assert.equal(d.effectiveBackend, 'primary'); assert.match(d.fallbackReason ?? '', /replica is unavailable/);
});
test('d1 requested but unavailable → falls back to primary', () => {
  assert.equal(decideReadBackend('public', 'd1', AVAIL).effectiveBackend, 'primary');
});
test('cache requested but unavailable → falls back to primary', () => {
  assert.equal(decideReadBackend('dashboard', 'cache', AVAIL).effectiveBackend, 'primary');
});
test('admin scope is always primary (requested ignored, recorded)', () => {
  const d = decideReadBackend('admin', 'replica', AVAIL);
  assert.equal(d.effectiveBackend, 'primary'); assert.match(d.fallbackReason ?? '', /admin scope is always served by primary/);
});
test('system scope is always primary', () => {
  assert.equal(decideReadBackend('system', 'd1', AVAIL).effectiveBackend, 'primary');
});
test('dashboard selector respected when backend IS available (future state)', () => {
  const future = { ...AVAIL, replica: { available: true, reads: true, writes: false } };
  const d = decideReadBackend('dashboard', 'replica', future);
  assert.equal(d.effectiveBackend, 'replica'); assert.equal(d.fallbackReason, null);
});
test('public selector respected when backend IS available (future state)', () => {
  const future = { ...AVAIL, d1: { available: true, reads: true, writes: false } };
  assert.equal(decideReadBackend('public', 'd1', future).effectiveBackend, 'd1');
});
test('primary reported down → effective still primary, but fallbackReason set', () => {
  const down = availabilityFromHealth('down');
  const d = decideReadBackend('public', 'primary', down);
  assert.equal(d.effectiveBackend, 'primary'); assert.match(d.fallbackReason ?? '', /primary is reported unavailable/);
  assert.equal(isBackendAvailable('primary', down), false);
});

// ---- availability registry -------------------------------------------------

test('availability: only primary readable today', () => {
  assert.equal(isBackendAvailable('primary'), true);
  assert.equal(isBackendAvailable('replica'), false);
  assert.equal(isBackendAvailable('d1'), false);
  assert.equal(isBackendAvailable('cache'), false);
});
test('availabilityFromHealth: marks primary down only when health is "down"', () => {
  assert.equal(availabilityFromHealth('healthy').primary.available, true);
  assert.equal(availabilityFromHealth('unknown').primary.available, true);
  assert.equal(availabilityFromHealth('down').primary.available, false);
});
