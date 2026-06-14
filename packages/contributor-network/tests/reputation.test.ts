import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  REPUTATION_CATEGORIES, acceptanceRatio, computeReputation, explainReputation, overallReputation,
} from '../src/reputation';
import type { QualitySignals } from '../src/types';

const GOOD: QualitySignals = {
  acceptedSignals: 90, rejectedSignals: 10, reviewAccuracy: 0.9, evidenceQuality: 0.9,
  traceabilityScore: 0.9, consensusAgreement: 0.9, governanceOutcomes: 0.9, publicationQuality: 0.9,
};
const POOR: QualitySignals = {
  acceptedSignals: 10, rejectedSignals: 90, reviewAccuracy: 0.1, evidenceQuality: 0.1,
  traceabilityScore: 0.1, consensusAgreement: 0.1, governanceOutcomes: 0.1, publicationQuality: 0.1,
};

test('acceptanceRatio is neutral with no history', () => {
  assert.equal(acceptanceRatio(0, 0), 0.5);
  assert.equal(acceptanceRatio(3, 1), 0.75);
});

test('all five categories present and 0..100', () => {
  const s = computeReputation(GOOD);
  for (const c of REPUTATION_CATEGORIES) {
    assert.ok(s[c] >= 0 && s[c] <= 100, `${c}=${s[c]}`);
  }
  assert.equal(Object.keys(s).length, 5);
});

test('good quality scores higher than poor quality', () => {
  const good = computeReputation(GOOD);
  const poor = computeReputation(POOR);
  for (const c of REPUTATION_CATEGORIES) {
    assert.ok(good[c] > poor[c], `${c}: ${good[c]} !> ${poor[c]}`);
  }
});

test('reputation is independent of activity volume (quality not quantity)', () => {
  // identical ratios + quality, different absolute volume → same score
  const lo = computeReputation({ ...GOOD, acceptedSignals: 9, rejectedSignals: 1 });
  const hi = computeReputation({ ...GOOD, acceptedSignals: 900, rejectedSignals: 100 });
  assert.deepEqual(lo, hi);
});

test('explainReputation returns weighted factors summing to 1', () => {
  const ex = explainReputation('research_reputation', GOOD);
  const weightSum = ex.factors.reduce((n, f) => n + f.weight, 0);
  assert.ok(Math.abs(weightSum - 1) < 1e-9);
  assert.equal(ex.category, 'research_reputation');
});

test('overallReputation averages the five', () => {
  const s = computeReputation(GOOD);
  assert.ok(overallReputation(s) > 70);
});
