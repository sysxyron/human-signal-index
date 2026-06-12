import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildUnifiedSystemState, summarizeSystemState } from '../src/unified';
import { DEMO_INPUTS, FIXTURE_NOW } from '../src/fixtures';
import type { UnifiedInputs } from '../src/types';

const NOW = FIXTURE_NOW;

test('empty inputs build a complete state', () => {
  const s = buildUnifiedSystemState({}, { now: NOW });
  assert.deepEqual(s.investigations, []);
  assert.deepEqual(s.consensus, []);
  assert.deepEqual(s.forecasts, []);
  assert.deepEqual(s.warnings, []);
  assert.deepEqual(s.trust, []);
  assert.deepEqual(s.opportunities, []);
  assert.deepEqual(s.scenarios, []);
  assert.deepEqual(s.governanceQueue, []);
  assert.equal(s.operations.overallHealth, 'HEALTHY');
  assert.equal(s.publishing.published, 0);
  assert.equal(s.generatedAt, NOW);
});

test('clamps probabilities into [0,1]', () => {
  const inputs: UnifiedInputs = {
    consensus: [{ investigationId: 'i', agreement: 2, confidence: -1, disputed: true }],
    forecasts: [{ id: 'f', prediction: 'p', confidence: 5, reliability: -3, status: 'active' }],
  };
  const s = buildUnifiedSystemState(inputs, { now: NOW });
  assert.equal(s.consensus[0].agreement, 1);
  assert.equal(s.consensus[0].confidence, 0);
  assert.equal(s.forecasts[0].confidence, 1);
  assert.equal(s.forecasts[0].reliability, 0);
});

test('clamps trust into [0,100]', () => {
  const s = buildUnifiedSystemState({ trust: [{ entityType: 'source', entityId: 'x', score: 250, band: 'high' }] }, { now: NOW });
  assert.equal(s.trust[0].score, 100);
});

test('floors negative counts', () => {
  const s = buildUnifiedSystemState({
    investigations: [{ id: 'i', title: 't', state: 'ACTIVE', contributorCount: -4 }],
    operations: { activeRuns: -1, queueDepth: -2, openEscalations: -3, overallHealth: 'DOWN' },
  }, { now: NOW });
  assert.equal(s.investigations[0].contributorCount, 0);
  assert.equal(s.operations.activeRuns, 0);
  assert.equal(s.operations.queueDepth, 0);
  assert.equal(s.operations.openEscalations, 0);
  assert.equal(s.operations.overallHealth, 'DOWN');
});

test('disputed defaults to false unless explicitly true', () => {
  const s = buildUnifiedSystemState({ consensus: [{ investigationId: 'i', agreement: 0.5, confidence: 0.5, disputed: undefined as unknown as boolean }] }, { now: NOW });
  assert.equal(s.consensus[0].disputed, false);
});

test('deterministic build', () => {
  assert.deepEqual(buildUnifiedSystemState(DEMO_INPUTS, { now: NOW }), buildUnifiedSystemState(DEMO_INPUTS, { now: NOW }));
});

test('summarize counts active investigations', () => {
  const s = buildUnifiedSystemState(DEMO_INPUTS, { now: NOW });
  const sum = summarizeSystemState(s);
  assert.equal(sum.activeInvestigations, 2);
});

test('summarize counts disputed consensus', () => {
  const sum = summarizeSystemState(buildUnifiedSystemState(DEMO_INPUTS, { now: NOW }));
  assert.equal(sum.disputedConsensus, 1);
});

test('summarize counts critical warnings', () => {
  const sum = summarizeSystemState(buildUnifiedSystemState(DEMO_INPUTS, { now: NOW }));
  assert.equal(sum.criticalWarnings, 1);
  assert.equal(sum.totalWarnings, 3);
});

test('summarize counts failing forecasts', () => {
  const sum = summarizeSystemState(buildUnifiedSystemState(DEMO_INPUTS, { now: NOW }));
  assert.equal(sum.failingForecasts, 1);
});

test('summary mentions advisory + health', () => {
  const sum = summarizeSystemState(buildUnifiedSystemState(DEMO_INPUTS, { now: NOW }));
  assert.match(sum.summary, /advisory/i);
  assert.match(sum.summary, /DEGRADED/);
});

test('avgTrust averages trust scores', () => {
  const sum = summarizeSystemState(buildUnifiedSystemState(DEMO_INPUTS, { now: NOW }));
  // (28 + 64 + 73) / 3 = 55
  assert.ok(Math.abs(sum.avgTrust - 55) < 0.5);
});

test('empty state summary has zero counts', () => {
  const sum = summarizeSystemState(buildUnifiedSystemState({}, { now: NOW }));
  assert.equal(sum.activeInvestigations, 0);
  assert.equal(sum.avgForecastConfidence, 0);
  assert.equal(sum.avgTrust, 0);
});
