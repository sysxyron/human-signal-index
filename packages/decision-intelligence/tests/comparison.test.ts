import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  captureNarrativeSnapshot,
  evolutionSeries,
  forecastNarrativeTrajectory,
} from '@hsi/temporal-intelligence';
import { detectCausalEvents } from '@hsi/causal-intelligence';
import type {
  CausalInput,
  NarrativeSnapshot,
} from '@hsi/causal-intelligence';
import type { NarrativeStats } from '@hsi/temporal-intelligence';

import { compareScenarios, TIE_MARGIN } from '../src/comparison';
import {
  computeCrossNarrativeImpact,
} from '../src/crossNarrative';
import type { CrossNarrativeTarget } from '../src/crossNarrative';
import { buildDecisionAudit } from '../src/audit';
import { generateDecisionRun } from '../src/decision';
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

const GROWTH: NarrativeSnapshot[] = [
  sn('g', 28, { signalCount: 30, sourceCount: 4, communityCount: 3, amplificationScore: 20, reliabilityScore: 48, supportRatio: 0.5, contradictionRatio: 0.28 }),
  sn('g', 21, { signalCount: 33, sourceCount: 4, communityCount: 3, amplificationScore: 22, reliabilityScore: 47, supportRatio: 0.52, contradictionRatio: 0.26 }),
  sn('g', 14, { signalCount: 38, sourceCount: 5, communityCount: 4, amplificationScore: 90, reliabilityScore: 45, supportRatio: 0.55, contradictionRatio: 0.22 }),
  sn('g', 7, { signalCount: 44, sourceCount: 5, communityCount: 4, amplificationScore: 93, reliabilityScore: 44, supportRatio: 0.57, contradictionRatio: 0.2 }),
  sn('g', 2, { signalCount: 48, sourceCount: 5, communityCount: 4, amplificationScore: 94, reliabilityScore: 43, supportRatio: 0.58, contradictionRatio: 0.19 }),
];
const INPUT = inp('g', GROWTH);

// ---- War-gaming -------------------------------------------------------------

test('A beats B when A acts and B does nothing', () => {
  const r = compareScenarios(
    INPUT,
    { name: 'Damp', interventions: ['reduce_amplification'] },
    { name: 'Nothing', interventions: [] },
    NOW,
  );
  assert.equal(r.winner, 'A');
});

test('B beats A when B acts and A does nothing (symmetry)', () => {
  const r = compareScenarios(
    INPUT,
    { name: 'Nothing', interventions: [] },
    { name: 'Damp', interventions: ['reduce_amplification'] },
    NOW,
  );
  assert.equal(r.winner, 'B');
});

test('equal-and-opposite single levers tie', () => {
  const r = compareScenarios(
    INPUT,
    { name: 'Delay', interventions: ['delay_event'] },
    { name: 'Accelerate', interventions: ['accelerate_event'] },
    NOW,
  );
  assert.equal(r.winner, 'tie');
});

test('tie margin threshold is honored', () => {
  const r = compareScenarios(
    INPUT,
    { name: 'Delay', interventions: ['delay_event'] },
    { name: 'Accelerate', interventions: ['accelerate_event'] },
    NOW,
  );
  assert.ok(Math.abs(r.metrics.a.score - r.metrics.b.score) <= TIE_MARGIN);
});

test('metrics are populated for both scenarios', () => {
  const r = compareScenarios(
    INPUT,
    { name: 'Damp', interventions: ['reduce_amplification'] },
    { name: 'Nothing', interventions: [] },
    NOW,
  );
  for (const m of [r.metrics.a, r.metrics.b]) {
    assert.ok('score' in m);
    assert.ok('confidence' in m);
    assert.ok('signalDeltaPct' in m);
    assert.ok('forecastChanged' in m);
  }
});

test('winner reasoning explains the verdict', () => {
  const r = compareScenarios(
    INPUT,
    { name: 'Damp', interventions: ['reduce_amplification'] },
    { name: 'Nothing', interventions: [] },
    NOW,
  );
  assert.ok(r.reasoning.length >= 3);
  assert.ok(r.reasoning.some((x) => /Winner/.test(x)));
});

test('tie reasoning explains the near-tie', () => {
  const r = compareScenarios(
    INPUT,
    { name: 'Delay', interventions: ['delay_event'] },
    { name: 'Accelerate', interventions: ['accelerate_event'] },
    NOW,
  );
  assert.ok(r.reasoning.some((x) => /indistinguishable|tie threshold/i.test(x)));
});

test('comparison never claims certainty', () => {
  const r = compareScenarios(
    INPUT,
    { name: 'Damp', interventions: ['reduce_amplification'] },
    { name: 'Nothing', interventions: [] },
    NOW,
  );
  assert.ok(r.confidence < 1);
  assert.ok(r.limitations.some((l) => /never a certainty|ESTIMATE|estimate/.test(l)));
});

test('verdict confidence is bounded by the weaker scenario', () => {
  const r = compareScenarios(
    INPUT,
    { name: 'Damp', interventions: ['reduce_amplification'] },
    { name: 'Nothing', interventions: [] },
    NOW,
  );
  assert.ok(r.confidence <= Math.min(r.metrics.a.confidence, r.metrics.b.confidence) + 1e-9);
});

test('comparison is deterministic', () => {
  const a = compareScenarios(INPUT, { name: 'X', interventions: ['reduce_amplification'] }, { name: 'Y', interventions: ['remove_source'] }, NOW);
  const b = compareScenarios(INPUT, { name: 'X', interventions: ['reduce_amplification'] }, { name: 'Y', interventions: ['remove_source'] }, NOW);
  assert.deepEqual(a, b);
});

// ---- Cross-narrative impact -------------------------------------------------

const SRC = inp('src', GROWTH); // rising source

const ETHICS_RISING: CrossNarrativeTarget = {
  narrativeId: 'ethics',
  snapshots: [
    { capturedAt: db(28), signalCount: 6, amplificationScore: 20 },
    { capturedAt: db(14), signalCount: 22, amplificationScore: 70 },
    { capturedAt: db(2), signalCount: 48, amplificationScore: 90 },
  ],
  influenceFromSource: 78,
  sharedCommunities: 3,
  sharedSources: 3,
};

const REGULATION_FALLING: CrossNarrativeTarget = {
  narrativeId: 'regulation',
  snapshots: [
    { capturedAt: db(28), signalCount: 50, amplificationScore: 72 },
    { capturedAt: db(14), signalCount: 30, amplificationScore: 55 },
    { capturedAt: db(2), signalCount: 14, amplificationScore: 38 },
  ],
  influenceFromSource: 44,
  sharedCommunities: 3,
  sharedSources: 3,
};

const WEAK: CrossNarrativeTarget = {
  narrativeId: 'weak',
  snapshots: [
    { capturedAt: db(28), signalCount: 5, amplificationScore: 10 },
    { capturedAt: db(2), signalCount: 6, amplificationScore: 12 },
  ],
  influenceFromSource: 0,
  sharedCommunities: 0,
  sharedSources: 0,
};

test('high-influence co-moving target is classified triggers/amplifies', () => {
  const out = computeCrossNarrativeImpact(SRC, [ETHICS_RISING], NOW);
  assert.ok(['triggers', 'amplifies', 'reinforces'].includes(out[0].impactType));
});

test('shared-audience opposite-trajectory target is competes', () => {
  const out = computeCrossNarrativeImpact(SRC, [REGULATION_FALLING], NOW);
  const reg = out.find((c) => c.targetNarrativeId === 'regulation')!;
  assert.equal(reg.impactType, 'competes');
});

test('weakly coupled target is neutral with low strength', () => {
  const out = computeCrossNarrativeImpact(SRC, [WEAK], NOW);
  const w = out.find((c) => c.targetNarrativeId === 'weak')!;
  assert.equal(w.impactType, 'neutral');
  assert.ok(w.impactStrength < 30);
});

test('impacts are sorted by strength descending', () => {
  const out = computeCrossNarrativeImpact(SRC, [WEAK, ETHICS_RISING, REGULATION_FALLING], NOW);
  for (let i = 1; i < out.length; i += 1) {
    assert.ok(out[i - 1].impactStrength >= out[i].impactStrength - 1e-9);
  }
});

test('stronger coupling outranks weaker coupling', () => {
  const out = computeCrossNarrativeImpact(SRC, [WEAK, ETHICS_RISING], NOW);
  assert.equal(out[0].targetNarrativeId, 'ethics');
});

test('cross-impact strength within 0..100 and confidence within bounds', () => {
  const out = computeCrossNarrativeImpact(SRC, [ETHICS_RISING, REGULATION_FALLING, WEAK], NOW);
  for (const c of out) {
    assert.ok(c.impactStrength >= 0 && c.impactStrength <= 100);
    assert.ok(c.confidence > 0 && c.confidence < 1);
    assert.ok(c.reasoning.length > 0);
  }
});

test('cross-impact is deterministic', () => {
  const a = computeCrossNarrativeImpact(SRC, [ETHICS_RISING, REGULATION_FALLING], NOW);
  const b = computeCrossNarrativeImpact(SRC, [ETHICS_RISING, REGULATION_FALLING], NOW);
  assert.deepEqual(a, b);
});

// ---- Audit ------------------------------------------------------------------

test('buildDecisionAudit logs every step', () => {
  const run = generateDecisionRun(INPUT, NOW);
  const audit = buildDecisionAudit(run, NOW);
  const steps = audit.auditLog.map((s) => s.step);
  assert.ok(steps.includes('sensitivity'));
  assert.ok(steps.includes('ranking'));
  assert.ok(steps.includes('recommendation'));
  assert.ok(steps.includes('limitations'));
});

test('audit carries confidence and limitations from the run', () => {
  const run = generateDecisionRun(INPUT, NOW);
  const audit = buildDecisionAudit(run, NOW);
  assert.equal(audit.confidence, run.confidence);
  assert.ok(audit.limitations.length > 0);
});

test('audit each step has a detail string and timestamp', () => {
  const run = generateDecisionRun(INPUT, NOW);
  const audit = buildDecisionAudit(run, NOW);
  for (const s of audit.auditLog) {
    assert.ok(s.detail.length > 0);
    assert.equal(s.at, NOW);
  }
});

test('audit decisionOutput summarizes the run (no black-box)', () => {
  const run = generateDecisionRun(INPUT, NOW);
  const audit = buildDecisionAudit(run, NOW);
  assert.equal(audit.decisionOutput.narrativeId, 'g');
  assert.equal(audit.decisionOutput.decisionType, run.decisionType);
  assert.ok('dominantCause' in audit.decisionOutput);
  assert.ok('topIntervention' in audit.decisionOutput);
});

test('audit is deterministic', () => {
  const run = generateDecisionRun(INPUT, NOW);
  const a = buildDecisionAudit(run, NOW);
  const b = buildDecisionAudit(run, NOW);
  assert.deepEqual(a, b);
});

test('audit recommendation step records confidence and reasoning', () => {
  const run = generateDecisionRun(INPUT, NOW);
  const audit = buildDecisionAudit(run, NOW);
  const rec = audit.auditLog.find((s) => s.step === 'recommendation')!;
  assert.ok(/Confidence \d+%/.test(rec.detail));
  assert.ok(/Reasoning:/.test(rec.detail));
});

test('audit sensitivity step records the dominant cause', () => {
  const run = generateDecisionRun(INPUT, NOW);
  const audit = buildDecisionAudit(run, NOW);
  const sens = audit.auditLog.find((s) => s.step === 'sensitivity')!;
  assert.ok(/Dominant cause|No dominant/.test(sens.detail));
  assert.ok(/unexplained/.test(sens.detail));
});

test('audit decisionRunId encodes narrative and timestamp', () => {
  const run = generateDecisionRun(INPUT, NOW);
  const audit = buildDecisionAudit(run, NOW);
  assert.ok(audit.decisionRunId!.startsWith('g@'));
});

// ---- More cross-narrative classification depth ------------------------------

test('a co-moving but low-influence overlap target leans amplifies/reinforces', () => {
  const target: CrossNarrativeTarget = {
    narrativeId: 'co',
    snapshots: [
      { capturedAt: db(28), signalCount: 10, amplificationScore: 90 },
      { capturedAt: db(2), signalCount: 40, amplificationScore: 92 },
    ],
    influenceFromSource: 30,
    sharedCommunities: 4,
    sharedSources: 3,
  };
  const out = computeCrossNarrativeImpact(SRC, [target], NOW);
  assert.ok(['amplifies', 'reinforces'].includes(out[0].impactType));
});

test('very high influence is classified triggers', () => {
  const target: CrossNarrativeTarget = {
    narrativeId: 'trig',
    snapshots: [
      { capturedAt: db(28), signalCount: 5, amplificationScore: 50 },
      { capturedAt: db(2), signalCount: 30, amplificationScore: 80 },
    ],
    influenceFromSource: 85,
    sharedCommunities: 2,
    sharedSources: 2,
  };
  const out = computeCrossNarrativeImpact(SRC, [target], NOW);
  assert.equal(out[0].impactType, 'triggers');
});

test('confidence rises with richer evidence', () => {
  const rich = computeCrossNarrativeImpact(SRC, [ETHICS_RISING], NOW)[0];
  const poor = computeCrossNarrativeImpact(SRC, [WEAK], NOW)[0];
  assert.ok(rich.confidence > poor.confidence);
});

test('falls back to source.influenceOut edges when influenceFromSource absent', () => {
  const srcWithEdges: DecisionInput = {
    ...SRC,
    influenceOut: [
      {
        sourceNarrativeId: 'src',
        targetNarrativeId: 'edgeTgt',
        influenceScore: 80,
        sharedEntities: 2,
        sharedSources: 2,
        sharedCommunities: 2,
        rationale: 'edge',
        createdAt: NOW,
      },
    ],
  };
  const target: CrossNarrativeTarget = {
    narrativeId: 'edgeTgt',
    snapshots: [
      { capturedAt: db(28), signalCount: 5, amplificationScore: 50 },
      { capturedAt: db(2), signalCount: 30, amplificationScore: 80 },
    ],
    sharedCommunities: 2,
    sharedSources: 2,
  };
  const out = computeCrossNarrativeImpact(srcWithEdges, [target], NOW);
  assert.equal(out[0].impactType, 'triggers');
});

test('empty targets list returns empty impacts', () => {
  const out = computeCrossNarrativeImpact(SRC, [], NOW);
  assert.deepEqual(out, []);
});

test('A-wins and B-wins are mirror images on score', () => {
  const ab = compareScenarios(INPUT, { name: 'A', interventions: ['reduce_amplification'] }, { name: 'B', interventions: [] }, NOW);
  const ba = compareScenarios(INPUT, { name: 'A', interventions: [] }, { name: 'B', interventions: ['reduce_amplification'] }, NOW);
  assert.equal(ab.metrics.a.score, ba.metrics.b.score);
  assert.equal(ab.metrics.b.score, ba.metrics.a.score);
});

test('scenario metrics report interventionCount', () => {
  const r = compareScenarios(INPUT, { name: 'A', interventions: ['reduce_amplification', 'remove_source'] }, { name: 'B', interventions: ['delay_event'] }, NOW);
  assert.equal(r.metrics.a.interventionCount, 2);
  assert.equal(r.metrics.b.interventionCount, 1);
});
