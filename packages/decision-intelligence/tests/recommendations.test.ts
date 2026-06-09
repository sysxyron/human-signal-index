import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  captureNarrativeSnapshot,
  evolutionSeries,
  forecastNarrativeTrajectory,
} from '@hsi/temporal-intelligence';
import { detectCausalEvents } from '@hsi/causal-intelligence';
import { calibrateConfidence } from '@hsi/counterfactual-engine';
import type {
  CausalInput,
  NarrativeSnapshot,
} from '@hsi/causal-intelligence';
import type { BacktestRecord } from '@hsi/counterfactual-engine';
import type { NarrativeStats } from '@hsi/temporal-intelligence';

import { generateRecommendations, MIN_CONFIDENCE, HIGH_RISK } from '../src/recommendations';
import type { DecisionInput } from '../src/types';

const NOW = '2026-04-01T00:00:00.000Z';
const DAY = 86400000;
function db(d: number): string {
  return new Date(Date.parse(NOW) - d * DAY).toISOString();
}
function sn(
  id: string,
  a: number,
  s: Omit<NarrativeStats, 'narrativeId'>,
): NarrativeSnapshot {
  return captureNarrativeSnapshot({ narrativeId: id, ...s }, db(a));
}
function inp(id: string, snaps: NarrativeSnapshot[]): DecisionInput {
  const evolution = evolutionSeries(snaps, NOW);
  const ci: CausalInput = { narrativeId: id, snapshots: snaps, evolution, now: NOW };
  const events = detectCausalEvents(ci);
  const forecast = forecastNarrativeTrajectory({ narrativeId: id, snapshots: snaps, evolution, now: NOW });
  return { narrativeId: id, snapshots: snaps, evolution, events, forecast, now: NOW };
}

// Rising + adversarial (high amp, low reliability) → counter_narrative.
const ADVERSARIAL = inp('adv', [
  sn('adv', 28, { signalCount: 30, sourceCount: 4, communityCount: 3, amplificationScore: 20, reliabilityScore: 48, supportRatio: 0.5, contradictionRatio: 0.28 }),
  sn('adv', 21, { signalCount: 33, sourceCount: 4, communityCount: 3, amplificationScore: 22, reliabilityScore: 47, supportRatio: 0.52, contradictionRatio: 0.26 }),
  sn('adv', 14, { signalCount: 38, sourceCount: 5, communityCount: 4, amplificationScore: 90, reliabilityScore: 45, supportRatio: 0.55, contradictionRatio: 0.22 }),
  sn('adv', 7, { signalCount: 44, sourceCount: 5, communityCount: 4, amplificationScore: 93, reliabilityScore: 44, supportRatio: 0.57, contradictionRatio: 0.2 }),
  sn('adv', 2, { signalCount: 48, sourceCount: 5, communityCount: 4, amplificationScore: 94, reliabilityScore: 43, supportRatio: 0.58, contradictionRatio: 0.19 }),
]);

// Rising + high reliability (NOT adversarial), best risk < HIGH_RISK → intervention.
const RISING_RELIABLE = inp('rel', [
  sn('rel', 28, { signalCount: 30, sourceCount: 4, communityCount: 3, amplificationScore: 20, reliabilityScore: 80, supportRatio: 0.7, contradictionRatio: 0.1 }),
  sn('rel', 21, { signalCount: 33, sourceCount: 4, communityCount: 3, amplificationScore: 22, reliabilityScore: 80, supportRatio: 0.7, contradictionRatio: 0.1 }),
  sn('rel', 14, { signalCount: 38, sourceCount: 5, communityCount: 4, amplificationScore: 90, reliabilityScore: 80, supportRatio: 0.7, contradictionRatio: 0.1 }),
  sn('rel', 7, { signalCount: 44, sourceCount: 5, communityCount: 4, amplificationScore: 93, reliabilityScore: 80, supportRatio: 0.7, contradictionRatio: 0.1 }),
  sn('rel', 2, { signalCount: 48, sourceCount: 5, communityCount: 4, amplificationScore: 94, reliabilityScore: 80, supportRatio: 0.7, contradictionRatio: 0.1 }),
]);

// Thin rising (2 snaps) → high-risk best on a rising narrative → escalate.
const THIN_RISING = inp('thin', [
  sn('thin', 10, { signalCount: 30, sourceCount: 4, communityCount: 3, amplificationScore: 30, reliabilityScore: 60, supportRatio: 0.6, contradictionRatio: 0.15 }),
  sn('thin', 2, { signalCount: 60, sourceCount: 6, communityCount: 5, amplificationScore: 75, reliabilityScore: 60, supportRatio: 0.6, contradictionRatio: 0.15 }),
]);

// Flat → no_action.
const FLAT = inp('flat', [
  sn('flat', 20, { signalCount: 10, sourceCount: 2, communityCount: 1, amplificationScore: 25, reliabilityScore: 60, supportRatio: 0.5, contradictionRatio: 0.2 }),
  sn('flat', 10, { signalCount: 10, sourceCount: 2, communityCount: 1, amplificationScore: 25, reliabilityScore: 60, supportRatio: 0.5, contradictionRatio: 0.2 }),
  sn('flat', 2, { signalCount: 10, sourceCount: 2, communityCount: 1, amplificationScore: 25, reliabilityScore: 60, supportRatio: 0.5, contradictionRatio: 0.2 }),
]);

// Gentle decline with weak interventions → monitor.
const DECLINE = inp('dec', [
  sn('dec', 40, { signalCount: 40, sourceCount: 4, communityCount: 3, amplificationScore: 45, reliabilityScore: 60, supportRatio: 0.5, contradictionRatio: 0.2 }),
  sn('dec', 30, { signalCount: 36, sourceCount: 4, communityCount: 3, amplificationScore: 42, reliabilityScore: 60, supportRatio: 0.5, contradictionRatio: 0.22 }),
  sn('dec', 20, { signalCount: 33, sourceCount: 4, communityCount: 3, amplificationScore: 40, reliabilityScore: 60, supportRatio: 0.48, contradictionRatio: 0.24 }),
  sn('dec', 10, { signalCount: 31, sourceCount: 4, communityCount: 3, amplificationScore: 39, reliabilityScore: 60, supportRatio: 0.47, contradictionRatio: 0.25 }),
]);

test('rising + adversarial → counter_narrative', () => {
  const r = generateRecommendations(ADVERSARIAL, NOW);
  assert.equal(r.decisionType, 'counter_narrative');
});

test('rising + reliable (low risk best) → intervention', () => {
  const r = generateRecommendations(RISING_RELIABLE, NOW);
  assert.equal(r.decisionType, 'intervention');
});

test('thin rising with high-risk best → escalate', () => {
  const r = generateRecommendations(THIN_RISING, NOW);
  assert.equal(r.decisionType, 'escalate');
});

test('flat narrative → no_action', () => {
  const r = generateRecommendations(FLAT, NOW);
  assert.equal(r.decisionType, 'no_action');
});

test('gentle decline with weak levers → monitor', () => {
  const r = generateRecommendations(DECLINE, NOW);
  assert.equal(r.decisionType, 'monitor');
});

test('intervention recommends the best-ranked lever', () => {
  const r = generateRecommendations(RISING_RELIABLE, NOW);
  assert.ok(/Apply/.test(r.recommendedAction));
});

test('every recommendation carries reasoning, limitations, evidence', () => {
  for (const i of [ADVERSARIAL, RISING_RELIABLE, THIN_RISING, FLAT, DECLINE]) {
    const r = generateRecommendations(i, NOW);
    assert.ok(r.reasoning.length > 0, 'reasoning');
    assert.ok(r.limitations.length > 0, 'limitations');
    assert.ok(r.evidence.length > 0, 'evidence');
  }
});

test('confidence is never certainty', () => {
  for (const i of [ADVERSARIAL, RISING_RELIABLE, THIN_RISING, FLAT, DECLINE]) {
    const r = generateRecommendations(i, NOW);
    assert.ok(r.confidence < 1);
    assert.ok(r.confidence <= 0.9);
  }
});

test('confidenceBand matches the confidence value', () => {
  const r = generateRecommendations(ADVERSARIAL, NOW);
  if (r.confidence >= 0.66) assert.equal(r.confidenceBand, 'high');
  else if (r.confidence >= 0.4) assert.equal(r.confidenceBand, 'medium');
  else assert.equal(r.confidenceBand, 'low');
});

test('limitations always mention the estimate / unexplained caveat', () => {
  const r = generateRecommendations(ADVERSARIAL, NOW);
  assert.ok(r.limitations.some((l) => /DECISION AID|estimate/i.test(l)));
  assert.ok(r.limitations.some((l) => /unexplained/i.test(l)));
});

// ---- Calibration ------------------------------------------------------------

// Overconfident high band: stated ~0.9, ~50% correct → calibrate pulls down.
function bt(state: string, prob: number, actual: string): BacktestRecord {
  return {
    narrativeId: 'x',
    predictedState: state,
    predictedProbability: prob,
    actualState: actual,
    actualProbability: state === actual ? 1 : 0,
    errorScore: 0,
  };
}
const OVERCONF: BacktestRecord[] = [
  bt('rising', 0.9, 'rising'),
  bt('rising', 0.9, 'stable'),
  bt('rising', 0.88, 'declining'),
  bt('declining', 0.9, 'declining'),
];

test('calibrated confidence ≤ raw confidence', () => {
  const calibration = calibrateConfidence(OVERCONF);
  const raw = generateRecommendations(ADVERSARIAL, NOW);
  const cal = generateRecommendations({ ...ADVERSARIAL, calibration }, NOW);
  assert.ok(cal.confidence <= raw.confidence, `${cal.confidence} ≤ ${raw.confidence}`);
});

test('calibration adds a calibration note to reasoning', () => {
  const calibration = calibrateConfidence(OVERCONF);
  const cal = generateRecommendations({ ...ADVERSARIAL, calibration }, NOW);
  assert.ok(cal.reasoning.some((x) => /calibrated/i.test(x)));
});

test('calibration does not change the decisionType for the same input', () => {
  const calibration = calibrateConfidence(OVERCONF);
  const raw = generateRecommendations(ADVERSARIAL, NOW);
  const cal = generateRecommendations({ ...ADVERSARIAL, calibration }, NOW);
  assert.equal(raw.decisionType, cal.decisionType);
});

test('thresholds are exported and sane', () => {
  assert.equal(MIN_CONFIDENCE, 0.4);
  assert.equal(HIGH_RISK, 70);
});

test('deterministic across runs', () => {
  const a = generateRecommendations(ADVERSARIAL, NOW);
  const b = generateRecommendations(ADVERSARIAL, NOW);
  assert.deepEqual(a, b);
});

test('evidence includes the dominant cause and forecast', () => {
  const r = generateRecommendations(ADVERSARIAL, NOW);
  assert.ok(r.evidence.some((e) => /Dominant cause/.test(e)));
  assert.ok(r.evidence.some((e) => /Forecast/.test(e)));
});
