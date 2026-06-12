import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ENGINE_NAMES,
  computeEngineHealth,
  overallStatus,
  platformHealth,
} from '../src/health';
import { DEMO_HEALTH_INPUTS } from '../src/fixtures';

test('ten engines monitored', () => {
  assert.equal(ENGINE_NAMES.length, 10);
  assert.ok(ENGINE_NAMES.includes('governance'));
});

test('idle engine is HEALTHY', () => {
  const h = computeEngineHealth({ engine: 'research' });
  assert.equal(h.status, 'HEALTHY');
  assert.equal(h.successRate, 1);
  assert.match(h.detail, /Idle/);
});

test('low failure rate stays HEALTHY', () => {
  const h = computeEngineHealth({ engine: 'research', runs: 100, failures: 5, queueDepth: 2 });
  assert.equal(h.status, 'HEALTHY');
});

test('moderate failure rate is DEGRADED', () => {
  const h = computeEngineHealth({ engine: 'research', runs: 10, failures: 3 });
  assert.equal(h.status, 'DEGRADED');
});

test('high failure rate is DOWN', () => {
  const h = computeEngineHealth({ engine: 'research', runs: 10, failures: 6 });
  assert.equal(h.status, 'DOWN');
});

test('deep queue degrades', () => {
  const h = computeEngineHealth({ engine: 'research', runs: 10, failures: 0, queueDepth: 30 });
  assert.equal(h.status, 'DEGRADED');
});

test('very deep queue is DOWN', () => {
  const h = computeEngineHealth({ engine: 'research', runs: 10, failures: 0, queueDepth: 150 });
  assert.equal(h.status, 'DOWN');
});

test('failures clamped to runs', () => {
  const h = computeEngineHealth({ engine: 'research', runs: 5, failures: 99 });
  assert.equal(h.failureRate, 1);
  assert.equal(h.successRate, 0);
});

test('success + failure rate sum to 1 when runs > 0', () => {
  const h = computeEngineHealth({ engine: 'research', runs: 8, failures: 2 });
  assert.ok(Math.abs(h.successRate + h.failureRate - 1) < 1e-9);
});

test('platformHealth returns all ten engines', () => {
  const health = platformHealth([]);
  assert.equal(health.length, 10);
  assert.deepEqual(health.map((h) => h.engine).sort(), [...ENGINE_NAMES].sort());
});

test('platformHealth fills missing engines as idle HEALTHY', () => {
  const health = platformHealth([{ engine: 'trust', runs: 10, failures: 6 }]);
  const trust = health.find((h) => h.engine === 'trust');
  const evidence = health.find((h) => h.engine === 'evidence');
  assert.equal(trust?.status, 'DOWN');
  assert.equal(evidence?.status, 'HEALTHY');
});

test('overallStatus is worst-of', () => {
  assert.equal(overallStatus(platformHealth(DEMO_HEALTH_INPUTS)), 'DOWN');
  assert.equal(overallStatus(platformHealth([{ engine: 'research', runs: 10, failures: 0 }])), 'HEALTHY');
});

test('lastRun carried through', () => {
  const h = computeEngineHealth({ engine: 'trust', lastRun: '2026-06-09T12:00:00.000Z' });
  assert.equal(h.lastRun, '2026-06-09T12:00:00.000Z');
});

test('deterministic health', () => {
  assert.deepEqual(platformHealth(DEMO_HEALTH_INPUTS), platformHealth(DEMO_HEALTH_INPUTS));
});
