import { test } from 'node:test';
import assert from 'node:assert/strict';

import { evaluateOutcome } from '../src/outcome';
import type { ObservedData, RecommendationRef } from '../src/types';

const NOW = '2026-06-01T00:00:00.000Z';

function rec(over: Partial<RecommendationRef> = {}): RecommendationRef {
  return {
    recommendationId: 'r1',
    decisionRunId: 'run1',
    interventionType: 'reduce_amplification',
    recommendedAction: 'dampen growth',
    expectedEffect: -40,
    confidenceBefore: 0.6,
    expectedOutcome: { signalDeltaPct: -40 },
    ...over,
  };
}
function obs(over: Partial<ObservedData> = {}): ObservedData {
  return { capturedAt: NOW, ...over };
}

test('successful: dampening predicted + dampening observed → high score', () => {
  const e = evaluateOutcome(rec(), obs({ signalDeltaPct: -42, amplificationDelta: -5 }), NOW);
  assert.equal(e.outcomeStatus, 'successful');
  assert.ok(e.successScore >= 75);
});

test('partially_successful: right direction, undershoot', () => {
  const e = evaluateOutcome(rec(), obs({ signalDeltaPct: -22 }), NOW);
  assert.equal(e.outcomeStatus, 'partially_successful');
  assert.ok(e.successScore >= 50 && e.successScore < 75);
});

test('neutral: right direction but very weak', () => {
  const e = evaluateOutcome(
    rec({ expectedOutcome: { signalDeltaPct: -40, amplificationDelta: 10 } }),
    obs({ signalDeltaPct: -6, amplificationDelta: 12 }),
    NOW,
  );
  assert.equal(e.outcomeStatus, 'neutral');
  assert.ok(e.successScore >= 25 && e.successScore < 50);
});

test('unsuccessful: wrong direction (backfire)', () => {
  const e = evaluateOutcome(rec(), obs({ signalDeltaPct: 35 }), NOW);
  assert.equal(e.outcomeStatus, 'unsuccessful');
  assert.ok(e.successScore < 50);
});

test('inconclusive: thin data', () => {
  const e = evaluateOutcome(rec(), obs({}), NOW);
  assert.equal(e.outcomeStatus, 'inconclusive');
});

test('success raises confidence', () => {
  const e = evaluateOutcome(rec({ confidenceBefore: 0.6 }), obs({ signalDeltaPct: -42 }), NOW);
  assert.ok(e.confidenceAfter > e.confidenceBefore);
  assert.ok(e.confidenceAdjustment > 0);
});

test('failure lowers confidence', () => {
  const e = evaluateOutcome(rec({ confidenceBefore: 0.6 }), obs({ signalDeltaPct: 35 }), NOW);
  assert.ok(e.confidenceAfter < e.confidenceBefore);
  assert.ok(e.confidenceAdjustment < 0);
});

test('confidenceAfter never exceeds 0.99', () => {
  const e = evaluateOutcome(rec({ confidenceBefore: 0.99 }), obs({ signalDeltaPct: -42 }), NOW);
  assert.ok(e.confidenceAfter <= 0.99);
});

test('confidenceAfter never below 0', () => {
  const e = evaluateOutcome(rec({ confidenceBefore: 0.05 }), obs({ signalDeltaPct: 50 }), NOW);
  assert.ok(e.confidenceAfter >= 0);
});

test('confidenceAfter never reaches 1.0 even with perfect success', () => {
  const e = evaluateOutcome(rec({ confidenceBefore: 1 }), obs({ signalDeltaPct: -40 }), NOW);
  assert.ok(e.confidenceAfter < 1);
});

test('inconclusive barely moves confidence', () => {
  const e = evaluateOutcome(rec({ confidenceBefore: 0.6 }), obs({}), NOW);
  assert.ok(Math.abs(e.confidenceAdjustment) < 0.05);
});

test('explanation references the real deltas', () => {
  const e = evaluateOutcome(rec(), obs({ signalDeltaPct: -42 }), NOW);
  const joined = e.explanation.join(' ');
  assert.match(joined, /signalDeltaPct/);
  assert.match(joined, /-42/);
});

test('limitations always present', () => {
  const e = evaluateOutcome(rec(), obs({ signalDeltaPct: -42 }), NOW);
  assert.ok(e.limitations.length >= 2);
});

test('inconclusive adds thin-data limitation', () => {
  const e = evaluateOutcome(rec(), obs({}), NOW);
  assert.ok(e.limitations.some((l) => /INCONCLUSIVE|Insufficient/i.test(l)));
});

test('evaluatedAt echoes injected now', () => {
  const e = evaluateOutcome(rec(), obs({ signalDeltaPct: -40 }), NOW);
  assert.equal(e.evaluatedAt, NOW);
});

test('rec ids carried through', () => {
  const e = evaluateOutcome(rec({ recommendationId: 'X', decisionRunId: 'Y' }), obs({ signalDeltaPct: -40 }), NOW);
  assert.equal(e.recommendationId, 'X');
  assert.equal(e.decisionRunId, 'Y');
});

test('deterministic — same inputs same output', () => {
  const a = evaluateOutcome(rec(), obs({ signalDeltaPct: -40 }), NOW);
  const b = evaluateOutcome(rec(), obs({ signalDeltaPct: -40 }), NOW);
  assert.deepEqual(a, b);
});

test('measurements included in evaluation', () => {
  const e = evaluateOutcome(rec({ expectedOutcome: { a: 1, b: 2 } }), obs({ metrics: { a: 1, b: 2 } }), NOW);
  assert.equal(e.measurements.length, 2);
});

test('flat-expectation reco successful when world stays flat', () => {
  const e = evaluateOutcome(
    rec({ expectedEffect: 0, expectedOutcome: { signalDeltaPct: 0 } }),
    obs({ signalDeltaPct: 0 }),
    NOW,
  );
  assert.ok(e.successScore >= 50);
  assert.notEqual(e.outcomeStatus, 'unsuccessful');
});

test('flat-expectation reco unsuccessful when world moves a lot', () => {
  const e = evaluateOutcome(
    rec({ expectedEffect: 0, expectedOutcome: { signalDeltaPct: 0 } }),
    obs({ signalDeltaPct: 80 }),
    NOW,
  );
  assert.ok(e.successScore < 50);
});

test('overshoot in right direction still successful', () => {
  const e = evaluateOutcome(rec(), obs({ signalDeltaPct: -90 }), NOW);
  assert.equal(e.outcomeStatus, 'successful');
});

test('confidenceBefore clamped into range', () => {
  const e = evaluateOutcome(rec({ confidenceBefore: 1.5 }), obs({ signalDeltaPct: -40 }), NOW);
  assert.ok(e.confidenceBefore <= 1);
});

test('positive expected effect, positive observed → success', () => {
  const e = evaluateOutcome(
    rec({ expectedEffect: 40, expectedOutcome: { signalDeltaPct: 40 } }),
    obs({ signalDeltaPct: 41 }),
    NOW,
  );
  assert.equal(e.outcomeStatus, 'successful');
});

test('single observed metric adds limited-corroboration limitation', () => {
  const e = evaluateOutcome(rec(), obs({ signalDeltaPct: -40 }), NOW);
  assert.ok(e.limitations.some((l) => /one observed metric/i.test(l)));
});

test('no expectedOutcome adds derived-expectation limitation', () => {
  const e = evaluateOutcome(rec({ expectedOutcome: undefined }), obs({ signalDeltaPct: -40 }), NOW);
  assert.ok(e.limitations.some((l) => /expectedOutcome/i.test(l)));
});
