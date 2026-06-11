import { test } from 'node:test';
import assert from 'node:assert/strict';

import { calibrate } from '../src/calibration';
import {
  DEFAULT_DRIFT_THRESHOLD,
  detectConfidenceDrift,
  driftSeverity,
} from '../src/drift';
import {
  OVERCONFIDENT,
  UNDERCONFIDENT,
  WELL_CALIBRATED,
  driftFixtures,
  FIXTURE_NOW,
} from '../src/fixtures';
import type { Prediction } from '../src/types';

const NOW = FIXTURE_NOW;

function cohort(conf: number, succ: number, n: number): Prediction[] {
  const successes = Math.round(n * succ);
  return Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    kind: 'forecast' as const,
    confidence: conf,
    success: i < successes ? 1 : 0,
    at: NOW,
  }));
}

test('DEFAULT_DRIFT_THRESHOLD is 0.1', () => {
  assert.equal(DEFAULT_DRIFT_THRESHOLD, 0.1);
});

test('overconfidence detected from positive index', () => {
  const c = calibrate(OVERCONFIDENT, { now: NOW });
  const r = detectConfidenceDrift(c, undefined, { now: NOW });
  assert.equal(r.kind, 'overconfidence');
});

test('underconfidence detected from negative index', () => {
  const c = calibrate(UNDERCONFIDENT, { now: NOW });
  const r = detectConfidenceDrift(c, undefined, { now: NOW });
  assert.equal(r.kind, 'underconfidence');
});

test('degradation detected when ECE rises beyond threshold', () => {
  const fx = driftFixtures();
  const r = detectConfidenceDrift(fx.degradation.current, fx.degradation.prior, {
    now: NOW,
  });
  assert.equal(r.kind, 'degradation');
});

test('improvement detected when ECE falls beyond threshold', () => {
  const fx = driftFixtures();
  const r = detectConfidenceDrift(fx.improvement.current, fx.improvement.prior, {
    now: NOW,
  });
  assert.equal(r.kind, 'improvement');
});

test('stable when within tolerance and no prior drift', () => {
  const c = calibrate(WELL_CALIBRATED, { now: NOW });
  const r = detectConfidenceDrift(c, c, { now: NOW });
  assert.equal(r.kind, 'stable');
});

test('all five drift kinds reachable via fixtures', () => {
  const fx = driftFixtures();
  const kinds = new Set(
    Object.values(fx).map(
      (f) => detectConfidenceDrift(f.current, f.prior, { now: NOW }).kind,
    ),
  );
  for (const k of ['overconfidence', 'underconfidence', 'degradation', 'improvement', 'stable']) {
    assert.ok(kinds.has(k as never), `missing ${k}`);
  }
});

test('magnitude is in [0,1]', () => {
  const fx = driftFixtures();
  for (const f of Object.values(fx)) {
    const r = detectConfidenceDrift(f.current, f.prior, { now: NOW });
    assert.ok(r.magnitude >= 0 && r.magnitude <= 1);
  }
});

test('stable drift has zero magnitude', () => {
  const c = calibrate(WELL_CALIBRATED, { now: NOW });
  const r = detectConfidenceDrift(c, c, { now: NOW });
  assert.equal(r.magnitude, 0);
});

test('magnitude is monotonic in overconfidence gap', () => {
  const mild = detectConfidenceDrift(calibrate(cohort(0.7, 0.55, 20), { now: NOW }), undefined, { now: NOW });
  const severe = detectConfidenceDrift(calibrate(cohort(0.9, 0.2, 20), { now: NOW }), undefined, { now: NOW });
  assert.equal(mild.kind, 'overconfidence');
  assert.equal(severe.kind, 'overconfidence');
  assert.ok(severe.magnitude > mild.magnitude);
});

test('recommendation is always present', () => {
  const fx = driftFixtures();
  for (const f of Object.values(fx)) {
    const r = detectConfidenceDrift(f.current, f.prior, { now: NOW });
    assert.ok(r.recommendation.length > 0);
  }
});

test('explanation is always present', () => {
  const fx = driftFixtures();
  for (const f of Object.values(fx)) {
    const r = detectConfidenceDrift(f.current, f.prior, { now: NOW });
    assert.ok(r.explanation.length > 0);
  }
});

test('overconfidence recommends DOWNWARD calibration', () => {
  const c = calibrate(OVERCONFIDENT, { now: NOW });
  const r = detectConfidenceDrift(c, undefined, { now: NOW });
  assert.match(r.recommendation, /DOWNWARD/);
});

test('recommendation never claims auto-correction for non-stable kinds', () => {
  const c = calibrate(OVERCONFIDENT, { now: NOW });
  const r = detectConfidenceDrift(c, undefined, { now: NOW });
  assert.match(r.recommendation, /do not auto-correct/i);
});

test('detectConfidenceDrift does not mutate the current curve', () => {
  const c = calibrate(OVERCONFIDENT, { now: NOW });
  const snapshot = JSON.parse(JSON.stringify(c));
  detectConfidenceDrift(c, undefined, { now: NOW });
  assert.deepEqual(c, snapshot);
});

test('detectConfidenceDrift does not mutate the prior curve', () => {
  const fx = driftFixtures();
  const prior = fx.degradation.prior!;
  const snapshot = JSON.parse(JSON.stringify(prior));
  detectConfidenceDrift(fx.degradation.current, prior, { now: NOW });
  assert.deepEqual(prior, snapshot);
});

test('currentEce echoes the curve ECE', () => {
  const c = calibrate(OVERCONFIDENT, { now: NOW });
  const r = detectConfidenceDrift(c, undefined, { now: NOW });
  assert.equal(r.currentEce, c.expectedCalibrationError);
});

test('priorEce omitted when no prior supplied', () => {
  const c = calibrate(OVERCONFIDENT, { now: NOW });
  const r = detectConfidenceDrift(c, undefined, { now: NOW });
  assert.equal(r.priorEce, undefined);
});

test('priorEce present when prior supplied', () => {
  const fx = driftFixtures();
  const r = detectConfidenceDrift(fx.degradation.current, fx.degradation.prior, { now: NOW });
  assert.ok(typeof r.priorEce === 'number');
});

test('detectedAt uses injected now', () => {
  const c = calibrate(OVERCONFIDENT, { now: NOW });
  const r = detectConfidenceDrift(c, undefined, { now: '2030-01-01T00:00:00.000Z' });
  assert.equal(r.detectedAt, '2030-01-01T00:00:00.000Z');
});

test('detectedAt falls back to curve generatedAt', () => {
  const c = calibrate(OVERCONFIDENT, { now: NOW });
  const r = detectConfidenceDrift(c, undefined);
  assert.equal(r.detectedAt, c.generatedAt);
});

test('custom threshold can suppress mild overconfidence', () => {
  const c = calibrate(cohort(0.7, 0.62, 20), { now: NOW }); // gap ~0.08
  const r = detectConfidenceDrift(c, undefined, { now: NOW, threshold: 0.2 });
  assert.equal(r.kind, 'stable');
});

test('driftSeverity: stable -> LOW', () => {
  const c = calibrate(WELL_CALIBRATED, { now: NOW });
  const r = detectConfidenceDrift(c, c, { now: NOW });
  assert.equal(driftSeverity(r), 'LOW');
});

test('driftSeverity: improvement -> LOW', () => {
  const fx = driftFixtures();
  const r = detectConfidenceDrift(fx.improvement.current, fx.improvement.prior, { now: NOW });
  assert.equal(driftSeverity(r), 'LOW');
});

test('driftSeverity: severe overconfidence -> CRITICAL', () => {
  const c = calibrate(cohort(0.95, 0.05, 20), { now: NOW });
  const r = detectConfidenceDrift(c, undefined, { now: NOW });
  assert.equal(driftSeverity(r), 'CRITICAL');
});

test('driftSeverity mapping covers magnitude bands', () => {
  const mk = (mag: number) =>
    driftSeverity({
      kind: 'overconfidence',
      magnitude: mag,
      currentEce: 0.2,
      recommendation: 'x',
      explanation: 'y',
      detectedAt: NOW,
    });
  assert.equal(mk(0.5), 'CRITICAL');
  assert.equal(mk(0.3), 'HIGH');
  assert.equal(mk(0.15), 'MEDIUM');
  assert.equal(mk(0.05), 'LOW');
});

test('deterministic across runs', () => {
  const c = calibrate(OVERCONFIDENT, { now: NOW });
  assert.deepEqual(
    detectConfidenceDrift(c, undefined, { now: NOW }),
    detectConfidenceDrift(c, undefined, { now: NOW }),
  );
});
