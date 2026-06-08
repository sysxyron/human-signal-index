import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmbedder,
  localLexicalEmbed,
  LOCAL_EMBED_DIM,
} from '../src/semantic';
import {
  detectCommunities,
  computeAmplificationScores,
  clusterNarrativesCrossSource,
  sourceNarrativeOverlap,
} from '../src/graph';
import { computeSourceReliability } from '../src/reliability';
import { cosine01 } from '../src/internal/vector';

const NOW = '2026-01-01T00:00:00.000Z';

// ---- local embeddings ------------------------------------------------------

test('localLexicalEmbed: deterministic + L2-normalized + correct dim', () => {
  const a1 = localLexicalEmbed(['population reduction is a moral imperative']);
  const a2 = localLexicalEmbed(['population reduction is a moral imperative']);
  assert.deepEqual(a1, a2, 'identical input → identical output');
  assert.equal(a1[0].length, LOCAL_EMBED_DIM);
  const norm = Math.sqrt(a1[0].reduce((s, x) => s + x * x, 0));
  assert.ok(Math.abs(norm - 1) < 1e-9, `L2 norm ~1, got ${norm}`);
});

test('localLexicalEmbed: similar texts closer than dissimilar', () => {
  const [a, b, c] = localLexicalEmbed([
    'population reduction and depopulation policy',
    'depopulation and population reduction are debated',
    'a cozy newsletter about baking sourdough bread',
  ]);
  const simAB = cosine01(a, b);
  const simAC = cosine01(a, c);
  assert.ok(simAB > simAC, `similar(${simAB}) should exceed dissimilar(${simAC})`);
});

test('createEmbedder: no key → local-lexical; key → openai label', async () => {
  const local = createEmbedder();
  assert.equal(local.method, 'local-lexical');
  const v = await local.embed(['hello world']);
  assert.equal(v[0].length, LOCAL_EMBED_DIM);

  const openai = createEmbedder({ openaiApiKey: 'sk-test' });
  assert.equal(openai.method, 'openai');

  const forcedLocal = createEmbedder({ openaiApiKey: 'sk-test', local: true });
  assert.equal(forcedLocal.method, 'local-lexical');
});

// ---- community detection ---------------------------------------------------

test('detectCommunities: two separated clusters → 2 communities', () => {
  const { communities, membership } = detectCommunities({
    nodes: [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
      { id: 'x', label: 'X' },
      { id: 'y', label: 'Y' },
      { id: 'z', label: 'Z' },
    ],
    edges: [
      { source: 'a', target: 'b', weight: 1 },
      { source: 'b', target: 'c', weight: 1 },
      { source: 'a', target: 'c', weight: 1 },
      { source: 'x', target: 'y', weight: 1 },
      { source: 'y', target: 'z', weight: 1 },
      { source: 'x', target: 'z', weight: 1 },
    ],
  });
  assert.equal(communities.length, 2, 'two disjoint triangles → two communities');
  // a,b,c share one community; x,y,z share another.
  assert.equal(membership['a'], membership['b']);
  assert.equal(membership['b'], membership['c']);
  assert.equal(membership['x'], membership['y']);
  assert.notEqual(membership['a'], membership['x']);
});

// ---- amplification ---------------------------------------------------------

test('computeAmplificationScores: more sources + recency → higher score', () => {
  const { scores } = computeAmplificationScores(
    {
      narratives: [
        { id: 'n1', label: 'Broad + recent', signalIds: ['s1', 's2', 's3'] },
        { id: 'n2', label: 'Narrow + stale', signalIds: ['s4'] },
      ],
      signals: [
        { id: 's1', sourceId: 'src-a', capturedAt: '2025-12-31T00:00:00.000Z' },
        { id: 's2', sourceId: 'src-b', capturedAt: '2025-12-30T00:00:00.000Z' },
        { id: 's3', sourceId: 'src-c', capturedAt: '2025-12-29T00:00:00.000Z' },
        { id: 's4', sourceId: 'src-a', capturedAt: '2024-01-01T00:00:00.000Z' },
      ],
    },
    NOW,
  );
  const n1 = scores.find((s) => s.narrativeId === 'n1')!;
  const n2 = scores.find((s) => s.narrativeId === 'n2')!;
  assert.ok(n1.amplification > n2.amplification, `${n1.amplification} > ${n2.amplification}`);
  assert.equal(n1.sourceCount, 3);
  assert.ok(n1.rationale.length > 0, 'rationale present');
  assert.ok(scores[0].amplification >= scores[1].amplification, 'sorted desc');
});

// ---- source reliability ----------------------------------------------------

test('computeSourceReliability: high success + approved → high tier', () => {
  const r = computeSourceReliability({
    sourceId: 'good',
    captureSuccessRate: 0.98,
    reviewedApprovedRate: 0.95,
    signalCount: 60,
    ageDays: 200,
  });
  assert.equal(r.tier, 'high');
  assert.ok(r.reliabilityScore >= 70);
  assert.ok(r.rationale.includes('good'));
});

test('computeSourceReliability: high blocked rate lowers score', () => {
  const base = computeSourceReliability({
    sourceId: 's',
    captureSuccessRate: 0.9,
    reviewedApprovedRate: 0.8,
    signalCount: 40,
    ageDays: 100,
  });
  const blocked = computeSourceReliability({
    sourceId: 's',
    captureSuccessRate: 0.9,
    reviewedApprovedRate: 0.8,
    signalCount: 40,
    ageDays: 100,
    blockedRate: 0.7,
  });
  assert.ok(blocked.reliabilityScore < base.reliabilityScore, 'blocked erodes score');
});

test('computeSourceReliability: thin track record → unproven', () => {
  const r = computeSourceReliability({
    sourceId: 'new',
    captureSuccessRate: 1,
    signalCount: 1,
  });
  assert.equal(r.tier, 'unproven');
  assert.ok(r.reliabilityScore <= 49);
});

// ---- cross-source clustering ----------------------------------------------

test('clusterNarrativesCrossSource: 2 sources same theme → one cluster, both sourceIds', async () => {
  const { clusters } = await clusterNarrativesCrossSource([
    {
      id: 's1',
      sourceId: 'src-a',
      title: 'Population reduction is a moral imperative',
      bodyText: 'depopulation population control overpopulation reduction',
      category: 'population',
    },
    {
      id: 's2',
      sourceId: 'src-b',
      title: 'Why depopulation and population control matter',
      bodyText: 'overpopulation depopulation population reduction control',
      category: 'population',
    },
    {
      id: 's3',
      sourceId: 'src-c',
      title: 'A neighborhood gardening newsletter',
      bodyText: 'composting seasonal planting tomatoes herbs',
      category: 'other',
    },
  ]);
  const pop = clusters.find((c) => c.signalIds.includes('s1'))!;
  assert.ok(pop.signalIds.includes('s2'), 's1 and s2 cluster together');
  assert.deepEqual(pop.sourceIds, ['src-a', 'src-b'], 'cluster tagged with both sources');
  assert.ok(!pop.signalIds.includes('s3'), 'gardening signal is separate');
});

test('sourceNarrativeOverlap: sources sharing a narrative show overlap', async () => {
  const overlaps = await sourceNarrativeOverlap([
    { id: 's1', sourceId: 'src-a', title: 'Population reduction', bodyText: 'depopulation population control overpopulation', category: 'population' },
    { id: 's2', sourceId: 'src-b', title: 'Population control', bodyText: 'depopulation population reduction overpopulation', category: 'population' },
  ]);
  const pair = overlaps.find((o) => o.a === 'src-a' && o.b === 'src-b');
  assert.ok(pair, 'overlap entry exists for the two sources');
  assert.ok(pair!.sharedNarratives >= 1);
  assert.ok(pair!.overlapScore > 0);
});
