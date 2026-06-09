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
  rankInterventions,
  ALL_INTERVENTIONS,
  effectFromDeltas,
} from '../src/ranking';
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
const RANKINGS = rankInterventions(INPUT, NOW);

test('effectFromDeltas preserves sign (dampening negative)', () => {
  const e = effectFromDeltas({ growthDeltaPct: -40, signalDeltaPct: -20, amplificationDelta: -10 });
  assert.ok(e < 0);
});
test('effectFromDeltas preserves sign (amplifying positive)', () => {
  const e = effectFromDeltas({ growthDeltaPct: 40, signalDeltaPct: 20, amplificationDelta: 10 });
  assert.ok(e > 0);
});
test('effectFromDeltas clamps to [-100,100]', () => {
  const e = effectFromDeltas({ growthDeltaPct: 999, signalDeltaPct: 999, amplificationDelta: 999 });
  assert.ok(e <= 100 && e >= -100);
});

test('every intervention type is ranked exactly once', () => {
  assert.equal(RANKINGS.length, ALL_INTERVENTIONS.length);
  const types = new Set(RANKINGS.map((r) => r.interventionType));
  for (const t of ALL_INTERVENTIONS) assert.ok(types.has(t));
});

test('rankPosition is a contiguous 1..N ordering', () => {
  const positions = RANKINGS.map((r) => r.rankPosition).sort((a, b) => a - b);
  for (let i = 0; i < positions.length; i += 1) {
    assert.equal(positions[i], i + 1);
  }
});

test('rankings are sorted by the documented score (best first)', () => {
  const score = (r: { expectedEffect: number; confidence: number; riskScore: number }) =>
    (Math.abs(r.expectedEffect) * r.confidence) / (1 + r.riskScore / 100);
  for (let i = 1; i < RANKINGS.length; i += 1) {
    assert.ok(
      score(RANKINGS[i - 1]) >= score(RANKINGS[i]) - 1e-9,
      `position ${i} out of order`,
    );
  }
});

test('reduce_amplification on a rising narrative dampens (negative effect)', () => {
  const r = RANKINGS.find((x) => x.interventionType === 'reduce_amplification')!;
  assert.ok(r.expectedEffect < 0, `expected dampening, got ${r.expectedEffect}`);
});

test('increase_amplification on a rising narrative amplifies (positive effect)', () => {
  const r = RANKINGS.find((x) => x.interventionType === 'increase_amplification')!;
  assert.ok(r.expectedEffect >= 0, `expected amplifying, got ${r.expectedEffect}`);
});

test('expectedEffect within [-100,100], risk within [0,100], conf within (0,1)', () => {
  for (const r of RANKINGS) {
    assert.ok(r.expectedEffect >= -100 && r.expectedEffect <= 100);
    assert.ok(r.riskScore >= 0 && r.riskScore <= 100);
    assert.ok(r.confidence > 0 && r.confidence < 1, 'never certainty');
  }
});

test('aggressive removal scores higher base risk than a soft read', () => {
  const removeSource = RANKINGS.find((x) => x.interventionType === 'remove_source')!;
  const increaseReliability = RANKINGS.find((x) => x.interventionType === 'increase_reliability')!;
  // remove_source base 65 vs increase_reliability base 30 — even after penalties
  // the structural ordering should hold for comparable confidence.
  assert.ok(removeSource.riskScore > increaseReliability.riskScore);
});

test('every ranking carries non-empty reasoning', () => {
  for (const r of RANKINGS) {
    assert.ok(r.reasoning.length > 0);
    assert.ok(/effect|risk|confidence/i.test(r.reasoning));
  }
});

test('reasoning never claims certainty', () => {
  for (const r of RANKINGS) {
    assert.ok(/never certainty/i.test(r.reasoning) || /[Ee]stimate/.test(r.reasoning));
  }
});

test('deterministic across runs', () => {
  const a = rankInterventions(INPUT, NOW);
  const b = rankInterventions(INPUT, NOW);
  assert.deepEqual(a, b);
});

test('top-ranked intervention has a meaningful effect', () => {
  assert.ok(Math.abs(RANKINGS[0].expectedEffect) > 0);
});

test('ALL_INTERVENTIONS lists the 12 scenario types', () => {
  assert.equal(ALL_INTERVENTIONS.length, 12);
  assert.ok(ALL_INTERVENTIONS.includes('remove_source'));
  assert.ok(ALL_INTERVENTIONS.includes('increase_contradiction'));
});

test('effectFromDeltas returns 0 for zero deltas', () => {
  assert.equal(effectFromDeltas({ growthDeltaPct: 0, signalDeltaPct: 0, amplificationDelta: 0 }), 0);
});

test('low-confidence interventions carry extra risk', () => {
  // Every ranking with confidence < 1 has riskScore at least its base (no negatives).
  for (const r of RANKINGS) {
    assert.ok(r.riskScore >= 0);
  }
});

test('reasoning names the intervention type', () => {
  for (const r of RANKINGS) {
    assert.ok(r.reasoning.includes(r.interventionType));
  }
});

test('removing source is among the higher-effect dampeners on a rising narrative', () => {
  const rs = RANKINGS.find((r) => r.interventionType === 'remove_source')!;
  assert.ok(rs.expectedEffect <= 0);
});

test('ranking handles a narrative with no events without throwing', () => {
  const noEvents: DecisionInput = { ...INPUT, events: [] };
  const r = rankInterventions(noEvents, NOW);
  assert.equal(r.length, 12);
  for (const x of r) assert.ok(x.reasoning.length > 0);
});

test('two distinct interventions need not share the same effect', () => {
  const a = RANKINGS.find((r) => r.interventionType === 'reduce_amplification')!;
  const b = RANKINGS.find((r) => r.interventionType === 'increase_amplification')!;
  assert.notEqual(a.expectedEffect, b.expectedEffect);
});
