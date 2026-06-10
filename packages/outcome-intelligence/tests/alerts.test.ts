import { test } from 'node:test';
import assert from 'node:assert/strict';

import { detectOutcomeAlerts } from '../src/alerts';
import type {
  ConfidenceLearningEntry,
  NarrativeSnapshot,
  OutcomeEvaluation,
} from '../src/types';

const NOW = '2026-06-01T00:00:00.000Z';

function failedEval(over: Partial<OutcomeEvaluation> = {}): OutcomeEvaluation {
  return {
    recommendationId: 'r1',
    decisionRunId: 'run1',
    successScore: 10,
    outcomeStatus: 'unsuccessful',
    confidenceBefore: 0.5,
    confidenceAfter: 0.4,
    confidenceAdjustment: -0.1,
    measurements: [],
    explanation: [],
    limitations: [],
    evaluatedAt: NOW,
    ...over,
  };
}

function snap(
  narrativeId: string,
  capturedAt: string,
  signalCount: number,
  amplificationScore: number,
): NarrativeSnapshot {
  return {
    id: `${narrativeId}@${capturedAt}`,
    narrativeId,
    capturedAt,
    signalCount,
    sourceCount: 5,
    communityCount: 3,
    amplificationScore,
    reliabilityScore: 50,
    supportRatio: 0.5,
    contradictionRatio: 0.2,
  };
}

function find(alerts: ReturnType<typeof detectOutcomeAlerts>, t: string) {
  return alerts.filter((a) => a.alertType === t);
}

test('recommendation_failed fires on unsuccessful + low score', () => {
  const a = detectOutcomeAlerts({ evaluations: [failedEval()], now: NOW });
  assert.equal(find(a, 'recommendation_failed').length, 1);
});

test('recommendation_failed CRITICAL when prior confidence high', () => {
  const a = detectOutcomeAlerts({ evaluations: [failedEval({ confidenceBefore: 0.8 })], now: NOW });
  assert.equal(find(a, 'recommendation_failed')[0].severity, 'CRITICAL');
});

test('recommendation_failed HIGH when prior confidence low', () => {
  const a = detectOutcomeAlerts({ evaluations: [failedEval({ confidenceBefore: 0.4 })], now: NOW });
  assert.equal(find(a, 'recommendation_failed')[0].severity, 'HIGH');
});

test('recommendation_failed does NOT fire above score threshold', () => {
  const a = detectOutcomeAlerts({ evaluations: [failedEval({ successScore: 40 })], now: NOW });
  assert.equal(find(a, 'recommendation_failed').length, 0);
});

test('recommendation_failed does NOT fire when status not unsuccessful', () => {
  const a = detectOutcomeAlerts({
    evaluations: [failedEval({ outcomeStatus: 'neutral', successScore: 10 })],
    now: NOW,
  });
  assert.equal(find(a, 'recommendation_failed').length, 0);
});

test('confidence_drift fires on large negative adjustment', () => {
  const learning: ConfidenceLearningEntry[] = [
    {
      interventionType: 'X',
      sampleCount: 4,
      successCount: 1,
      avgSuccessScore: 30,
      calibratedConfidence: 0.4,
      adjustment: -0.15,
      rationale: '',
    },
  ];
  const a = detectOutcomeAlerts({ learning, now: NOW });
  assert.equal(find(a, 'confidence_drift').length, 1);
  assert.equal(find(a, 'confidence_drift')[0].severity, 'MEDIUM');
});

test('confidence_drift HIGH when adjustment <= -0.2', () => {
  const learning: ConfidenceLearningEntry[] = [
    {
      interventionType: 'X',
      sampleCount: 4,
      successCount: 0,
      avgSuccessScore: 10,
      calibratedConfidence: 0.3,
      adjustment: -0.25,
      rationale: '',
    },
  ];
  const a = detectOutcomeAlerts({ learning, now: NOW });
  assert.equal(find(a, 'confidence_drift')[0].severity, 'HIGH');
});

test('confidence_drift does NOT fire on small/positive adjustment', () => {
  const learning: ConfidenceLearningEntry[] = [
    {
      interventionType: 'X',
      sampleCount: 4,
      successCount: 3,
      avgSuccessScore: 70,
      calibratedConfidence: 0.6,
      adjustment: 0.1,
      rationale: '',
    },
  ];
  const a = detectOutcomeAlerts({ learning, now: NOW });
  assert.equal(find(a, 'confidence_drift').length, 0);
});

test('narrative_spike fires on big signal jump', () => {
  const snaps = [
    snap('n', '2026-05-01T00:00:00.000Z', 100, 30),
    snap('n', '2026-05-02T00:00:00.000Z', 200, 35),
  ];
  const a = detectOutcomeAlerts({ snapshots: snaps, now: NOW });
  assert.ok(find(a, 'narrative_spike').length >= 1);
});

test('narrative_spike HIGH when both signal and amplification spike', () => {
  const snaps = [
    snap('n', '2026-05-01T00:00:00.000Z', 100, 30),
    snap('n', '2026-05-02T00:00:00.000Z', 200, 55),
  ];
  const a = detectOutcomeAlerts({ snapshots: snaps, now: NOW });
  const spikes = find(a, 'narrative_spike');
  assert.ok(spikes.some((s) => s.severity === 'HIGH'));
});

test('narrative_spike does NOT fire below threshold', () => {
  const snaps = [
    snap('n', '2026-05-01T00:00:00.000Z', 100, 30),
    snap('n', '2026-05-02T00:00:00.000Z', 110, 32),
  ];
  const a = detectOutcomeAlerts({ snapshots: snaps, now: NOW });
  assert.equal(find(a, 'narrative_spike').length, 0);
});

test('forecast_miss fires when predicted != actual', () => {
  const a = detectOutcomeAlerts({ forecasts: [{ predicted: 'stable', actual: 'surging' }], now: NOW });
  assert.equal(find(a, 'forecast_miss').length, 1);
});

test('forecast_miss does NOT fire when predicted == actual', () => {
  const a = detectOutcomeAlerts({ forecasts: [{ predicted: 'stable', actual: 'stable' }], now: NOW });
  assert.equal(find(a, 'forecast_miss').length, 0);
});

test('resurgence fires on decline-then-rise', () => {
  const snaps = [
    snap('n', '2026-05-01T00:00:00.000Z', 100, 30),
    snap('n', '2026-05-08T00:00:00.000Z', 60, 28),
    snap('n', '2026-05-15T00:00:00.000Z', 55, 27),
    snap('n', '2026-05-22T00:00:00.000Z', 120, 50),
  ];
  const a = detectOutcomeAlerts({ snapshots: snaps, now: NOW });
  assert.ok(find(a, 'resurgence').length >= 1);
});

test('resurgence does NOT fire on steady decline', () => {
  const snaps = [
    snap('n', '2026-05-01T00:00:00.000Z', 100, 30),
    snap('n', '2026-05-08T00:00:00.000Z', 80, 28),
    snap('n', '2026-05-15T00:00:00.000Z', 60, 26),
    snap('n', '2026-05-22T00:00:00.000Z', 40, 24),
  ];
  const a = detectOutcomeAlerts({ snapshots: snaps, now: NOW });
  assert.equal(find(a, 'resurgence').length, 0);
});

test('security_anomaly fires for supplied security signal', () => {
  const a = detectOutcomeAlerts({ securitySignals: [{ type: 'cib', severity: 'high' }], now: NOW });
  assert.equal(find(a, 'security_anomaly').length, 1);
  assert.equal(find(a, 'security_anomaly')[0].severity, 'HIGH');
});

test('security_anomaly maps critical severity', () => {
  const a = detectOutcomeAlerts({ securitySignals: [{ type: 'breach', severity: 'critical' }], now: NOW });
  assert.equal(find(a, 'security_anomaly')[0].severity, 'CRITICAL');
});

test('security_anomaly maps unknown severity to LOW', () => {
  const a = detectOutcomeAlerts({ securitySignals: [{ type: 'x', severity: 'meh' }], now: NOW });
  assert.equal(find(a, 'security_anomaly')[0].severity, 'LOW');
});

test('every alert has type + severity + message + explanation', () => {
  const a = detectOutcomeAlerts({
    evaluations: [failedEval()],
    securitySignals: [{ type: 'x', severity: 'low' }],
    forecasts: [{ predicted: 'a', actual: 'b' }],
    now: NOW,
  });
  for (const al of a) {
    assert.ok(al.alertType);
    assert.ok(al.severity);
    assert.ok(al.message.length > 0);
    assert.ok(al.explanation.length > 0);
    assert.equal(al.createdAt, NOW);
  }
});

test('no inputs → no alerts (never auto-acts on empty)', () => {
  const a = detectOutcomeAlerts({ now: NOW });
  assert.equal(a.length, 0);
});

test('alerts are pure data — no functions in output', () => {
  const a = detectOutcomeAlerts({ evaluations: [failedEval()], now: NOW });
  for (const al of a) {
    assert.equal(typeof JSON.stringify(al), 'string');
  }
});

test('deterministic — same inputs same output', () => {
  const input = { evaluations: [failedEval()], now: NOW };
  assert.deepEqual(detectOutcomeAlerts(input), detectOutcomeAlerts(input));
});

test('single snapshot produces no spike/resurgence', () => {
  const a = detectOutcomeAlerts({ snapshots: [snap('n', '2026-05-01T00:00:00.000Z', 100, 30)], now: NOW });
  assert.equal(find(a, 'narrative_spike').length, 0);
  assert.equal(find(a, 'resurgence').length, 0);
});
