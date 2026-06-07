// =============================================================================
// tests/evidence-engine.test.ts — deterministic tests (node:test + node:assert).
// Run with: node --test (after a TS->JS step) or ts-node/tsx. No framework dep.
// All tests pass a fixed `now` so output is reproducible.
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Claim } from '@hsi/research-agents';
import {
  createEvidenceEngine,
  gatherEvidence,
  validateCitation,
  reliabilityTier,
  normalizeResult,
  computeCoverage,
  type ClaimEvidence,
  type EvidenceResult,
} from '../src/index';

const NOW = '2024-01-01T00:00:00.000Z';

function claim(partial: Partial<Claim> & Pick<Claim, 'id' | 'text' | 'tier'>): Claim {
  return {
    source: 'model-inference',
    confidence: 0.5,
    ...partial,
  };
}

test('fixture engine returns results for a chronid query', async () => {
  const engine = createEvidenceEngine({ mode: 'fixture' }, { now: NOW });
  assert.equal(engine.mode, 'fixture');
  const results = await engine.search({
    text: 'planetary orbital periods and the length of a year',
    minRelevance: 0,
  });
  assert.ok(results.length > 0, 'expected fixture results');
  assert.ok(results.every((r) => r.isFixture === true));
  // Top hit should be the orbital-period reference.
  assert.match(results[0].title, /Astronomical Algorithms|orbital|deflection/i);
});

test('a known-science claim with strong evidence is supported', async () => {
  const engine = createEvidenceEngine({ mode: 'fixture' }, { now: NOW });
  const claims = [
    claim({
      id: 'c-hab',
      text: 'Liquid water can persist in the habitable zone around a main sequence star',
      tier: 'known-science',
    }),
  ];
  const { matches, coverage } = await gatherEvidence(claims, engine, NOW);
  assert.equal(matches[0].coverage, 'supported');
  assert.equal(matches[0].bestSupport, 'supports');
  assert.ok(coverage.coverageScore > 0);
});

test('a speculative claim with weak evidence is NOT marked supports', async () => {
  const engine = createEvidenceEngine({ mode: 'fixture' }, { now: NOW });
  const claims = [
    claim({
      id: 'c-spec',
      // Lexically overlaps "metabolism/lifespan" fixtures but is speculative.
      text: 'A crystalline mineral organism has an ultra-slow metabolism granting a billion-year lifespan',
      tier: 'speculative',
    }),
  ];
  const { matches } = await gatherEvidence(claims, engine, NOW);
  const m = matches[0];
  // Honesty rule: speculative claims are NOT upgraded to 'supports' on lexical
  // overlap. They may be 'background' or 'contradicted' but never 'supported'.
  assert.notEqual(m.coverage, 'supported');
  assert.ok(m.results.every((r) => r.supportType !== 'supports' || r.confidence === 0));
});

test('a claim with no matching evidence is unsupported (no fabrication)', async () => {
  const engine = createEvidenceEngine({ mode: 'fixture' }, { now: NOW });
  const claims = [
    claim({
      id: 'c-none',
      text: 'The quarterly revenue of a fictional widget company exceeded projections',
      tier: 'fictional',
    }),
  ];
  const { matches, coverage } = await gatherEvidence(claims, engine, NOW);
  assert.equal(matches[0].coverage, 'unsupported');
  assert.equal(matches[0].results.length, 0);
  assert.equal(coverage.unsupported, 1);
});

test('reliability tiers map correctly', () => {
  assert.equal(reliabilityTier(0.95, true), 'high');
  assert.equal(reliabilityTier(0.8, true), 'high');
  assert.equal(reliabilityTier(0.6, true), 'medium');
  assert.equal(reliabilityTier(0.3, true), 'low');
  assert.equal(reliabilityTier(0.0, true), 'unsupported');
  // No citation -> unsupported regardless of score.
  assert.equal(reliabilityTier(0.95, false), 'unsupported');
});

test('malformed citation -> invalid', () => {
  // No title.
  const noTitle = normalizeResult({ title: '', doi: '10.1000/x', publicationType: 'web' }, 'test', NOW);
  assert.equal(validateCitation(noTitle), 'invalid');

  // Present-but-malformed DOI.
  const badDoi = normalizeResult(
    { title: 'A real title', doi: 'not-a-doi', publicationType: 'peer-reviewed' },
    'test',
    NOW,
  );
  assert.equal(validateCitation(badDoi), 'invalid');

  // A clean peer-reviewed citation with a good DOI is high.
  const good = normalizeResult(
    { title: 'A real title', doi: '10.1038/nature00965', publicationType: 'peer-reviewed' },
    'test',
    NOW,
  );
  assert.equal(validateCitation(good), 'high');

  // A titled result with NO identifier is 'unsupported' (nothing to cite).
  const noId = normalizeResult({ title: 'Title only', publicationType: 'web' }, 'test', NOW);
  assert.equal(validateCitation(noId), 'unsupported');
});

test('coverage math', () => {
  const mk = (coverage: ClaimEvidence['coverage'], src: string): ClaimEvidence => ({
    claimId: `c-${coverage}`,
    results: src
      ? [
          {
            id: src,
            title: 't',
            authors: [],
            sourceName: src,
            publicationType: 'peer-reviewed',
            retrievedAt: NOW,
            reliabilityScore: 0.9,
            relevanceScore: 0.5,
            supportType: 'supports',
            confidence: 0.7,
          } satisfies EvidenceResult,
        ]
      : [],
    bestSupport: 'supports',
    coverage,
    topRelevance: 0.5,
  });

  const matches = [
    mk('supported', 'fixture'),
    mk('contradicted', 'fixture'),
    mk('background', 'fixture'),
    mk('unsupported', ''),
  ];
  const cov = computeCoverage(matches, 'fixture');
  assert.equal(cov.totalClaims, 4);
  assert.equal(cov.supported, 1);
  assert.equal(cov.contradicted, 1);
  assert.equal(cov.background, 1);
  assert.equal(cov.unsupported, 1);
  // covered = supported + contradicted = 2 / 4 = 50%.
  assert.equal(cov.coverageScore, 50);
  assert.equal(cov.bySource['fixture'], 3);
});

test('determinism: identical runs produce identical output', async () => {
  const engine = createEvidenceEngine({ mode: 'fixture' }, { now: NOW });
  const claims = [
    claim({ id: 'c1', text: 'circadian rhythms and chronobiology entrain organisms', tier: 'known-science' }),
  ];
  const a = await gatherEvidence(claims, engine, NOW);
  const b = await gatherEvidence(claims, engine, NOW);
  assert.deepEqual(a.matches, b.matches);
  assert.deepEqual(a.coverage, b.coverage);
});
