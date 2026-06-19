import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateSourceHealth, detectSourceFailure, detectSourceRecovery, detectStaleSource,
  detectCollectionGap, detectReliabilityRegression, generateMonitoringAlerts,
} from './classify';
import {
  stalePolicy, severityForStale, severityForRegression, severityForFailure, reliabilityTrend,
} from './policy';
import type { SourceSignal, PriorState } from './types';

const NOW = '2026-06-18T00:00:00Z';

function sig(over: Partial<SourceSignal> = {}): SourceSignal {
  return {
    id: over.id ?? 's1', name: over.name ?? 'Test Source', type: over.type ?? 'Website',
    status: over.status ?? 'HEALTHY', score: over.score ?? 96, tier: over.tier ?? 'Excellent',
    failureType: over.failureType ?? 'Healthy', protection: over.protection ?? null,
    events: over.events ?? 20, successPct: over.successPct ?? 100, consecutiveFailures: over.consecutiveFailures ?? 0,
    lastSuccessIso: over.lastSuccessIso ?? NOW, lastSuccessAgeDays: over.lastSuccessAgeDays ?? 0, signals: over.signals ?? 50,
  };
}
function prior(state: PriorState['state'], score: number | null = null): PriorState {
  return { state, score, lastSuccessAt: null, lastFailureAt: null, updatedAt: null };
}

// ---- policy ----------------------------------------------------------------

test('stale policy windows by type', () => {
  assert.equal(stalePolicy('RSS').days, 1);
  assert.equal(stalePolicy('Website').days, 2);
  assert.equal(stalePolicy('Government').days, 3);
  assert.equal(stalePolicy('Research').days, 7);
  assert.equal(stalePolicy('Podcast').days, 14);
});

// ---- classification (Deliverable 2) ----------------------------------------

test('classify: HEALTHY when status healthy + recent', () => {
  const c = evaluateSourceHealth(sig(), null, NOW);
  assert.equal(c.state, 'HEALTHY');
  assert.ok(c.reason.includes('Healthy'));
});

test('classify: RECOVERED when healthy now but prior was bad', () => {
  const c = evaluateSourceHealth(sig(), prior('FAILED', 30), NOW);
  assert.equal(c.state, 'RECOVERED');
});

test('classify: FAILED / BLOCKED / UNREACHABLE / STALE / DEGRADED', () => {
  assert.equal(evaluateSourceHealth(sig({ status: 'FAILED', score: 30, tier: 'Failing', failureType: 'Access Denied' }), null, NOW).state, 'FAILED');
  assert.equal(evaluateSourceHealth(sig({ status: 'FAILED', score: 0, tier: 'Failing', protection: 'Cloudflare', failureType: 'Cloudflare Protected' }), null, NOW).state, 'BLOCKED');
  assert.equal(evaluateSourceHealth(sig({ status: 'FAILED', score: 10, tier: 'Failing', failureType: 'Timeout', consecutiveFailures: 3 }), null, NOW).state, 'UNREACHABLE');
  assert.equal(evaluateSourceHealth(sig({ type: 'RSS', status: 'HEALTHY', lastSuccessAgeDays: 4 }), null, NOW).state, 'STALE');
  assert.equal(evaluateSourceHealth(sig({ status: 'WARNING', score: 70, tier: 'At Risk', failureType: 'Rate Limited' }), prior('HEALTHY', 96), NOW).state, 'DEGRADED');
});

test('classify: stale stores days + policy in evidence/reason', () => {
  const c = evaluateSourceHealth(sig({ type: 'RSS', status: 'HEALTHY', lastSuccessAgeDays: 5 }), null, NOW);
  assert.equal(c.state, 'STALE');
  assert.equal(c.evidence.policyDays, 1);
  assert.ok(c.reason.includes('5d'));
});

// ---- detectors (edge-triggered) --------------------------------------------

test('detectSourceFailure fires on transition, not on a steady failure', () => {
  const failing = sig({ status: 'FAILED', score: 20, tier: 'Failing', failureType: 'Offline' });
  assert.ok(detectSourceFailure(failing, null, NOW));               // new failure
  assert.ok(detectSourceFailure(failing, prior('HEALTHY', 90), NOW)); // healthy → failed
  assert.equal(detectSourceFailure(failing, prior('FAILED', 20), NOW), null); // already failed
});

test('detectSourceFailure distinguishes BLOCKED', () => {
  const blocked = sig({ status: 'FAILED', score: 0, tier: 'Failing', protection: 'Akamai', failureType: 'Cloudflare Protected' });
  const a = detectSourceFailure(blocked, prior('HEALTHY', 90), NOW);
  assert.equal(a?.kind, 'SOURCE_BLOCKED');
});

test('detectSourceRecovery fires only on bad → healthy', () => {
  assert.ok(detectSourceRecovery(sig(), prior('FAILED', 20), NOW));
  assert.equal(detectSourceRecovery(sig(), prior('HEALTHY', 95), NOW), null);
});

test('detectStaleSource fires on new staleness', () => {
  const stale = sig({ type: 'RSS', status: 'HEALTHY', lastSuccessAgeDays: 3 });
  assert.ok(detectStaleSource(stale, null, NOW));
  assert.equal(detectStaleSource(stale, prior('STALE', 80), NOW), null); // already stale
});

test('detectCollectionGap fires for a previously-active source going silent', () => {
  assert.ok(detectCollectionGap(sig({ events: 0 }), prior('HEALTHY', 88), NOW));
  assert.equal(detectCollectionGap(sig({ events: 0 }), null, NOW), null);   // no prior → not a gap
  assert.equal(detectCollectionGap(sig({ events: 5 }), prior('HEALTHY', 88), NOW), null); // still fetching
});

test('detectReliabilityRegression fires on band drop with computed kind', () => {
  const oneBand = detectReliabilityRegression(sig({ score: 88, tier: 'Healthy' }), prior('HEALTHY', 97), NOW);
  assert.equal(oneBand?.kind, 'SOURCE_DEGRADED');
  const bigDrop = detectReliabilityRegression(sig({ status: 'FAILED', score: 40, tier: 'Failing' }), prior('HEALTHY', 97), NOW);
  assert.equal(bigDrop?.kind, 'RELIABILITY_DROP');
  assert.equal(detectReliabilityRegression(sig({ score: 96 }), prior('HEALTHY', 95), NOW), null); // no drop
});

// ---- orchestration ---------------------------------------------------------

test('generateMonitoringAlerts: one alert per source, by precedence', () => {
  const signals = [
    sig({ id: 'a', status: 'FAILED', score: 20, tier: 'Failing', failureType: 'Offline' }),  // new failure
    sig({ id: 'b' }),                                                                          // healthy, no prior bad → none
    sig({ id: 'c' }),                                                                          // recovered
    sig({ id: 'd', status: 'FAILED', score: 20, tier: 'Failing', failureType: 'Offline' }),   // already failed → none
  ];
  const priors = new Map<string, PriorState>([
    ['c', prior('FAILED', 20)],
    ['d', prior('FAILED', 20)],
  ]);
  const alerts = generateMonitoringAlerts(signals, priors, NOW);
  const byId = Object.fromEntries(alerts.map((x) => [x.sourceId, x]));
  assert.equal(alerts.length, 2);
  assert.equal(byId.a.kind, 'SOURCE_FAILED');
  assert.equal(byId.c.kind, 'SOURCE_RECOVERED');
  assert.ok(!byId.b);
  assert.ok(!byId.d);
});

// ---- computed severities ---------------------------------------------------

test('severities are computed from ratios / bands (no magic single threshold)', () => {
  assert.equal(severityForStale(2, 1), 'WARNING');   // 2x policy
  assert.equal(severityForStale(5, 1), 'CRITICAL');  // 5x policy
  assert.equal(severityForStale(1, 1), 'NOTICE');    // at policy edge
  assert.equal(severityForRegression(1), 'NOTICE');
  assert.equal(severityForRegression(2), 'WARNING');
  assert.equal(severityForRegression(3), 'CRITICAL');
  assert.equal(severityForFailure({ score: 0, consecutiveFailures: 0 }), 'CRITICAL');
  assert.equal(severityForFailure({ score: 40, consecutiveFailures: 1 }), 'WARNING');
});

// ---- reliability trend (Deliverable 6) -------------------------------------

test('reliabilityTrend: insufficient / stable / improving / declining', () => {
  assert.equal(reliabilityTrend([]).trend, 'Insufficient Data');
  assert.equal(reliabilityTrend([90]).trend, 'Insufficient Data');
  assert.equal(reliabilityTrend([90, 91, 89]).trend, 'Stable');
  assert.equal(reliabilityTrend([40, 55, 80]).trend, 'Improving');
  assert.equal(reliabilityTrend([95, 70, 40]).trend, 'Declining');
});
