// =============================================================================
// tests/hardening.test.ts — WorldForge Phase 5 hardening tests.
// Runtime: node:test + node:assert. Deterministic (fixed `now`, injected deps).
// Run: node node_modules/.pnpm/tsx@*/.../cli.mjs --test packages/evidence-engine/tests/hardening.test.ts
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Claim } from '@hsi/research-agents';
import {
  createEvidenceEngine,
  gatherEvidence,
  InMemoryCacheStore,
  ProviderHealthTracker,
  cacheKey,
  hashQuery,
  createEmbeddingRanker,
  createRelevanceEngine,
  createSupportClassifier,
  createHeuristicClassifier,
  type EvidenceResult,
  type EmbedFn,
} from '../src/index';

const NOW = '2024-01-01T00:00:00.000Z';

function claim(partial: Partial<Claim> & Pick<Claim, 'id' | 'text' | 'tier'>): Claim {
  return { source: 'model-inference', confidence: 0.5, ...partial };
}

function mkResult(p: Partial<EvidenceResult> & Pick<EvidenceResult, 'id' | 'title'>): EvidenceResult {
  return {
    authors: [],
    sourceName: 'test',
    publicationType: 'peer-reviewed',
    retrievedAt: NOW,
    reliabilityScore: 0.9,
    relevanceScore: 0,
    supportType: 'unclear',
    confidence: 0,
    ...p,
  };
}

// (a) Evidence Retrieval -------------------------------------------------------
test('fixture engine returns ranked results for a chronid query', async () => {
  const engine = createEvidenceEngine({ mode: 'fixture' }, { now: NOW });
  const ranked = await engine.relevance.rank(
    'planetary orbital periods and the length of a year',
    await engine.search({ text: 'planetary orbital periods', minRelevance: 0 }),
    NOW,
  );
  assert.ok(ranked.length > 0, 'expected ranked fixture results');
  // Sorted descending by relevance.
  for (let i = 1; i < ranked.length; i++) {
    assert.ok(ranked[i - 1].relevanceScore >= ranked[i].relevanceScore);
  }
  assert.match(ranked[0].title, /Astronomical Algorithms|orbital|deflection/i);
});

// (b) Provider Failure ---------------------------------------------------------
test('a provider whose fetch rejects yields [] and the run still completes; health not HEALTHY', async () => {
  const tracker = new ProviderHealthTracker();
  let calls = 0;
  // A fetch that always rejects (simulating a network failure / timeout).
  const failingFetch = async (): Promise<Response> => {
    calls++;
    throw new Error('ECONNREFUSED');
  };
  const engine = createEvidenceEngine(
    { mode: 'live', crossrefMailto: 'you@example.com' },
    {
      now: NOW,
      healthTracker: tracker,
      fetchImpl: failingFetch as unknown as typeof fetch,
      // No real delays in tests.
      jitterSeed: 7,
      clock: () => 0,
      sleep: async () => {},
    },
  );
  const results = await engine.search({ text: 'circadian rhythms', minRelevance: 0 });
  assert.deepEqual(results, [], 'failing providers return []');
  assert.ok(calls > 0, 'fetch was attempted (with retries)');

  const crossref = engine.health().find((h) => h.name === 'Crossref');
  assert.ok(crossref, 'crossref health recorded');
  assert.notEqual(crossref?.status, 'HEALTHY');
  assert.ok((crossref?.errorCount ?? 0) > 0);

  // The whole run still completes without throwing.
  const claims = [claim({ id: 'c1', text: 'circadian rhythms', tier: 'known-science' })];
  const out = await gatherEvidence(claims, engine, NOW);
  assert.equal(out.matches.length, 1);
  assert.equal(out.matches[0].coverage, 'unsupported');
});

test('provider failure backoff uses injected sleep (no real delay) and retries per provider', async () => {
  const tracker = new ProviderHealthTracker();
  let attempts = 0;
  const failingFetch = async (): Promise<Response> => {
    attempts++;
    throw new Error('timeout');
  };
  const slept: number[] = [];
  // Only Crossref is key-gated on here, but arXiv is also unconditionally on in
  // live mode — each does 1 attempt + 2 retries = 3, so a multiple of 3.
  const engine = createEvidenceEngine(
    { mode: 'live', crossrefMailto: 'a@b.co' },
    {
      now: NOW,
      healthTracker: tracker,
      fetchImpl: failingFetch as unknown as typeof fetch,
      clock: () => 0,
      sleep: async (ms) => {
        slept.push(ms);
      },
    },
  );
  await engine.search({ text: 'x', minRelevance: 0 });
  assert.ok(attempts >= 3, 'at least one provider did 1 attempt + 2 retries');
  assert.equal(attempts % 3, 0, 'each network provider does a multiple of 3 attempts');
  assert.ok(slept.length > 0, 'backoff used the injected (no-delay) sleep');
});

// (c) Cache --------------------------------------------------------------------
test('InMemoryCacheStore hit/miss + TTL expiry with injected clock', async () => {
  const store = new InMemoryCacheStore();
  const key = cacheKey('fixture', 'planetary orbital periods');
  assert.equal(await store.get(key), null, 'miss before set');

  await store.set(key, [{ id: 'r1' }], 100, '2024-01-01T00:00:00.000Z');
  const hit = await store.get(key, '2024-01-01T00:01:00.000Z'); // +60s, < 100s TTL
  assert.ok(hit, 'hit within TTL');
  assert.deepEqual(hit?.value, [{ id: 'r1' }]);

  // +200s > 100s TTL => expired.
  const expired = await store.get(key, '2024-01-01T00:03:20.000Z');
  assert.equal(expired, null, 'expired after TTL');

  // Stable hashing.
  assert.equal(hashQuery('abc'), hashQuery('abc'));
  assert.notEqual(hashQuery('abc'), hashQuery('abd'));
  // Normalization: case/space insensitive.
  assert.equal(cacheKey('fixture', 'Planetary  Orbital'), cacheKey('fixture', 'planetary orbital'));
});

test('engine search uses cache: provider called once across two searches', async () => {
  const store = new InMemoryCacheStore();
  const engine = createEvidenceEngine(
    { mode: 'fixture' },
    { now: NOW, cacheStore: store },
  );
  const q = { text: 'circadian rhythms chronobiology', minRelevance: 0 };
  const a = await engine.search(q);
  const b = await engine.search(q);
  assert.ok(a.length > 0);
  assert.deepEqual(a, b, 'cached result identical');
  assert.equal(store.size, 1, 'one cache entry stored');
});

// (d) Embedding Ranking --------------------------------------------------------
test('embedding ranker ranks the most-similar source first via injected embed()', async () => {
  // Deterministic toy embeddings: claim aligns with r-match, opposes r-far.
  const vectors: Record<string, number[]> = {
    claim: [1, 0, 0],
    'r-match': [0.9, 0.1, 0],
    'r-mid': [0.4, 0.6, 0],
    'r-far': [0, 0, 1],
  };
  const texts = ['the claim', 'match source', 'mid source', 'far source'];
  const embed: EmbedFn = async (input) =>
    input.map((t) => {
      if (t === 'the claim') return vectors.claim;
      if (t.startsWith('match')) return vectors['r-match'];
      if (t.startsWith('mid')) return vectors['r-mid'];
      return vectors['r-far'];
    });

  const ranker = createEmbeddingRanker({ mode: 'live', minRelevance: 0.12 }, { embed });
  assert.equal(ranker.mode, 'live');
  const results = [
    mkResult({ id: 'r-far', title: 'far source' }),
    mkResult({ id: 'r-mid', title: 'mid source' }),
    mkResult({ id: 'r-match', title: 'match source' }),
  ];
  const ranked = await ranker.rank('the claim', results, NOW);
  assert.equal(ranked[0].id, 'r-match', 'most-similar ranked first');
  assert.equal(ranked[ranked.length - 1].id, 'r-far', 'least-similar ranked last');
});

test('embedding ranker falls back to lexical without a key/embed fn', async () => {
  const ranker = createRelevanceEngine({ mode: 'live', minRelevance: 0.12 });
  // No openaiApiKey and no embed → lexical (fixture mode).
  assert.equal(ranker.mode, 'fixture');
  const results = [
    mkResult({ id: 'a', title: 'completely unrelated widget' }),
    mkResult({ id: 'b', title: 'circadian rhythm biological clock' }),
  ];
  const ranked = await ranker.rank('circadian rhythm clock', results, NOW);
  assert.equal(ranked[0].id, 'b', 'lexical fallback ranks the overlapping source first');
});

// (e) NLI Classification -------------------------------------------------------
test('heuristic classifier: supports / contradicts / background / unclear', async () => {
  const cls = createHeuristicClassifier();

  // supports: explicit fixture stance + grounded claim.
  const supportsRes = mkResult({
    id: 's',
    title: 'Habitable zones',
    abstract: 'liquid water persists',
    raw: { stance: 'supports', topics: ['habitable zone'] },
  });
  const r1 = await cls.classify(
    claim({ id: 'c', text: 'liquid water in the habitable zone', tier: 'known-science' }),
    supportsRes,
    0.5,
  );
  assert.equal(r1.classification, 'supports');
  assert.ok(r1.confidence > 0);
  assert.ok(r1.rationale.length > 0);

  // contradicts: explicit fixture stance.
  const contraRes = mkResult({
    id: 'k',
    title: 'rate of living',
    raw: { stance: 'contradicts', topics: ['lifespan'] },
  });
  const r2 = await cls.classify(
    claim({ id: 'c2', text: 'metabolism lifespan', tier: 'known-science' }),
    contraRes,
    0.5,
  );
  assert.equal(r2.classification, 'contradicts');

  // background: some overlap, no stance, no support threshold breach for capped.
  const bgRes = mkResult({ id: 'b', title: 'orbital dynamics gravity', abstract: 'background context' });
  const r3 = await cls.classify(
    claim({ id: 'c3', text: 'orbital dynamics gravity context', tier: 'known-science' }),
    bgRes,
    0.15, // below RELEVANCE_SUPPORT_THRESHOLD (0.18) but > 0
  );
  assert.equal(r3.classification, 'background');

  // unclear: relevance ~0, uncertainty preserved.
  const unclearRes = mkResult({ id: 'u', title: 'nothing relevant here' });
  const r4 = await cls.classify(
    claim({ id: 'c4', text: 'totally different topic', tier: 'known-science' }),
    unclearRes,
    0,
  );
  assert.equal(r4.classification, 'unclear');
  assert.ok(r4.confidence < 0.3, 'unclear has low confidence (uncertainty preserved)');
});

test('speculative claim is NOT forced to supports on weak (no-stance) evidence', async () => {
  const cls = createHeuristicClassifier();
  // High relevance, NO explicit stance, speculative tier → capped at background.
  const res = mkResult({ id: 'x', title: 'metabolism lifespan longevity', abstract: 'metabolic rate' });
  const out = await cls.classify(
    claim({ id: 'c', text: 'a crystal organism has billion-year lifespan via slow metabolism', tier: 'speculative' }),
    res,
    0.6,
  );
  assert.notEqual(out.classification, 'supports', 'speculative not upgraded to supports on lexical overlap');
  assert.ok(['background', 'contradicts', 'unclear'].includes(out.classification));
});

test('createSupportClassifier returns heuristic when no OpenAI key', async () => {
  const cls = createSupportClassifier({ mode: 'fixture', minRelevance: 0.12 });
  assert.equal(cls.mode, 'fixture');
  assert.equal(cls.name, 'heuristic');
});

// (f) Pipeline determinism -----------------------------------------------------
test('gatherEvidence pipeline is deterministic and back-compatible in shape', async () => {
  const engine = createEvidenceEngine({ mode: 'fixture' }, { now: NOW });
  const claims = [
    claim({ id: 'c-hab', text: 'Liquid water can persist in the habitable zone around a main sequence star', tier: 'known-science' }),
  ];
  const a = await gatherEvidence(claims, engine, NOW);
  const b = await gatherEvidence(claims, engine, NOW);
  assert.deepEqual(a.matches, b.matches);
  assert.equal(a.matches[0].coverage, 'supported');
  // New optional field is populated.
  assert.ok(a.matches[0].results[0].rationale, 'rationale set on results');
  // Existing shape preserved.
  assert.ok('bestSupport' in a.matches[0]);
  assert.ok('topRelevance' in a.matches[0]);
  assert.ok('coverageScore' in a.coverage);
});
