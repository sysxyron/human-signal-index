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
} from '../src/warning';
import { FIXTURE_NOW } from '../src/fixtures';

const NOW = FIXTURE_NOW;

test('levelForSeverity boundary values', () => {
  assert.equal(levelForSeverity(0.75), 'CRITICAL');
  assert.equal(levelForSeverity(0.749), 'WARNING');
  assert.equal(levelForSeverity(0.5), 'WARNING');
  assert.equal(levelForSeverity(0.499), 'WATCH');
  assert.equal(levelForSeverity(0.25), 'WATCH');
  assert.equal(levelForSeverity(0.249), 'INFO');
  assert.equal(levelForSeverity(0), 'INFO');
});

test('levelForSeverity clamps out-of-range', () => {
  assert.equal(levelForSeverity(2), 'CRITICAL');
  assert.equal(levelForSeverity(-1), 'INFO');
});

test('emerging pattern severity rises with more signals', () => {
  const two = detectEmergingPatterns({ id: 'w', signals: [{ label: 'a', strength: 0.7, rising: true }, { label: 'b', strength: 0.7, rising: true }] }, { now: NOW });
  const five = detectEmergingPatterns({ id: 'w', signals: Array.from({ length: 5 }, (_, i) => ({ label: `s${i}`, strength: 0.9, rising: true })) }, { now: NOW });
  const rank = { INFO: 0, WATCH: 1, WARNING: 2, CRITICAL: 3 } as const;
  assert.ok(rank[five!.level] >= rank[two!.level]);
});

test('non-rising strong signals do not emerge', () => {
  assert.equal(detectEmergingPatterns({ id: 'w', signals: [{ label: 'a', strength: 0.9, rising: false }, { label: 'b', strength: 0.9, rising: false }] }, { now: NOW }), null);
});

test('acceleration fires only on increasing slope', () => {
  assert.ok(detectSignalAcceleration({ id: 'w', label: 'v', series: [1, 2, 4, 8, 16] }, { now: NOW }));
  // Constant-slope linear decline → no acceleration.
  assert.equal(detectSignalAcceleration({ id: 'w', label: 'v', series: [20, 15, 10, 5] }, { now: NOW }), null);
});

test('trust collapse threshold respected', () => {
  assert.equal(detectTrustCollapse({ id: 'w', trustSeries: [70, 60], dropThreshold: 15 }, { now: NOW }), null);
  assert.ok(detectTrustCollapse({ id: 'w', trustSeries: [70, 50], dropThreshold: 15 }, { now: NOW }));
});

test('trust collapse custom threshold', () => {
  assert.ok(detectTrustCollapse({ id: 'w', trustSeries: [70, 60], dropThreshold: 5 }, { now: NOW }));
});

test('narrative shift threshold respected', () => {
  assert.equal(detectNarrativeShift({ id: 'w', before: [0.5, 0.5], after: [0.55, 0.45], shiftThreshold: 0.2 }, { now: NOW }), null);
  assert.ok(detectNarrativeShift({ id: 'w', before: [0.8, 0.2], after: [0.3, 0.7], shiftThreshold: 0.2 }, { now: NOW }));
});

test('narrative shift handles unequal lengths', () => {
  const w = detectNarrativeShift({ id: 'w', before: [0.6, 0.4], after: [0.1, 0.9, 0.0], shiftThreshold: 0.2 }, { now: NOW });
  assert.ok(w);
});

test('consensus instability needs >=3 points', () => {
  assert.equal(detectConsensusInstability({ id: 'w', agreementSeries: [0.5, 0.9] }, { now: NOW }), null);
});

test('consensus instability fires on big swings', () => {
  assert.ok(detectConsensusInstability({ id: 'w', agreementSeries: [0.2, 0.9, 0.2, 0.9] }, { now: NOW }));
});

test('forecast risk on gap', () => {
  assert.ok(detectForecastRisk({ id: 'w', confidence: 0.95, reliability: 0.4 }, { now: NOW }));
  assert.equal(detectForecastRisk({ id: 'w', confidence: 0.6, reliability: 0.55 }, { now: NOW }), null);
});

test('forecast risk on weakening signals even with small gap', () => {
  assert.ok(detectForecastRisk({ id: 'w', confidence: 0.6, reliability: 0.55, signalWeakening: true }, { now: NOW }));
});

test('every detector returns evidence + recommendation when firing', () => {
  const firing = [
    detectEmergingPatterns({ id: 'a', signals: [{ label: 'x', strength: 0.8, rising: true }, { label: 'y', strength: 0.8, rising: true }] }, { now: NOW }),
    detectSignalAcceleration({ id: 'b', label: 'v', series: [1, 2, 4, 8] }, { now: NOW }),
    detectTrustCollapse({ id: 'c', trustSeries: [80, 40] }, { now: NOW }),
    detectNarrativeShift({ id: 'd', before: [0.8, 0.2], after: [0.2, 0.8] }, { now: NOW }),
    detectConsensusInstability({ id: 'e', agreementSeries: [0.2, 0.9, 0.3, 0.85] }, { now: NOW }),
    detectForecastRisk({ id: 'f', confidence: 0.9, reliability: 0.4 }, { now: NOW }),
  ].filter((w) => w !== null);
  assert.equal(firing.length, 6);
  for (const w of firing) {
    assert.ok(w!.evidence.length > 0);
    assert.ok(/advisory|review|monitor|consider|investigate|hold|route/i.test(w!.recommendation));
    assert.ok(w!.entityId);
  }
});

test('detectors carry the correct kind', () => {
  assert.equal(detectTrustCollapse({ id: 'c', trustSeries: [80, 40] }, { now: NOW })?.kind, 'trust_collapse');
  assert.equal(detectForecastRisk({ id: 'f', confidence: 0.9, reliability: 0.4 }, { now: NOW })?.kind, 'forecast_risk');
});

test('detectors deterministic', () => {
  assert.deepEqual(detectTrustCollapse({ id: 'c', trustSeries: [80, 35] }, { now: NOW }), detectTrustCollapse({ id: 'c', trustSeries: [80, 35] }, { now: NOW }));
});

test('detectedAt uses injected now', () => {
  const w = detectTrustCollapse({ id: 'c', trustSeries: [80, 40] }, { now: '2030-01-01T00:00:00.000Z' });
  assert.equal(w?.detectedAt, '2030-01-01T00:00:00.000Z');
});

test('emerging pattern requires strength >= 0.6', () => {
  assert.equal(detectEmergingPatterns({ id: 'w', signals: [{ label: 'a', strength: 0.5, rising: true }, { label: 'b', strength: 0.59, rising: true }] }, { now: NOW }), null);
});
