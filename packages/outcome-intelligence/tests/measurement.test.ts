import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  measureDelta,
  compareExpectedVsActual,
  expectedMetricsFor,
  observedMetricsFor,
} from '../src/measurement';
import type { ObservedData, RecommendationRef } from '../src/types';

const NOW = '2026-06-01T00:00:00.000Z';

function rec(over: Partial<RecommendationRef> = {}): RecommendationRef {
  return {
    recommendationId: 'r1',
    decisionRunId: 'run1',
    interventionType: 'reduce_amplification',
    recommendedAction: 'dampen',
    expectedEffect: -40,
    confidenceBefore: 0.6,
    ...over,
  };
}

test('measureDelta computes per-metric delta', () => {
  const m = measureDelta({ a: -40, b: 10 }, { a: -42, b: 12 });
  const a = m.find((x) => x.metric === 'a')!;
  const b = m.find((x) => x.metric === 'b')!;
  assert.equal(a.expectedValue, -40);
  assert.equal(a.observedValue, -42);
  assert.equal(a.delta, -2);
  assert.equal(b.delta, 2);
});

test('measureDelta withinExpectation true when sign matches & magnitude close', () => {
  const m = measureDelta({ a: -40 }, { a: -41 });
  assert.equal(m[0].withinExpectation, true);
});

test('measureDelta withinExpectation true on overshoot in right direction', () => {
  const m = measureDelta({ a: -40 }, { a: -80 });
  assert.equal(m[0].withinExpectation, true);
});

test('measureDelta withinExpectation false on wrong direction', () => {
  const m = measureDelta({ a: -40 }, { a: 30 });
  assert.equal(m[0].withinExpectation, false);
});

test('measureDelta withinExpectation false on undershoot below tolerance', () => {
  const m = measureDelta({ a: -40 }, { a: -10 }); // ratio 0.25 < 0.5
  assert.equal(m[0].withinExpectation, false);
});

test('measureDelta flat expectation needs flat observed', () => {
  const flat = measureDelta({ a: 0 }, { a: 0 });
  assert.equal(flat[0].withinExpectation, true);
  const moved = measureDelta({ a: 0 }, { a: 30 });
  assert.equal(moved[0].withinExpectation, false);
});

test('measureDelta treats missing observed key as 0', () => {
  const m = measureDelta({ a: -40 }, {});
  assert.equal(m[0].observedValue, 0);
  assert.equal(m[0].withinExpectation, false);
});

test('measureDelta returns one entry per expected key', () => {
  const m = measureDelta({ a: 1, b: 2, c: 3 }, { a: 1 });
  assert.equal(m.length, 3);
});

test('expectedMetricsFor uses expectedOutcome when present', () => {
  const e = expectedMetricsFor(rec({ expectedOutcome: { x: 5, y: -2 } }));
  assert.deepEqual(e, { x: 5, y: -2 });
});

test('expectedMetricsFor derives signalDeltaPct from expectedEffect', () => {
  const e = expectedMetricsFor(rec({ expectedEffect: -33, expectedOutcome: undefined }));
  assert.deepEqual(e, { signalDeltaPct: -33 });
});

test('observedMetricsFor pulls named fields + free-form metrics', () => {
  const obs: ObservedData = {
    signalDeltaPct: -10,
    amplificationDelta: -5,
    communityDelta: -2,
    metrics: { custom: 7 },
    capturedAt: NOW,
  };
  const o = observedMetricsFor(obs);
  assert.equal(o.signalDeltaPct, -10);
  assert.equal(o.amplificationDelta, -5);
  assert.equal(o.communityDelta, -2);
  assert.equal(o.custom, 7);
});

test('observedMetricsFor omits undefined fields', () => {
  const o = observedMetricsFor({ capturedAt: NOW });
  assert.deepEqual(o, {});
});

test('compareExpectedVsActual directionMatch true when observed shares sign', () => {
  const r = compareExpectedVsActual(rec(), { signalDeltaPct: -42, capturedAt: NOW });
  assert.equal(r.directionMatch, true);
});

test('compareExpectedVsActual directionMatch false on backfire', () => {
  const r = compareExpectedVsActual(rec(), { signalDeltaPct: 35, capturedAt: NOW });
  assert.equal(r.directionMatch, false);
});

test('compareExpectedVsActual magnitudeRatio ~1 when bang on', () => {
  const r = compareExpectedVsActual(rec(), { signalDeltaPct: -40, capturedAt: NOW });
  assert.ok(Math.abs(r.magnitudeRatio - 1) < 1e-9);
});

test('compareExpectedVsActual magnitudeRatio ~0.5 on half effect', () => {
  const r = compareExpectedVsActual(rec(), { signalDeltaPct: -20, capturedAt: NOW });
  assert.ok(Math.abs(r.magnitudeRatio - 0.5) < 1e-9);
});

test('compareExpectedVsActual picks largest-magnitude metric as primary', () => {
  const r = compareExpectedVsActual(
    rec({ expectedOutcome: { small: 2, big: -50 } }),
    { metrics: { small: 1, big: -50 }, capturedAt: NOW },
  );
  // primary should be "big" → directionMatch on the negative value
  assert.equal(r.directionMatch, true);
  assert.ok(Math.abs(r.magnitudeRatio - 1) < 1e-9);
});

test('compareExpectedVsActual magnitudeRatio 0 when no expectation magnitude', () => {
  const r = compareExpectedVsActual(
    rec({ expectedEffect: 0, expectedOutcome: { signalDeltaPct: 0 } }),
    { signalDeltaPct: 0, capturedAt: NOW },
  );
  assert.equal(r.magnitudeRatio, 0);
  assert.equal(r.directionMatch, true); // flat predicted, flat observed
});

test('compareExpectedVsActual returns measurements array', () => {
  const r = compareExpectedVsActual(rec({ expectedOutcome: { a: 1, b: 2 } }), {
    metrics: { a: 1, b: 2 },
    capturedAt: NOW,
  });
  assert.equal(r.measurements.length, 2);
});

test('measureDelta is deterministic', () => {
  const a = measureDelta({ a: -40 }, { a: -41 });
  const b = measureDelta({ a: -40 }, { a: -41 });
  assert.deepEqual(a, b);
});

test('measureDelta tiny noise within zero tolerance treated as flat', () => {
  const m = measureDelta({ a: 0.5 }, { a: -0.5 });
  assert.equal(m[0].withinExpectation, true);
});
