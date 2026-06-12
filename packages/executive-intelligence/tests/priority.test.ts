import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PRIORITY_WEIGHTS,
  attentionForScore,
  buildPriorityExplanation,
  computeConfidenceWeight,
  computeEvidenceWeight,
  computeImpact,
  computePriorityScore,
  computeUrgency,
  rankPriority,
} from '../src/priority';
import type { PriorityInput } from '../src/types';

function input(o: Partial<PriorityInput> = {}): PriorityInput {
  return { id: 'p', kind: 'risk', title: 't', urgency: 0.5, impact: 0.5, confidence: 0.5, evidenceStrength: 0.5, ...o };
}

test('priority weights sum to 1', () => {
  const sum = PRIORITY_WEIGHTS.urgency + PRIORITY_WEIGHTS.impact + PRIORITY_WEIGHTS.confidence + PRIORITY_WEIGHTS.evidence;
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test('score in [0,100]', () => {
  assert.ok(computePriorityScore(input()) >= 0 && computePriorityScore(input()) <= 100);
});

test('higher urgency + impact → higher score', () => {
  assert.ok(computePriorityScore(input({ urgency: 0.9, impact: 0.9 })) > computePriorityScore(input({ urgency: 0.1, impact: 0.1 })));
});

test('risk modifier raises score', () => {
  assert.ok(computePriorityScore(input({ riskScore: 0.9 })) > computePriorityScore(input({ riskScore: 0 })));
});

test('opportunity modifier raises score', () => {
  assert.ok(computePriorityScore(input({ opportunityScore: 0.9 })) > computePriorityScore(input({ opportunityScore: 0 })));
});

test('low trust raises score', () => {
  assert.ok(computePriorityScore(input({ trustScore: 10 })) > computePriorityScore(input({ trustScore: 90 })));
});

test('contested consensus raises score', () => {
  assert.ok(computePriorityScore(input({ consensusAgreement: 0.2 })) > computePriorityScore(input({ consensusAgreement: 0.95 })));
});

test('governance pending raises score', () => {
  assert.ok(computePriorityScore(input({ governancePending: true })) > computePriorityScore(input({ governancePending: false })));
});

test('computeUrgency defaults from category', () => {
  assert.ok(computeUrgency(input({ urgency: undefined, governancePending: true })) >= 0.7);
});

test('computeImpact defaults from risk', () => {
  assert.ok(computeImpact(input({ impact: undefined, riskScore: 0.9 })) >= 0.9);
});

test('confidence/evidence weights default neutral', () => {
  assert.equal(computeConfidenceWeight(input({ confidence: undefined })), 0.5);
  assert.equal(computeEvidenceWeight(input({ evidenceStrength: undefined })), 0.5);
});

test('attentionForScore buckets', () => {
  assert.equal(attentionForScore(80), 'urgent');
  assert.equal(attentionForScore(60), 'elevated');
  assert.equal(attentionForScore(45), 'notable');
  assert.equal(attentionForScore(20), 'routine');
});

test('buildPriorityExplanation enumerates factors', () => {
  const exp = buildPriorityExplanation(input({ riskScore: 0.8 }));
  assert.ok(exp.length >= 2);
  assert.ok(exp.some((l) => /risk/i.test(l)));
});

test('rankPriority orders high→low with ranks', () => {
  const ranked = rankPriority([
    input({ id: 'a', urgency: 0.2, impact: 0.2 }),
    input({ id: 'b', urgency: 0.9, impact: 0.9, riskScore: 0.9 }),
    input({ id: 'c', urgency: 0.5, impact: 0.5 }),
  ]);
  assert.equal(ranked[0].id, 'b');
  assert.equal(ranked[0].rank, 1);
  for (let i = 1; i < ranked.length; i++) assert.ok(ranked[i - 1].score >= ranked[i].score);
});

test('ranked priorities are explainable + limited', () => {
  const ranked = rankPriority([input()]);
  assert.ok(ranked[0].explanation.length > 0);
  assert.ok(ranked[0].limitations.length > 0);
  assert.ok(ranked[0].recommendation.length > 0);
});

test('missing signals add a limitation', () => {
  const ranked = rankPriority([input({ urgency: undefined, impact: undefined })]);
  assert.ok(ranked[0].limitations.some((l) => /defaulted to a neutral/.test(l)));
});

test('every priority is advisory', () => {
  const ranked = rankPriority([input()]);
  assert.ok(ranked[0].limitations.some((l) => /advisory|Human review/i.test(l)));
});

test('recommendation varies by kind', () => {
  const risk = rankPriority([input({ kind: 'risk' })])[0];
  const opp = rankPriority([input({ kind: 'opportunity' })])[0];
  assert.notEqual(risk.recommendation, opp.recommendation);
});

test('deterministic ranking', () => {
  const inputs = [input({ id: 'a' }), input({ id: 'b', riskScore: 0.8 })];
  assert.deepEqual(rankPriority(inputs), rankPriority(inputs));
});

test('empty input → empty ranking', () => {
  assert.deepEqual(rankPriority([]), []);
});
