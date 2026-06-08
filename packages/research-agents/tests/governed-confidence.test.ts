// =============================================================================
// Tests for the human review & governance layer (WorldForge Phase 6).
// Deterministic; node:test + node:assert. Run with tsx:
//   node node_modules/.pnpm/tsx@4.22.4/node_modules/tsx/dist/cli.mjs \
//     --test packages/research-agents/tests/governed-confidence.test.ts
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeReviewerTrust,
  applyReviewerVerdictToEvidence,
  governedConfidence,
  aggregateReviewerValidation,
  type GovernanceInput,
} from '../src/index';

// (a) applyReviewerVerdictToEvidence -----------------------------------------

test('validated lifts 0.75 to ≈0.90 (spec example) and above input', () => {
  const out = applyReviewerVerdictToEvidence(0.75, 'validated', 0.5);
  assert.ok(Math.abs(out - 0.9) <= 0.01, `expected ≈0.90, got ${out}`);
  assert.ok(out > 0.75, `expected > input 0.75, got ${out}`);
});

test('rejected pulls confidence well below the input', () => {
  const out = applyReviewerVerdictToEvidence(0.75, 'rejected', 0.5);
  assert.ok(out < 0.5, `expected well below 0.75, got ${out}`);
});

test('pending leaves evidence unchanged', () => {
  assert.equal(applyReviewerVerdictToEvidence(0.62, 'pending', 0.9), 0.62);
});

test('needs_more and disputed are mild/moderate reductions', () => {
  const ev = 0.8;
  const needsMore = applyReviewerVerdictToEvidence(ev, 'needs_more', 0.5);
  const disputed = applyReviewerVerdictToEvidence(ev, 'disputed', 0.5);
  assert.ok(needsMore < ev, `needs_more should reduce, got ${needsMore}`);
  assert.ok(disputed < ev, `disputed should reduce, got ${disputed}`);
  // disputed anchor (0.40) is lower than needs_more (0.45) → pulls slightly lower.
  assert.ok(disputed <= needsMore, `disputed(${disputed}) <= needs_more(${needsMore})`);
});

test('higher trust pulls harder toward the validated anchor', () => {
  const lowTrust = applyReviewerVerdictToEvidence(0.75, 'validated', 0.0);
  const highTrust = applyReviewerVerdictToEvidence(0.75, 'validated', 1.0);
  assert.ok(highTrust > lowTrust, `${highTrust} should be > ${lowTrust}`);
});

// (b) computeReviewerTrust ----------------------------------------------------

test('0 reviews → neutral trust ≈0.5', () => {
  const t = computeReviewerTrust({ approvedCount: 0, reversedCount: 0, reviewCount: 0 });
  assert.equal(t.trustScore, 0.5);
});

test('many clean approvals → high trust (>0.7)', () => {
  const t = computeReviewerTrust({ approvedCount: 40, reversedCount: 0, reviewCount: 40 });
  assert.ok(t.trustScore > 0.7, `expected > 0.7, got ${t.trustScore}`);
});

test('many reversals → low trust (<0.4)', () => {
  const t = computeReviewerTrust({ approvedCount: 5, reversedCount: 25, reviewCount: 40 });
  assert.ok(t.trustScore < 0.4, `expected < 0.4, got ${t.trustScore}`);
});

// (c) governedConfidence ------------------------------------------------------

const REVIEWED: GovernanceInput = {
  researchConfidence: 80,
  evidenceConfidence: 60,
  reviewerValidation: 0.5,
};

test('unreviewed (validation 0.5) → governed ≈ baseline & reviewed:false', () => {
  const r = governedConfidence({ ...REVIEWED, reviewerValidation: 0.5, reviewCount: 0 });
  // baseline = 0.5*80 + 0.5*60 = 70
  assert.ok(Math.abs(r.governedConfidence - 70) <= 0.1, `expected ≈70, got ${r.governedConfidence}`);
  assert.equal(r.reviewed, false);
  assert.ok(Math.abs(r.delta) <= 0.1, `delta ≈0, got ${r.delta}`);
  assert.ok(r.explanation.some((e) => /no human review/i.test(e)));
});

test('strong validation (→1, high trust) → governed > baseline & reviewed:true', () => {
  const r = governedConfidence({
    ...REVIEWED,
    reviewerValidation: 1,
    reviewerTrust: 0.9,
    reviewCount: 5,
  });
  assert.ok(r.governedConfidence > 70, `expected > baseline 70, got ${r.governedConfidence}`);
  assert.equal(r.reviewed, true);
  assert.ok(r.delta > 0, 'delta should be positive');
  assert.ok(/increased 70 → /.test(r.explanation[0] ?? ''), `headline: ${r.explanation[0]}`);
  assert.ok(r.explanation.some((e) => /validated by reviewers/i.test(e)));
});

test('rejection (→0, high trust) → governed < baseline', () => {
  const r = governedConfidence({
    ...REVIEWED,
    reviewerValidation: 0,
    reviewerTrust: 0.9,
    reviewCount: 5,
  });
  assert.ok(r.governedConfidence < 70, `expected < baseline 70, got ${r.governedConfidence}`);
  assert.equal(r.reviewed, true);
  assert.ok(r.delta < 0, 'delta should be negative');
  assert.ok(/decreased 70 → /.test(r.explanation[0] ?? ''), `headline: ${r.explanation[0]}`);
  assert.ok(r.explanation.some((e) => /reviewer rejection/i.test(e)));
});

test('explanation contains the directional "Governed confidence" headline', () => {
  const r = governedConfidence({ ...REVIEWED, reviewerValidation: 1, reviewerTrust: 0.8, reviewCount: 4 });
  assert.ok(/Governed confidence/i.test(r.explanation[0] ?? ''), `headline: ${r.explanation[0]}`);
});

test('weights reflect reviewer contribution and sum ~1', () => {
  const r = governedConfidence({ ...REVIEWED, reviewerValidation: 1, reviewerTrust: 0.9, reviewCount: 5 });
  const sum = r.weights.research + r.weights.evidence + r.weights.reviewer;
  assert.ok(Math.abs(sum - 1) <= 0.02, `weights should sum ~1, got ${sum}`);
  assert.ok(r.weights.reviewer > 0, 'reviewer weight should be > 0 when reviewed');
});

// (d) aggregateReviewerValidation --------------------------------------------

test('all APPROVE → ≈1', () => {
  const v = aggregateReviewerValidation([
    { decision: 'APPROVE' },
    { decision: 'APPROVE', reviewerTrust: 0.9 },
  ]);
  assert.ok(Math.abs(v - 1) <= 0.01, `expected ≈1, got ${v}`);
});

test('all REJECT → ≈0', () => {
  const v = aggregateReviewerValidation([
    { decision: 'REJECT' },
    { decision: 'REJECT', reviewerTrust: 0.9 },
  ]);
  assert.ok(Math.abs(v - 0) <= 0.01, `expected ≈0, got ${v}`);
});

test('empty decisions → 0.5 neutral', () => {
  assert.equal(aggregateReviewerValidation([]), 0.5);
});

test('trust-weights the mean (higher-trust APPROVE outweighs low-trust REJECT)', () => {
  const v = aggregateReviewerValidation([
    { decision: 'APPROVE', reviewerTrust: 0.9 },
    { decision: 'REJECT', reviewerTrust: 0.1 },
  ]);
  assert.ok(v > 0.5, `expected > 0.5 (approve dominates), got ${v}`);
});
