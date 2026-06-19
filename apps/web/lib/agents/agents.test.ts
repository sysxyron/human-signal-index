import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  AGENT_KEYS, SCHEDULE_CADENCES, isAgentKey, isScheduleCadence,
  cadenceMs, nextRunAt, isDue, successRate, rollupSeverity, alertableFindings,
  type Finding,
} from './types';
import { AGENT_REGISTRY, getAgentDefinition } from './registry';

// ---- registry --------------------------------------------------------------

test('9 agents registered, all keys valid + defined', () => {
  assert.equal(AGENT_KEYS.length, 9);
  assert.equal(AGENT_REGISTRY.length, 9);
  assert.ok(getAgentDefinition('FORECAST_VALIDATION_AGENT'));
  for (const def of AGENT_REGISTRY) {
    assert.ok(isAgentKey(def.key), def.key);
    assert.equal(getAgentDefinition(def.key)?.key, def.key);
    assert.ok(def.consumes.length > 0);
  }
  for (const k of ['SOURCE_HEALTH_AGENT', 'NARRATIVE_WATCH_AGENT', 'GRAPH_ANALYST_AGENT', 'REVIEW_QUEUE_AGENT', 'PUBLICATION_MONITOR_AGENT', 'TRUST_ANOMALY_AGENT', 'EXECUTIVE_BRIEF_AGENT', 'FORECAST_PREP_AGENT'] as const) {
    assert.ok(getAgentDefinition(k), k);
  }
  assert.equal(getAgentDefinition('NOPE'), undefined);
});

test('cadence validity', () => {
  assert.equal(SCHEDULE_CADENCES.length, 5);
  assert.ok(isScheduleCadence('daily'));
  assert.ok(!isScheduleCadence('yearly'));
});

// ---- scheduling math (deterministic) ---------------------------------------

test('cadenceMs: intervals + null for manual/disabled', () => {
  assert.equal(cadenceMs('hourly'), 3_600_000);
  assert.equal(cadenceMs('daily'), 86_400_000);
  assert.equal(cadenceMs('weekly'), 7 * 86_400_000);
  assert.equal(cadenceMs('manual'), null);
  assert.equal(cadenceMs('disabled'), null);
});

test('nextRunAt advances by cadence; null for manual/disabled', () => {
  const from = '2026-06-18T00:00:00.000Z';
  assert.equal(nextRunAt('daily', from), '2026-06-19T00:00:00.000Z');
  assert.equal(nextRunAt('hourly', from), '2026-06-18T01:00:00.000Z');
  assert.equal(nextRunAt('manual', from), null);
  assert.equal(nextRunAt('disabled', from), null);
});

test('isDue: manual/disabled never; daily due when stale or never-run', () => {
  const now = '2026-06-18T12:00:00.000Z';
  assert.equal(isDue('manual', null, now), false);
  assert.equal(isDue('disabled', null, now), false);
  assert.equal(isDue('daily', null, now), true);                          // never run
  assert.equal(isDue('daily', '2026-06-18T11:00:00.000Z', now), false);   // ran 1h ago
  assert.equal(isDue('daily', '2026-06-16T11:00:00.000Z', now), true);    // ran 2d ago
  assert.equal(isDue('hourly', '2026-06-18T11:00:00.000Z', now), true);   // ran 1h ago (≥1h)
});

test('successRate', () => {
  assert.equal(successRate(8, 10), 80);
  assert.equal(successRate(0, 0), 0);
});

// ---- finding rollups -------------------------------------------------------

function fnd(severity: Finding['severity'], category = 'x'): Finding {
  return { finding: 'f', severity, category, evidence: {}, source: 's' };
}

test('rollupSeverity returns the highest, null when empty', () => {
  assert.equal(rollupSeverity([]), null);
  assert.equal(rollupSeverity([fnd('INFO'), fnd('WARNING'), fnd('NOTICE')]), 'WARNING');
  assert.equal(rollupSeverity([fnd('INFO'), fnd('CRITICAL')]), 'CRITICAL');
});

test('alertableFindings keeps only WARNING + CRITICAL', () => {
  const out = alertableFindings([fnd('INFO'), fnd('NOTICE'), fnd('WARNING'), fnd('CRITICAL')]);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((f) => f.severity), ['WARNING', 'CRITICAL']);
});
