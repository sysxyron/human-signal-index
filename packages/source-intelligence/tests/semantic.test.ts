import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifySignalSemantic,
  clusterNarratives,
  type SemanticDeps,
} from '../src/semantic';

const NOW = '2026-01-01T00:00:00.000Z';

/**
 * A deterministic, offline "embedding": a small bag-of-keywords vector. Each
 * dimension is the count of a keyword in the text. This is NOT a real embedder —
 * it only needs to be deterministic so cosine similarity is stable in tests.
 */
function makeKeywordEmbed(keywords: string[]): SemanticDeps['embed'] {
  return async (texts: string[]): Promise<number[][]> =>
    texts.map((t) => {
      const lower = t.toLowerCase();
      return keywords.map((k) => {
        let n = 0;
        let idx = lower.indexOf(k);
        while (idx >= 0) {
          n += 1;
          idx = lower.indexOf(k, idx + k.length);
        }
        return n;
      });
    });
}

test('classifySignalSemantic: no embed fn → lexical fallback with matchedTerms', async () => {
  const out = await classifySignalSemantic(
    {
      title: 'Extinctionism and voluntary human extinction',
      bodyText: 'The movement embraces efilism, antinatalism and promortalism.',
      sourceType: 'website',
    },
    { now: NOW },
  );
  assert.equal(out.category, 'extinction');
  assert.deepEqual(out.semanticNeighbors, []);
  assert.ok(out.matchedTerms.length > 0, 'matchedTerms should be populated');
  assert.ok(out.matchedTerms.includes('extinctionism'));
  assert.match(out.rationale, /Lexical-only/);
});

test('classifySignalSemantic: injected embed → semanticNeighbors populated', async () => {
  const embed = makeKeywordEmbed([
    'extinction',
    'population',
    'collapse',
    'artificial intelligence',
    'technocracy',
  ]);
  const out = await classifySignalSemantic(
    {
      title: 'Human extinction and the end of humanity',
      bodyText: 'extinction extinction extinctionism voluntary human extinction',
      sourceType: 'website',
    },
    { embed, now: NOW },
  );
  assert.ok(out.semanticNeighbors.length > 0, 'semanticNeighbors should be populated');
  // Top neighbor should be the extinction prototype.
  assert.equal(out.semanticNeighbors[0].label, 'extinction');
  assert.equal(out.category, 'extinction');
  assert.ok(out.confidence > 0.5);
});

test('classifySignalSemantic: ambiguous text preserves uncertainty', async () => {
  // Keyword embed where the text matches NOTHING → all-zero vectors → cosine 0.
  const embed = makeKeywordEmbed(['extinction', 'population', 'collapse']);
  const out = await classifySignalSemantic(
    { title: 'My weekend baking recipes', bodyText: 'flour sugar butter eggs whisk', sourceType: 'website' },
    { embed, now: NOW },
  );
  assert.equal(out.category, 'other');
  assert.ok(out.confidence <= 0.3, `confidence ${out.confidence}`);
  assert.match(out.rationale, /uncertainty preserved/i);
});

test('classifySignalSemantic: embed failure degrades to lexical (never throws)', async () => {
  const badEmbed: SemanticDeps['embed'] = async () => {
    throw new Error('embedding backend down');
  };
  const out = await classifySignalSemantic(
    { title: 'Population reduction and depopulation', sourceType: 'website' },
    { embed: badEmbed, now: NOW },
  );
  assert.equal(out.category, 'population');
  assert.deepEqual(out.semanticNeighbors, []);
  assert.match(out.rationale, /fell back to lexical/);
});

test('clusterNarratives: lexical fallback groups related signals', async () => {
  const { clusters } = await clusterNarratives([
    { id: 's1', title: 'Population reduction is a moral imperative', bodyText: 'depopulation population control overpopulation', category: 'population' },
    { id: 's2', title: 'Why depopulation and population control matter', bodyText: 'overpopulation depopulation population reduction', category: 'population' },
    { id: 's3', title: 'A neighborhood gardening newsletter', bodyText: 'composting seasonal planting tomatoes herbs', category: 'other' },
  ]);
  // The two population signals cluster together; the gardening one is separate.
  const popCluster = clusters.find((c) => c.signalIds.includes('s1'));
  assert.ok(popCluster, 'population cluster exists');
  assert.ok(popCluster!.signalIds.includes('s2'), 's1 and s2 cluster together');
  assert.ok(!popCluster!.signalIds.includes('s3'), 's3 is separate');
  assert.ok(popCluster!.centroidTerms.length > 0, 'centroid terms present');
});
