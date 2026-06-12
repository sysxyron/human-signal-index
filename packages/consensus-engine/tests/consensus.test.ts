import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CONSENSUS_WEIGHTS,
  buildConsensusSnapshot,
  computeAgreementScore,
  computeConfidenceDistribution,
  computeConsensus,
  computeDissent,
  computeEvidenceSupport,
  findingWeight,
  positionWeights,
} from '../src/consensus';
import { DEMO_FINDINGS, FIXTURE_NOW } from '../src/fixtures';
import type { ConsensusFinding } from '../src/types';

const NOW = FIXTURE_NOW;

function f(overrides: Partial<ConsensusFinding> = {}): ConsensusFinding {
  return { id: 'f', position: 'P', contributorId: 'c', confidence: 0.7, evidenceStrength: 0.7, contributorTrust: 70, ...overrides };
}

test('weights base components sum to 1', () => {
  const sum = CONSENSUS_WEIGHTS.evidence + CONSENSUS_WEIGHTS.trust + CONSENSUS_WEIGHTS.accuracy + CONSENSUS_WEIGHTS.governance;
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test('findingWeight in [0,1]', () => {
  assert.ok(findingWeight(f()) >= 0 && findingWeight(f()) <= 1);
});

test('stronger evidence + trust → higher weight', () => {
  const lo = findingWeight(f({ evidenceStrength: 0.2, contributorTrust: 30 }));
  const hi = findingWeight(f({ evidenceStrength: 0.9, contributorTrust: 90 }));
  assert.ok(hi > lo);
});

test('upheld challenges lower weight', () => {
  const defended = findingWeight(f({ challengesRejected: 3 }));
  const challenged = findingWeight(f({ challengesUpheld: 3 }));
  assert.ok(defended > challenged);
});

test('approved reviews raise weight', () => {
  const approved = findingWeight(f({ reviewsApproved: 3 }));
  const rejected = findingWeight(f({ reviewsRejected: 3 }));
  assert.ok(approved > rejected);
});

test('consensus is NOT majority vote (weight beats count)', () => {
  // 3 weak findings for B vs 1 very strong for A → A can still lead by weight.
  const findings: ConsensusFinding[] = [
    f({ id: 'a', position: 'A', evidenceStrength: 0.98, contributorTrust: 99, historicalAccuracy: 0.95, governanceStanding: 0.95, reviewsApproved: 5 }),
    f({ id: 'b1', position: 'B', evidenceStrength: 0.2, contributorTrust: 20, historicalAccuracy: 0.3, governanceStanding: 0.3 }),
    f({ id: 'b2', position: 'B', evidenceStrength: 0.2, contributorTrust: 20, historicalAccuracy: 0.3, governanceStanding: 0.3 }),
  ];
  assert.equal(computeConsensus(findings).consensusPosition, 'A');
});

test('positionWeights sorted high→low with shares summing ~1', () => {
  const pos = positionWeights(DEMO_FINDINGS);
  for (let i = 1; i < pos.length; i++) assert.ok(pos[i - 1].weight >= pos[i].weight);
  const shareSum = pos.reduce((a, p) => a + p.share, 0);
  assert.ok(Math.abs(shareSum - 1) < 0.01);
});

test('computeAgreementScore in [0,1]', () => {
  const a = computeAgreementScore(DEMO_FINDINGS);
  assert.ok(a >= 0 && a <= 1);
});

test('single position → agreement 1', () => {
  assert.equal(computeAgreementScore([f({ position: 'Solo' })]), 1);
});

test('empty findings → agreement 0', () => {
  assert.equal(computeAgreementScore([]), 0);
});

test('evidence support reflects the leading position', () => {
  const support = computeEvidenceSupport(DEMO_FINDINGS);
  assert.ok(support > 0 && support <= 1);
});

test('computeConfidenceDistribution has 5 buckets summing to count', () => {
  const dist = computeConfidenceDistribution(DEMO_FINDINGS);
  assert.equal(dist.length, 5);
  assert.equal(dist.reduce((a, b) => a + b.count, 0), DEMO_FINDINGS.length);
});

test('computeConsensus returns the leading position', () => {
  const r = computeConsensus(DEMO_FINDINGS);
  assert.equal(r.consensusPosition, 'Earlier settlement');
  assert.ok(r.agreementScore > 0.5);
});

test('computeConsensus empty → null', () => {
  const r = computeConsensus([]);
  assert.equal(r.consensusPosition, null);
  assert.equal(r.confidence, 0);
});

test('dissent excludes the consensus position', () => {
  const dissent = computeDissent(DEMO_FINDINGS, 'Earlier settlement');
  assert.ok(dissent.every((d) => d.position !== 'Earlier settlement'));
  assert.ok(dissent.length >= 1);
});

test('dissent positions carry a reason', () => {
  const dissent = computeDissent(DEMO_FINDINGS, 'Earlier settlement');
  assert.ok(dissent.every((d) => d.reason.length > 0));
});

test('snapshot is fully populated', () => {
  const s = buildConsensusSnapshot('inv-1', DEMO_FINDINGS, { now: NOW });
  assert.equal(s.investigationId, 'inv-1');
  assert.equal(s.consensusPosition, 'Earlier settlement');
  assert.ok(s.positions.length >= 2);
  assert.ok(s.dissentPositions.length >= 1);
  assert.ok(s.explanation.length > 0);
  assert.ok(s.limitations.length > 0);
  assert.equal(s.generatedAt, NOW);
});

test('snapshot always includes a never-truth limitation', () => {
  const s = buildConsensusSnapshot('inv-1', DEMO_FINDINGS, { now: NOW });
  assert.ok(s.limitations.some((l) => /not truth|advisory|human governance/i.test(l)));
});

test('thin sample lowers confidence + adds a limitation', () => {
  const small = buildConsensusSnapshot('inv-1', [f()], { now: NOW });
  assert.ok(small.limitations.some((l) => /floor/.test(l)));
});

test('single-position snapshot flags no-contest', () => {
  const s = buildConsensusSnapshot('inv-1', [f({ position: 'Solo' }), f({ id: 'g', position: 'Solo' })], { now: NOW });
  assert.ok(s.limitations.some((l) => /no contest/i.test(l)));
});

test('confidence = agreement × evidence × sample factor (bounded)', () => {
  const r = computeConsensus(DEMO_FINDINGS);
  assert.ok(r.confidence <= r.agreementScore);
  assert.ok(r.confidence >= 0);
});

test('inputs not mutated', () => {
  const before = JSON.stringify(DEMO_FINDINGS);
  computeConsensus(DEMO_FINDINGS);
  buildConsensusSnapshot('x', DEMO_FINDINGS, { now: NOW });
  assert.equal(JSON.stringify(DEMO_FINDINGS), before);
});

test('deterministic snapshot', () => {
  assert.deepEqual(buildConsensusSnapshot('x', DEMO_FINDINGS, { now: NOW }), buildConsensusSnapshot('x', DEMO_FINDINGS, { now: NOW }));
});

test('contributorCount counts distinct contributors', () => {
  const s = buildConsensusSnapshot('x', DEMO_FINDINGS, { now: NOW });
  assert.equal(s.contributorCount, new Set(DEMO_FINDINGS.map((d) => d.contributorId)).size);
});
