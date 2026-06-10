import { test } from 'node:test';
import assert from 'node:assert/strict';

import { evaluateOutcome } from '../src/outcome';
import {
  learnFromOutcomes,
  calibratedConfidenceFor,
  tagInterventionType,
  evaluationInterventionType,
} from '../src/learning';
import type {
  ConfidenceLearningEntry,
  ObservedData,
  OutcomeEvaluation,
  RecommendationRef,
} from '../src/types';

const NOW = '2026-06-01T00:00:00.000Z';

let counter = 0;
function rec(type: string, effect = -40): RecommendationRef {
  counter += 1;
  return {
    recommendationId: `r-${type}-${counter}`,
    decisionRunId: `run-${counter}`,
    interventionType: type,
    recommendedAction: 'act',
    expectedEffect: effect,
    confidenceBefore: 0.5,
    expectedOutcome: { signalDeltaPct: effect },
  };
}
function evalFor(type: string, observed: ObservedData, effect = -40): OutcomeEvaluation {
  const r = rec(type, effect);
  return tagInterventionType(evaluateOutcome(r, observed, NOW), type);
}
const win = (): ObservedData => ({ signalDeltaPct: -41, capturedAt: NOW });
const lose = (): ObservedData => ({ signalDeltaPct: 40, capturedAt: NOW });

test('repeated success raises calibratedConfidence above prior baseline', () => {
  const evals = [evalFor('T', win()), evalFor('T', win()), evalFor('T', win()), evalFor('T', win())];
  const learned = learnFromOutcomes(evals, undefined, NOW);
  const entry = learned.find((l) => l.interventionType === 'T')!;
  assert.ok(entry.calibratedConfidence > 0.5);
  assert.equal(entry.successCount, 4);
  assert.equal(entry.sampleCount, 4);
});

test('repeated failure lowers calibratedConfidence below prior baseline', () => {
  const evals = [evalFor('F', lose()), evalFor('F', lose()), evalFor('F', lose()), evalFor('F', lose())];
  const learned = learnFromOutcomes(evals, undefined, NOW);
  const entry = learned.find((l) => l.interventionType === 'F')!;
  assert.ok(entry.calibratedConfidence < 0.5);
  assert.equal(entry.successCount, 0);
});

test('confidence rises monotonically as more successes accumulate', () => {
  let prior: ConfidenceLearningEntry[] | undefined = undefined;
  let last = 0.5;
  for (let i = 0; i < 5; i++) {
    prior = learnFromOutcomes([evalFor('M', win())], prior, NOW);
    const c = calibratedConfidenceFor('M', prior)!;
    assert.ok(c >= last - 1e-9);
    last = c;
  }
  assert.ok(last > 0.5);
});

test('confidence falls as more failures accumulate', () => {
  let prior: ConfidenceLearningEntry[] | undefined = undefined;
  let last = 0.5;
  for (let i = 0; i < 5; i++) {
    prior = learnFromOutcomes([evalFor('MF', lose())], prior, NOW);
    const c = calibratedConfidenceFor('MF', prior)!;
    assert.ok(c <= last + 1e-9);
    last = c;
  }
  assert.ok(last < 0.5);
});

test('merge with prior is incremental — sampleCount accumulates', () => {
  const first = learnFromOutcomes([evalFor('I', win()), evalFor('I', win())], undefined, NOW);
  const second = learnFromOutcomes([evalFor('I', win())], first, NOW);
  const entry = second.find((l) => l.interventionType === 'I')!;
  assert.equal(entry.sampleCount, 3);
  assert.equal(entry.successCount, 3);
});

test('weighting by sampleCount — more samples shift confidence further', () => {
  const few = learnFromOutcomes([evalFor('W', win())], undefined, NOW);
  const many = learnFromOutcomes(
    [evalFor('W', win()), evalFor('W', win()), evalFor('W', win()), evalFor('W', win()), evalFor('W', win())],
    undefined,
    NOW,
  );
  const fewC = calibratedConfidenceFor('W', few)!;
  const manyC = calibratedConfidenceFor('W', many)!;
  assert.ok(manyC > fewC);
});

test('calibratedConfidence bounded in [0.02, 0.95]', () => {
  const allWin = Array.from({ length: 50 }, () => evalFor('B', win()));
  const allLose = Array.from({ length: 50 }, () => evalFor('BL', lose()));
  const w = learnFromOutcomes(allWin, undefined, NOW);
  const l = learnFromOutcomes(allLose, undefined, NOW);
  const wc = calibratedConfidenceFor('B', w)!;
  const lc = calibratedConfidenceFor('BL', l)!;
  assert.ok(wc <= 0.95 && wc >= 0.02);
  assert.ok(lc <= 0.95 && lc >= 0.02);
});

test('calibratedConfidenceFor returns undefined for unknown type', () => {
  const learned = learnFromOutcomes([evalFor('K', win())], undefined, NOW);
  assert.equal(calibratedConfidenceFor('nope', learned), undefined);
});

test('avgSuccessScore is the mean over samples', () => {
  const evals = [evalFor('AVG', win()), evalFor('AVG', win())];
  const learned = learnFromOutcomes(evals, undefined, NOW);
  const entry = learned.find((l) => l.interventionType === 'AVG')!;
  assert.ok(entry.avgSuccessScore > 50);
});

test('adjustment is signed: positive on success', () => {
  const learned = learnFromOutcomes([evalFor('PA', win()), evalFor('PA', win())], undefined, NOW);
  const entry = learned.find((l) => l.interventionType === 'PA')!;
  assert.ok(entry.adjustment > 0);
});

test('adjustment negative on repeated failure with high prior', () => {
  const prior: ConfidenceLearningEntry[] = [
    {
      interventionType: 'NA',
      sampleCount: 2,
      successCount: 2,
      avgSuccessScore: 90,
      calibratedConfidence: 0.8,
      adjustment: 0.3,
      rationale: 'seed',
    },
  ];
  const learned = learnFromOutcomes([evalFor('NA', lose()), evalFor('NA', lose())], prior, NOW);
  const entry = learned.find((l) => l.interventionType === 'NA')!;
  assert.ok(entry.adjustment < 0);
});

test('rationale explains successes over samples', () => {
  const learned = learnFromOutcomes(
    [evalFor('RT', win()), evalFor('RT', win()), evalFor('RT', win())],
    undefined,
    NOW,
  );
  const entry = learned.find((l) => l.interventionType === 'RT')!;
  assert.match(entry.rationale, /3\/3 successes over 3 samples/);
});

test('prior-only types are carried forward', () => {
  const prior: ConfidenceLearningEntry[] = [
    {
      interventionType: 'CARRY',
      sampleCount: 5,
      successCount: 4,
      avgSuccessScore: 80,
      calibratedConfidence: 0.7,
      adjustment: 0.2,
      rationale: 'seed',
    },
  ];
  const learned = learnFromOutcomes([evalFor('OTHER', win())], prior, NOW);
  assert.ok(learned.some((l) => l.interventionType === 'CARRY'));
  assert.ok(learned.some((l) => l.interventionType === 'OTHER'));
});

test('partially_successful counts as a success', () => {
  // undershoot → partially_successful
  const e = evalFor('PART', { signalDeltaPct: -22, capturedAt: NOW });
  assert.equal(e.outcomeStatus, 'partially_successful');
  const learned = learnFromOutcomes([e], undefined, NOW);
  assert.equal(learned.find((l) => l.interventionType === 'PART')!.successCount, 1);
});

test('output sorted by interventionType deterministically', () => {
  const learned = learnFromOutcomes(
    [evalFor('zeta', win()), evalFor('alpha', win()), evalFor('mid', win())],
    undefined,
    NOW,
  );
  const types = learned.map((l) => l.interventionType);
  assert.deepEqual(types, [...types].sort());
});

test('deterministic — same inputs same output', () => {
  const e1 = [evalFor('D', win()), evalFor('D', lose())];
  const a = learnFromOutcomes(e1, undefined, NOW);
  const b = learnFromOutcomes(e1, undefined, NOW);
  assert.deepEqual(a, b);
});

test('empty evaluations + prior holds baseline', () => {
  const prior: ConfidenceLearningEntry[] = [
    {
      interventionType: 'H',
      sampleCount: 2,
      successCount: 1,
      avgSuccessScore: 60,
      calibratedConfidence: 0.5,
      adjustment: 0,
      rationale: 'seed',
    },
  ];
  const learned = learnFromOutcomes([], prior, NOW);
  const entry = learned.find((l) => l.interventionType === 'H')!;
  assert.equal(entry.sampleCount, 2);
});

test('tagInterventionType + evaluationInterventionType round-trip', () => {
  const e = evalFor('TAGGED', win());
  assert.equal(evaluationInterventionType(e), 'TAGGED');
});

test('untagged evaluation groups by run id fallback', () => {
  const r = rec('untagged-type');
  const e = evaluateOutcome(r, win(), NOW); // not tagged
  const learned = learnFromOutcomes([e], undefined, NOW);
  assert.ok(learned.some((l) => l.interventionType === `run:${r.decisionRunId}`));
});

test('mixed success and failure yields intermediate confidence', () => {
  const learned = learnFromOutcomes(
    [evalFor('MIX', win()), evalFor('MIX', win()), evalFor('MIX', lose()), evalFor('MIX', lose())],
    undefined,
    NOW,
  );
  const c = calibratedConfidenceFor('MIX', learned)!;
  assert.ok(c > 0.3 && c < 0.7);
});
