import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dbStatusFrom, edgeConfigStatusFromSource, combineRuntimeStatus, DEGRADED_LATENCY_MS } from './health';

// ---- db status classification ----------------------------------------------

test('dbStatusFrom: failed probe → down', () => {
  assert.equal(dbStatusFrom(false, 10), 'down');
  assert.equal(dbStatusFrom(false, 9999), 'down');
});
test('dbStatusFrom: fast success → healthy; slow success → degraded', () => {
  assert.equal(dbStatusFrom(true, 50), 'healthy');
  assert.equal(dbStatusFrom(true, DEGRADED_LATENCY_MS), 'healthy');       // at threshold
  assert.equal(dbStatusFrom(true, DEGRADED_LATENCY_MS + 1), 'degraded');  // over threshold
  assert.equal(dbStatusFrom(true, 50, 10), 'degraded');                   // custom threshold
});

// ---- edge config status ----------------------------------------------------

test('edgeConfigStatusFromSource: maps source → status', () => {
  assert.equal(edgeConfigStatusFromSource('edge-config'), 'healthy');
  assert.equal(edgeConfigStatusFromSource('error-fallback'), 'degraded');
  assert.equal(edgeConfigStatusFromSource('defaults'), 'unknown');
  assert.equal(edgeConfigStatusFromSource('something-else'), 'unknown');
});

// ---- combined runtime status -----------------------------------------------

test('combineRuntimeStatus: DB down dominates everything', () => {
  assert.equal(combineRuntimeStatus('normal', 'down', 'healthy'), 'down');
  assert.equal(combineRuntimeStatus('maintenance', 'down', 'degraded'), 'down');
});
test('combineRuntimeStatus: maintenance / protected / degraded inputs → degraded', () => {
  assert.equal(combineRuntimeStatus('maintenance', 'healthy', 'healthy'), 'degraded');
  assert.equal(combineRuntimeStatus('protected_read', 'healthy', 'healthy'), 'degraded');
  assert.equal(combineRuntimeStatus('normal', 'degraded', 'healthy'), 'degraded');
  assert.equal(combineRuntimeStatus('normal', 'healthy', 'degraded'), 'degraded');
});
test('combineRuntimeStatus: unknown DB (and nothing worse) → unknown', () => {
  assert.equal(combineRuntimeStatus('normal', 'unknown', 'unknown'), 'unknown');
});
test('combineRuntimeStatus: all healthy + normal → healthy', () => {
  assert.equal(combineRuntimeStatus('normal', 'healthy', 'healthy'), 'healthy');
});
