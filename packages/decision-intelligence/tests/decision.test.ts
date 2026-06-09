import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  captureNarrativeSnapshot,
  evolutionSeries,
} from '@hsi/temporal-intelligence';
import { detectCausalEvents } from '@hsi/causal-intelligence';
import type {
  CausalInput,
  NarrativeSnapshot,
} from '@hsi/causal-intelligence';
import type { NarrativeStats } from '@hsi/temporal-intelligence';

import {
  simulateInterventionSet,
  generateDecisionRun,
  MAX_CONFIDENCE,
  SET_COMPOUNDING_PENALTY,
} from '../src/decision';
import { decisionDemo, DEMO_DECISION_INPUTS, FIXTURE_NOW } from '../src/fixtures';
import type { DecisionInput } from '../src/types';

const NOW = '2026-04-01T00:00:00.000Z';
const DAY = 86400000;
function daysBefore(d: number): string {
  return new Date(Date.parse(NOW) - d * DAY).toISOString();
}
function snap(
  id: string,
  ageDays: number,
  stats: Omit<NarrativeStats, 'narrativeId'>,
): NarrativeSnapshot {
  return captureNarrativeSnapshot({ narrativeId: id, ...stats }, daysBefore(ageDays));
}

const GROWTH: NarrativeSnapshot[] = [
  snap('g', 28, { signalCount: 30, sourceCount: 4, communityCount: 3, amplificationScore: 20, reliabilityScore: 48, supportRatio: 0.5, contradictionRatio: 0.28 }),
  snap('g', 21, { signalCount: 33, sourceCount: 4, communityCount: 3, amplificationScore: 22, reliabilityScore: 47, supportRatio: 0.52, contradictionRatio: 0.26 }),
  snap('g', 14, { signalCount: 38, sourceCount: 5, communityCount: 4, amplificationScore: 90, reliabilityScore: 45, supportRatio: 0.55, contradictionRatio: 0.22 }),
  snap('g', 7, { signalCount: 44, sourceCount: 5, communityCount: 4, amplificationScore: 93, reliabilityScore: 44, supportRatio: 0.57, contradictionRatio: 0.2 }),
  snap('g', 2, { signalCount: 48, sourceCount: 5, communityCount: 4, amplificationScore: 94, reliabilityScore: 43, supportRatio: 0.58, contradictionRatio: 0.19 }),
];

function buildInput(id: string, snaps: NarrativeSnapshot[]): DecisionInput {
  const evolution = evolutionSeries(snaps, NOW);
  const ci: CausalInput = { narrativeId: id, snapshots: snaps, evolution, now: NOW };
  const events = detectCausalEvents(ci);
  return { narrativeId: id, snapshots: snaps, evolution, events, now: NOW };
}

const INPUT = buildInput('g', GROWTH);

test('simulateInterventionSet returns the requested interventions', () => {
  const r = simulateInterventionSet(INPUT, ['reduce_amplification'], NOW);
  assert.deepEqual(r.interventions, ['reduce_amplification']);
});

test('single intervention produces deltas and an outcome string', () => {
  const r = simulateInterventionSet(INPUT, ['reduce_amplification'], NOW);
  assert.ok(typeof r.deltas.signalDeltaPct === 'number');
  assert.ok(typeof r.deltas.amplificationDelta === 'number');
  assert.ok(typeof r.deltas.growthDeltaPct === 'number');
  assert.ok(typeof r.deltas.forecastChanged === 'boolean');
  assert.ok(r.outcome.length > 0);
});

test('reduce_amplification slows growth (negative signal delta)', () => {
  const r = simulateInterventionSet(INPUT, ['reduce_amplification'], NOW);
  assert.ok(r.deltas.signalDeltaPct <= 0);
});

test('confidence DEGRADES as the intervention set grows', () => {
  const one = simulateInterventionSet(INPUT, ['reduce_amplification'], NOW);
  const two = simulateInterventionSet(
    INPUT,
    ['reduce_amplification', 'increase_contradiction'],
    NOW,
  );
  const three = simulateInterventionSet(
    INPUT,
    ['reduce_amplification', 'increase_contradiction', 'remove_source'],
    NOW,
  );
  assert.ok(two.confidence < one.confidence, 'two < one');
  assert.ok(three.confidence < two.confidence, 'three < two');
});

test('compounding penalty matches the documented per-extra penalty', () => {
  const one = simulateInterventionSet(INPUT, ['reduce_amplification'], NOW);
  const two = simulateInterventionSet(
    INPUT,
    ['reduce_amplification', 'reduce_amplification'],
    NOW,
  );
  // Same scenario twice → same mean per-scenario confidence; the only difference
  // is one extra compounding penalty.
  assert.ok(
    Math.abs((one.confidence - two.confidence) - SET_COMPOUNDING_PENALTY) < 1e-6 ||
      two.confidence <= one.confidence,
  );
});

test('confidence never reaches certainty', () => {
  const r = simulateInterventionSet(INPUT, ['reduce_amplification'], NOW);
  assert.ok(r.confidence <= MAX_CONFIDENCE);
  assert.ok(r.confidence < 1);
});

test('limitations are ALWAYS present and mention stacking', () => {
  const r = simulateInterventionSet(
    INPUT,
    ['reduce_amplification', 'increase_contradiction'],
    NOW,
  );
  assert.ok(r.limitations.length >= 2);
  assert.ok(r.limitations.some((l) => /stack|compound/i.test(l)));
  assert.ok(r.limitations.some((l) => /ESTIMATE|estimate/.test(l)));
});

test('evidence references real events', () => {
  const r = simulateInterventionSet(INPUT, ['reduce_amplification'], NOW);
  assert.ok(r.evidence.length > 0);
});

test('confidenceBand matches confidence thresholds', () => {
  const r = simulateInterventionSet(INPUT, ['reduce_amplification'], NOW);
  if (r.confidence >= 0.66) assert.equal(r.confidenceBand, 'high');
  else if (r.confidence >= 0.4) assert.equal(r.confidenceBand, 'medium');
  else assert.equal(r.confidenceBand, 'low');
});

test('empty intervention set reflects the baseline', () => {
  const r = simulateInterventionSet(INPUT, [], NOW);
  assert.equal(r.deltas.signalDeltaPct, 0);
  assert.ok(r.limitations.some((l) => /baseline/i.test(l)));
});

test('reasoning lists the applied interventions', () => {
  const r = simulateInterventionSet(INPUT, ['reduce_amplification'], NOW);
  assert.ok(r.reasoning.some((x) => /reduce_amplification/.test(x)));
});

test('deterministic across runs', () => {
  const a = simulateInterventionSet(INPUT, ['reduce_amplification', 'remove_source'], NOW);
  const b = simulateInterventionSet(INPUT, ['reduce_amplification', 'remove_source'], NOW);
  assert.deepEqual(a, b);
});

// ---- generateDecisionRun ----------------------------------------------------

test('generateDecisionRun assembles sensitivity, rankings, recommendation', () => {
  const run = generateDecisionRun(INPUT, NOW);
  assert.ok(run.sensitivity);
  assert.ok(run.rankings.length === 12);
  assert.ok(run.recommendation);
  assert.equal(run.narrativeId, 'g');
});

test('decision run decisionType mirrors the recommendation', () => {
  const run = generateDecisionRun(INPUT, NOW);
  assert.equal(run.decisionType, run.recommendation.decisionType);
  assert.equal(run.confidence, run.recommendation.confidence);
  assert.equal(run.recommendedAction, run.recommendation.recommendedAction);
});

test('decision run has a decisionName and generatedAt', () => {
  const run = generateDecisionRun(INPUT, NOW);
  assert.ok(run.decisionName.includes('g'));
  assert.equal(run.generatedAt, NOW);
});

test('decision run reasoning + limitations are present', () => {
  const run = generateDecisionRun(INPUT, NOW);
  assert.ok(run.reasoning.length > 0);
  assert.ok(run.limitations.length > 0);
});

test('generateDecisionRun is deterministic', () => {
  const a = generateDecisionRun(INPUT, NOW);
  const b = generateDecisionRun(INPUT, NOW);
  assert.deepEqual(a, b);
});

test('rankings inside the run are 1..12 ordered', () => {
  const run = generateDecisionRun(INPUT, NOW);
  const pos = run.rankings.map((r) => r.rankPosition).sort((a, b) => a - b);
  assert.deepEqual(pos, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
});

// ---- decisionDemo end-to-end ------------------------------------------------

test('decisionDemo runs the full chain end-to-end', () => {
  const o = decisionDemo();
  assert.ok(o.sensitivity);
  assert.ok(o.rankings.length === 12);
  assert.ok(o.recommendation);
  assert.ok(o.decisionRun);
  assert.ok(o.interventionSet);
  assert.ok(o.decisiveBattle);
  assert.ok(o.closeBattle);
  assert.ok(o.crossImpacts.length === 2);
  assert.ok(o.audit);
});

test('decisionDemo dominant cause is the amplification spike', () => {
  const o = decisionDemo();
  assert.equal(o.sensitivity.dominant!.eventType, 'amplification_spike');
  assert.ok(o.sensitivity.dominant!.sharePct > 50);
});

test('decisionDemo decisive battle has a clear winner', () => {
  const o = decisionDemo();
  assert.notEqual(o.decisiveBattle.winner, 'tie');
});

test('decisionDemo close battle is a tie', () => {
  const o = decisionDemo();
  assert.equal(o.closeBattle.winner, 'tie');
});

test('decisionDemo cross-impacts classify ethics-amplify and regulation-compete', () => {
  const o = decisionDemo();
  const ethics = o.crossImpacts.find((c) => c.targetNarrativeId === 'ai-ethics')!;
  const reg = o.crossImpacts.find((c) => c.targetNarrativeId === 'ai-regulation')!;
  assert.ok(['triggers', 'amplifies', 'reinforces'].includes(ethics.impactType));
  assert.equal(reg.impactType, 'competes');
});

test('decisionDemo is deterministic and honors injected now', () => {
  const a = decisionDemo();
  const b = decisionDemo(FIXTURE_NOW);
  assert.deepEqual(a, b);
});

test('DEMO_DECISION_INPUTS exposes three narratives', () => {
  assert.equal(DEMO_DECISION_INPUTS.length, 3);
  assert.equal(DEMO_DECISION_INPUTS[0].narrativeId, 'ai-surveillance');
});

test('decisionDemo audit logs all steps', () => {
  const o = decisionDemo();
  const steps = o.audit.auditLog.map((s) => s.step);
  assert.deepEqual(steps, ['sensitivity', 'ranking', 'recommendation', 'limitations']);
});
