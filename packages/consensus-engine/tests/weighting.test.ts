import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildConsensusSnapshot,
  computeConsensus,
  computeConfidenceDistribution,
  computeDissent,
  findingWeight,
  positionWeights,
} from '../src/consensus';
import { FIXTURE_NOW } from '../src/fixtures';
import type { ConsensusFinding } from '../src/types';

const NOW = FIXTURE_NOW;

function f(o: Partial<ConsensusFinding> = {}): ConsensusFinding {
  return { id: 'f', position: 'P', contributorId: 'c', confidence: 0.7, evidenceStrength: 0.7, contributorTrust: 70, ...o };
}

test('higher historical accuracy raises weight', () => {
  assert.ok(findingWeight(f({ historicalAccuracy: 0.9 })) > findingWeight(f({ historicalAccuracy: 0.1 })));
});

test('higher governance standing raises weight', () => {
  assert.ok(findingWeight(f({ governanceStanding: 0.9 })) > findingWeight(f({ governanceStanding: 0.1 })));
});

test('endorsements give a small bonus', () => {
  assert.ok(findingWeight(f({ endorsements: 10 })) >= findingWeight(f({ endorsements: 0 })));
});

test('absent accuracy/governance default to neutral (same weight)', () => {
  assert.equal(findingWeight(f({ historicalAccuracy: 0.5, governanceStanding: 0.5 })), findingWeight(f()));
});

test('zero evidence + zero trust still yields a weight from neutral defaults', () => {
  const w = findingWeight(f({ evidenceStrength: 0, contributorTrust: 0 }));
  assert.ok(w > 0); // accuracy + governance neutral contribute.
});

test('weight is bounded in [0,1] across extremes', () => {
  const hi = findingWeight(f({ evidenceStrength: 1, contributorTrust: 100, historicalAccuracy: 1, governanceStanding: 1, reviewsApproved: 10, endorsements: 50 }));
  const lo = findingWeight(f({ evidenceStrength: 0, contributorTrust: 0, historicalAccuracy: 0, governanceStanding: 0, challengesUpheld: 10 }));
  assert.ok(hi <= 1 && hi >= 0);
  assert.ok(lo <= 1 && lo >= 0);
});

test('positionWeights aggregates by position', () => {
  const pw = positionWeights([f({ id: '1', position: 'A' }), f({ id: '2', position: 'A' }), f({ id: '3', position: 'B' })]);
  assert.equal(pw.length, 2);
  assert.equal(pw.find((p) => p.position === 'A')?.findingCount, 2);
});

test('a strong minority position can outweigh a weak majority', () => {
  const findings = [
    f({ id: 'a', position: 'Strong', evidenceStrength: 0.95, contributorTrust: 95, historicalAccuracy: 0.9, governanceStanding: 0.9 }),
    f({ id: 'b1', position: 'Weak', evidenceStrength: 0.1, contributorTrust: 10, historicalAccuracy: 0.2, governanceStanding: 0.2 }),
    f({ id: 'b2', position: 'Weak', evidenceStrength: 0.1, contributorTrust: 10, historicalAccuracy: 0.2, governanceStanding: 0.2 }),
    f({ id: 'b3', position: 'Weak', evidenceStrength: 0.1, contributorTrust: 10, historicalAccuracy: 0.2, governanceStanding: 0.2 }),
  ];
  assert.equal(computeConsensus(findings).consensusPosition, 'Strong');
});

test('a clear majority wins when weights are comparable', () => {
  const findings = [
    f({ id: 'a1', position: 'Majority' }),
    f({ id: 'a2', position: 'Majority' }),
    f({ id: 'a3', position: 'Majority' }),
    f({ id: 'b', position: 'Minority' }),
  ];
  assert.equal(computeConsensus(findings).consensusPosition, 'Majority');
});

test('confidence distribution sums to count', () => {
  const findings = [f({ confidence: 0.1 }), f({ confidence: 0.3 }), f({ confidence: 0.5 }), f({ confidence: 0.7 }), f({ confidence: 0.95 })];
  const dist = computeConfidenceDistribution(findings);
  assert.equal(dist.reduce((a, b) => a + b.count, 0), 5);
});

test('confidence 1.0 falls in the top bucket', () => {
  const dist = computeConfidenceDistribution([f({ confidence: 1 })]);
  assert.equal(dist[4].count, 1);
});

test('confidence 0 falls in the first bucket', () => {
  const dist = computeConfidenceDistribution([f({ confidence: 0 })]);
  assert.equal(dist[0].count, 1);
});

test('dissent shares are < the leading share', () => {
  const findings = [
    f({ id: 'a1', position: 'A' }), f({ id: 'a2', position: 'A' }), f({ id: 'b', position: 'B' }),
  ];
  const consensus = computeConsensus(findings);
  const dissent = computeDissent(findings, consensus.consensusPosition);
  for (const d of dissent) assert.ok(d.share <= consensus.agreementScore);
});

test('agreement of a perfect single-position set is 1', () => {
  assert.equal(computeConsensus([f({ id: '1' }), f({ id: '2', position: 'P' })]).agreementScore, 1);
});

test('snapshot positions sum shares to ~1', () => {
  const snap = buildConsensusSnapshot('i', [f({ id: '1', position: 'A' }), f({ id: '2', position: 'B' }), f({ id: '3', position: 'C' })], { now: NOW });
  const sum = snap.positions.reduce((a, p) => a + p.share, 0);
  assert.ok(Math.abs(sum - 1) < 0.02);
});

test('two-finding investigation flags the thin-sample limitation', () => {
  const snap = buildConsensusSnapshot('i', [f({ id: '1', position: 'A' }), f({ id: '2', position: 'B' })], { now: NOW });
  assert.ok(snap.limitations.some((l) => /floor/.test(l)));
});

test('mean confidence per position is weighted', () => {
  const pw = positionWeights([f({ id: '1', position: 'A', confidence: 0.9, evidenceStrength: 0.9, contributorTrust: 90 }), f({ id: '2', position: 'A', confidence: 0.1, evidenceStrength: 0.1, contributorTrust: 10 })]);
  const a = pw.find((p) => p.position === 'A')!;
  // The high-weight finding pulls the mean above the simple average 0.5.
  assert.ok(a.meanConfidence > 0.5);
});

test('deterministic weighting', () => {
  assert.equal(findingWeight(f({ reviewsApproved: 3, challengesRejected: 1 })), findingWeight(f({ reviewsApproved: 3, challengesRejected: 1 })));
});
