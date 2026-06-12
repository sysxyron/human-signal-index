import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  detectConsensusInstability,
  detectEmergingPatterns,
  detectForecastRisk,
  detectNarrativeShift,
  detectSignalAcceleration,
  detectTrustCollapse,
  levelForSeverity,
  orderWarnings,
} from '../src/warning';
import { FIXTURE_NOW, scenarioDemo } from '../src/fixtures';
import type { EarlyWarning } from '../src/types';

const NOW = FIXTURE_NOW;

test('levelForSeverity buckets', () => {
  assert.equal(levelForSeverity(0.9), 'CRITICAL');
  assert.equal(levelForSeverity(0.6), 'WARNING');
  assert.equal(levelForSeverity(0.3), 'WATCH');
  assert.equal(levelForSeverity(0.1), 'INFO');
});

// ---- emerging patterns ------------------------------------------------------
test('emerging pattern fires on co-occurring strong rising signals', () => {
  const w = detectEmergingPatterns({ id: 'w', signals: [{ label: 'a', strength: 0.8, rising: true }, { label: 'b', strength: 0.7, rising: true }] }, { now: NOW });
  assert.ok(w);
  assert.equal(w?.kind, 'emerging_pattern');
});

test('emerging pattern: single rising signal → null', () => {
  assert.equal(detectEmergingPatterns({ id: 'w', signals: [{ label: 'a', strength: 0.9, rising: true }] }, { now: NOW }), null);
});

test('emerging pattern: weak signals → null', () => {
  assert.equal(detectEmergingPatterns({ id: 'w', signals: [{ label: 'a', strength: 0.2, rising: true }, { label: 'b', strength: 0.3, rising: true }] }, { now: NOW }), null);
});

// ---- signal acceleration ----------------------------------------------------
test('signal acceleration fires when slope increases', () => {
  const w = detectSignalAcceleration({ id: 'w', label: 'v', series: [10, 12, 16, 24, 40] }, { now: NOW });
  assert.ok(w);
  assert.equal(w?.kind, 'signal_acceleration');
});

test('signal acceleration: steady (constant slope) → null', () => {
  assert.equal(detectSignalAcceleration({ id: 'w', label: 'v', series: [50, 40, 30, 20, 10] }, { now: NOW }), null);
});

test('signal acceleration: too few points → null', () => {
  assert.equal(detectSignalAcceleration({ id: 'w', label: 'v', series: [1, 2] }, { now: NOW }), null);
});

// ---- trust collapse ---------------------------------------------------------
test('trust collapse fires on a sharp drop', () => {
  const w = detectTrustCollapse({ id: 'w', trustSeries: [80, 70, 50, 35] }, { now: NOW });
  assert.ok(w);
  assert.equal(w?.kind, 'trust_collapse');
});

test('trust collapse: small drop → null', () => {
  assert.equal(detectTrustCollapse({ id: 'w', trustSeries: [70, 68, 66, 65] }, { now: NOW }), null);
});

test('trust collapse severity scales with drop', () => {
  const small = detectTrustCollapse({ id: 'w', trustSeries: [70, 50] }, { now: NOW });
  const big = detectTrustCollapse({ id: 'w', trustSeries: [90, 30] }, { now: NOW });
  const rank = { INFO: 0, WATCH: 1, WARNING: 2, CRITICAL: 3 } as const;
  assert.ok(rank[big!.level] >= rank[small!.level]);
});

// ---- narrative shift --------------------------------------------------------
test('narrative shift fires on a large composition change', () => {
  const w = detectNarrativeShift({ id: 'w', before: [0.6, 0.3, 0.1], after: [0.2, 0.3, 0.5] }, { now: NOW });
  assert.ok(w);
  assert.equal(w?.kind, 'narrative_shift');
});

test('narrative shift: stable composition → null', () => {
  assert.equal(detectNarrativeShift({ id: 'w', before: [0.5, 0.3, 0.2], after: [0.52, 0.29, 0.19] }, { now: NOW }), null);
});

// ---- consensus instability --------------------------------------------------
test('consensus instability fires on swings', () => {
  const w = detectConsensusInstability({ id: 'w', agreementSeries: [0.7, 0.3, 0.8, 0.35, 0.85] }, { now: NOW });
  assert.ok(w);
  assert.equal(w?.kind, 'consensus_instability');
});

test('consensus instability: stable → null', () => {
  assert.equal(detectConsensusInstability({ id: 'w', agreementSeries: [0.7, 0.71, 0.7, 0.72] }, { now: NOW }), null);
});

// ---- forecast risk ----------------------------------------------------------
test('forecast risk fires on confidence/reliability gap', () => {
  const w = detectForecastRisk({ id: 'w', confidence: 0.9, reliability: 0.5 }, { now: NOW });
  assert.ok(w);
  assert.equal(w?.kind, 'forecast_risk');
});

test('forecast risk fires on weakening signals', () => {
  const w = detectForecastRisk({ id: 'w', confidence: 0.7, reliability: 0.65, signalWeakening: true }, { now: NOW });
  assert.ok(w);
});

test('forecast risk: aligned + stable → null', () => {
  assert.equal(detectForecastRisk({ id: 'w', confidence: 0.7, reliability: 0.65 }, { now: NOW }), null);
});

// ---- ordering + shape -------------------------------------------------------
test('all warnings carry evidence + a recommendation', () => {
  const out = scenarioDemo();
  for (const w of out.warnings) {
    assert.ok(w.evidence.length > 0);
    assert.ok(w.recommendation.length > 0);
    assert.ok(['INFO', 'WATCH', 'WARNING', 'CRITICAL'].includes(w.level));
  }
});

test('recommendations are advisory (never auto-act)', () => {
  const out = scenarioDemo();
  assert.ok(out.warnings.every((w) => /advisory|review|monitor|consider/i.test(w.recommendation)));
});

test('orderWarnings ranks CRITICAL first', () => {
  const warnings: EarlyWarning[] = [
    { id: 'a', kind: 'forecast_risk', level: 'INFO', title: 't', signal: 's', evidence: [], recommendation: 'r', detectedAt: NOW },
    { id: 'b', kind: 'trust_collapse', level: 'CRITICAL', title: 't', signal: 's', evidence: [], recommendation: 'r', detectedAt: NOW },
    { id: 'c', kind: 'narrative_shift', level: 'WARNING', title: 't', signal: 's', evidence: [], recommendation: 'r', detectedAt: NOW },
  ];
  assert.deepEqual(orderWarnings(warnings).map((w) => w.level), ['CRITICAL', 'WARNING', 'INFO']);
});

test('deterministic detection', () => {
  assert.deepEqual(
    detectTrustCollapse({ id: 'w', trustSeries: [80, 40] }, { now: NOW }),
    detectTrustCollapse({ id: 'w', trustSeries: [80, 40] }, { now: NOW }),
  );
});
