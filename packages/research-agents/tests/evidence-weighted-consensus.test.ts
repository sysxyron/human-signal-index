// =============================================================================
// Tests for the evidence-weighted consensus + claim reliability layer.
// Deterministic; node:test + node:assert. Run with tsx:
//   node node_modules/.pnpm/tsx@4.22.4/node_modules/tsx/dist/cli.mjs \
//     --test packages/research-agents/tests/evidence-weighted-consensus.test.ts
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  evidenceWeightedConsensus,
  applyEvidenceToConsensus,
  computeClaimReliability,
  computeClaimReliabilities,
  type EvidenceWeightInput,
  type ConsensusReport,
} from '../src/index';

// (a) spec example 1: research 90 + all-unsupported evidence → REDUCED.
test('90 + all-unsupported evidence reduces confidence well below 90', () => {
  const evidence: EvidenceWeightInput = {
    totalClaims: 10,
    supported: 0,
    contradicted: 0,
    background: 0,
    unsupported: 10,
    coverageScore: 30,
  };
  const r = evidenceWeightedConsensus(90, evidence);
  assert.equal(r.researchConfidence, 90);
  assert.ok(
    r.evidenceWeightedConfidence < 90,
    `expected < 90, got ${r.evidenceWeightedConfidence}`,
  );
  assert.ok(
    r.evidenceWeightedConfidence <= 70,
    `expected well below 90 (<=70), got ${r.evidenceWeightedConfidence}`,
  );
  assert.ok(r.delta < 0, 'delta should be negative');
  assert.equal(r.unsupportedRatio, 1);
});

// (a) spec example 2: research 72 + supported by 6 sources → INCREASED.
test('72 + supported-by-6-sources increases confidence above 72', () => {
  const evidence: EvidenceWeightInput = {
    totalClaims: 6,
    supported: 6,
    contradicted: 0,
    background: 0,
    unsupported: 0,
    coverageScore: 80,
  };
  const r = evidenceWeightedConsensus(72, evidence);
  assert.equal(r.researchConfidence, 72);
  assert.ok(
    r.evidenceWeightedConfidence > 72,
    `expected > 72, got ${r.evidenceWeightedConfidence}`,
  );
  assert.ok(r.delta > 0, 'delta should be positive');
  assert.equal(r.supportRatio, 1);
});

// (b) contradictions reduce MORE than unsupported.
test('contradictions reduce confidence more than the same count of unsupported', () => {
  const base = { totalClaims: 4, supported: 0, background: 0, coverageScore: 50 };
  const contradicted = evidenceWeightedConsensus(80, {
    ...base,
    contradicted: 4,
    unsupported: 0,
  });
  const unsupported = evidenceWeightedConsensus(80, {
    ...base,
    contradicted: 0,
    unsupported: 4,
  });
  assert.ok(
    contradicted.evidenceWeightedConfidence < unsupported.evidenceWeightedConfidence,
    `contradicted(${contradicted.evidenceWeightedConfidence}) should be < unsupported(${unsupported.evidenceWeightedConfidence})`,
  );
});

// (c) total = 0 guard.
test('total=0 leaves confidence unchanged and notes no claims/evidence', () => {
  const r = evidenceWeightedConsensus(64, {
    totalClaims: 0,
    supported: 0,
    contradicted: 0,
    background: 0,
    unsupported: 0,
    coverageScore: 0,
  });
  assert.equal(r.evidenceWeightedConfidence, 64);
  assert.equal(r.delta, 0);
  assert.equal(r.supportRatio, 0);
  assert.equal(r.contradictionRatio, 0);
  assert.equal(r.unsupportedRatio, 0);
  assert.ok(
    r.explanation.some((e) => /no claims\/evidence/i.test(e)),
    'explanation should note no claims/evidence',
  );
});

// (e) explanation contains the "decreased/increased from X → Y" headline.
test('explanation contains a directional "from X → Y" headline', () => {
  const down = evidenceWeightedConsensus(90, {
    totalClaims: 10,
    supported: 0,
    contradicted: 0,
    background: 0,
    unsupported: 10,
    coverageScore: 30,
  });
  assert.ok(
    /decreased from 90 → /.test(down.explanation[0] ?? ''),
    `expected decreased headline, got "${down.explanation[0]}"`,
  );

  const up = evidenceWeightedConsensus(72, {
    totalClaims: 6,
    supported: 6,
    contradicted: 0,
    background: 0,
    unsupported: 0,
    coverageScore: 80,
  });
  assert.ok(
    /increased from 72 → /.test(up.explanation[0] ?? ''),
    `expected increased headline, got "${up.explanation[0]}"`,
  );
});

// applyEvidenceToConsensus does not mutate the input and attaches the block.
test('applyEvidenceToConsensus is non-mutating and attaches evidenceWeighted', () => {
  const report: ConsensusReport = {
    summary: 'test',
    overallConfidence: 90,
    agreementScore: 70,
    classificationBreakdown: {
      'known-science': 1,
      'plausible-science': 0,
      speculative: 0,
      fictional: 0,
      'violates-known-physics': 0,
    },
    keyFindings: ['a'],
    openDisputes: [],
    recommendedParameters: { x: 1 },
    blueprintNotes: ['note'],
  };
  const before = report.blueprintNotes.length;
  const out = applyEvidenceToConsensus(report, {
    totalClaims: 10,
    supported: 0,
    contradicted: 0,
    background: 0,
    unsupported: 10,
    coverageScore: 30,
  });
  // input untouched
  assert.equal(report.blueprintNotes.length, before);
  assert.equal(report.overallConfidence, 90);
  // output carries the block + research confidence echoed from overallConfidence
  assert.equal(out.evidenceWeighted.researchConfidence, 90);
  assert.ok(out.blueprintNotes.length > before);
  assert.ok(out.evidenceWeighted.evidenceWeightedConfidence < 90);
});

// (d) claim reliability — physics violation stays low even when "supported".
test('violates-known-physics claim stays low even with supported coverage (honesty)', () => {
  const r = computeClaimReliability({
    claimId: 'c1',
    tier: 'violates-known-physics',
    claimConfidence: 0.9,
    coverage: 'supported',
    evidenceConfidence: 0.95,
    supportingSources: 10,
  });
  assert.ok(
    r.reliabilityScore <= 10,
    `expected <= 10 (ceiling), got ${r.reliabilityScore}`,
  );
  assert.ok(/ceiling/i.test(r.rationale));
});

// (d) known-science supported claim scores high.
test('known-science supported claim scores high', () => {
  const r = computeClaimReliability({
    claimId: 'c2',
    tier: 'known-science',
    claimConfidence: 0.9,
    coverage: 'supported',
    evidenceConfidence: 0.9,
    supportingSources: 5,
  });
  assert.ok(r.reliabilityScore >= 85, `expected >= 85, got ${r.reliabilityScore}`);
});

// (d) unsupported coverage caps finalConfidence.
test('unsupported coverage caps finalConfidence regardless of high inputs', () => {
  const r = computeClaimReliability({
    claimId: 'c3',
    tier: 'known-science',
    claimConfidence: 0.95,
    coverage: 'unsupported',
    evidenceConfidence: 0.95,
  });
  assert.ok(
    r.finalConfidence <= 0.45,
    `expected finalConfidence capped <= 0.45, got ${r.finalConfidence}`,
  );
});

// contradicted coverage drags a strong claim down.
test('contradicted coverage drags reliability below the same supported claim', () => {
  const supported = computeClaimReliability({
    claimId: 's',
    tier: 'plausible-science',
    claimConfidence: 0.8,
    coverage: 'supported',
    evidenceConfidence: 0.8,
    supportingSources: 3,
  });
  const contradicted = computeClaimReliability({
    claimId: 'k',
    tier: 'plausible-science',
    claimConfidence: 0.8,
    coverage: 'contradicted',
    evidenceConfidence: 0.8,
  });
  assert.ok(contradicted.reliabilityScore < supported.reliabilityScore);
});

// batch helper preserves order and length.
test('computeClaimReliabilities maps inputs 1:1 in order', () => {
  const out = computeClaimReliabilities([
    { claimId: 'a', tier: 'known-science', claimConfidence: 0.8, coverage: 'supported', evidenceConfidence: 0.8 },
    { claimId: 'b', tier: 'speculative', claimConfidence: 0.4, coverage: 'background', evidenceConfidence: 0.5 },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0]?.claimId, 'a');
  assert.equal(out[1]?.claimId, 'b');
});
