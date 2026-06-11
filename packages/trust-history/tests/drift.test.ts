import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  COLLAPSE_DROP,
  DEGRADE_DROP,
  INSTABILITY_VOL,
  MISCAL_GAP,
  detectTrustDrift,
} from '../src/drift';
import {
  COLLAPSING,
  DEGRADING,
  IMPROVING,
  OVERCONFIDENT,
  STABLE,
  UNDERCONFIDENT,
  VOLATILE,
  FIXTURE_NOW,
  seriesFromScores,
} from '../src/fixtures';

const NOW = FIXTURE_NOW;

test('collapsing series detected as collapse', () => {
  assert.equal(detectTrustDrift(COLLAPSING, { now: NOW }).kind, 'collapse');
});

test('collapse is high or critical severity', () => {
  const e = detectTrustDrift(COLLAPSING, { now: NOW });
  assert.ok(['HIGH', 'CRITICAL'].includes(e.severity));
});

test('degrading series detected as degradation', () => {
  assert.equal(detectTrustDrift(DEGRADING, { now: NOW }).kind, 'degradation');
});

test('volatile series detected as instability', () => {
  // VOLATILE has no big net drop but large step swings.
  assert.equal(detectTrustDrift(VOLATILE, { now: NOW }).kind, 'instability');
});

test('overconfident series detected as overconfidence', () => {
  assert.equal(detectTrustDrift(OVERCONFIDENT, { now: NOW }).kind, 'overconfidence');
});

test('underconfident series detected as underconfidence', () => {
  assert.equal(detectTrustDrift(UNDERCONFIDENT, { now: NOW }).kind, 'underconfidence');
});

test('stable series detected as stable', () => {
  assert.equal(detectTrustDrift(STABLE, { now: NOW }).kind, 'stable');
});

test('improving series is not flagged as drift', () => {
  assert.equal(detectTrustDrift(IMPROVING, { now: NOW }).kind, 'stable');
});

test('stable severity is low', () => {
  assert.equal(detectTrustDrift(STABLE, { now: NOW }).severity, 'LOW');
});

test('drift carries entity identity from the latest snapshot', () => {
  const e = detectTrustDrift(DEGRADING, { now: NOW });
  assert.equal(e.entityType, 'decision');
  assert.equal(e.entityId, 'dec-degrading');
});

test('drift uses injected now as detectedAt', () => {
  assert.equal(detectTrustDrift(DEGRADING, { now: NOW }).detectedAt, NOW);
});

test('drift evidence is always populated', () => {
  assert.ok(detectTrustDrift(DEGRADING, { now: NOW }).evidence.length > 0);
});

test('drift recommendation is advisory (never auto-applies)', () => {
  const e = detectTrustDrift(COLLAPSING, { now: NOW });
  assert.match(e.recommendation, /review|recalibration|Do NOT|monitor/i);
});

test('magnitude in [0,1]', () => {
  for (const series of [COLLAPSING, DEGRADING, VOLATILE, OVERCONFIDENT]) {
    const e = detectTrustDrift(series, { now: NOW });
    assert.ok(e.magnitude >= 0 && e.magnitude <= 1);
  }
});

test('currentTrust is the latest score', () => {
  const e = detectTrustDrift(DEGRADING, { now: NOW });
  assert.equal(e.currentTrust, DEGRADING[DEGRADING.length - 1].trustScore);
});

test('baseline reflects the prior mean', () => {
  const e = detectTrustDrift(DEGRADING, { now: NOW });
  assert.ok(e.baselineTrust > e.currentTrust);
});

test('single snapshot -> stable with insufficient-history evidence', () => {
  const e = detectTrustDrift(seriesFromScores('source', 's', [60]), { now: NOW });
  assert.equal(e.kind, 'stable');
  assert.ok(e.evidence.some((x) => /Fewer than 2|Insufficient/i.test(x)));
});

test('empty history -> stable', () => {
  const e = detectTrustDrift([], { now: NOW });
  assert.equal(e.kind, 'stable');
});

test('band fall high->low forces collapse even on moderate drop magnitude', () => {
  const s = seriesFromScores('source', 's', [75, 74, 76, 75, 38]);
  assert.equal(detectTrustDrift(s, { now: NOW }).kind, 'collapse');
});

test('custom collapseDrop changes the boundary', () => {
  const s = seriesFromScores('source', 's', [70, 70, 70, 70, 55]); // drop 15
  assert.equal(detectTrustDrift(s, { now: NOW }).kind, 'degradation');
  assert.equal(detectTrustDrift(s, { now: NOW, collapseDrop: 12 }).kind, 'collapse');
});

test('custom degradeDrop changes the boundary', () => {
  const s = seriesFromScores('source', 's', [70, 70, 70, 70, 63]); // drop 7
  assert.equal(detectTrustDrift(s, { now: NOW }).kind, 'stable');
  assert.equal(detectTrustDrift(s, { now: NOW, degradeDrop: 5 }).kind, 'degradation');
});

test('collapse takes priority over instability', () => {
  // Big swings AND a collapse -> collapse wins.
  const s = seriesFromScores('source', 's', [80, 50, 85, 45, 82, 30]);
  assert.equal(detectTrustDrift(s, { now: NOW }).kind, 'collapse');
});

test('deterministic across runs', () => {
  assert.deepEqual(
    detectTrustDrift(COLLAPSING, { now: NOW }),
    detectTrustDrift(COLLAPSING, { now: NOW }),
  );
});

test('does not mutate input', () => {
  const before = DEGRADING.map((s) => s.trustScore);
  detectTrustDrift(DEGRADING, { now: NOW });
  assert.deepEqual(DEGRADING.map((s) => s.trustScore), before);
});

test('thresholds are sane constants', () => {
  assert.ok(COLLAPSE_DROP > DEGRADE_DROP);
  assert.ok(INSTABILITY_VOL > 0);
  assert.ok(MISCAL_GAP > 0);
});
