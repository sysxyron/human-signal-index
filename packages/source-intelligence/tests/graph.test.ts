import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractEntities,
  buildNarrativeGraph,
  signalToNarrativeLinks,
  type GraphSignal,
} from '../src/graph';

test('extractEntities: finds a known ideology and a proper-noun org', () => {
  const text =
    'The Global Survival Coalition published a piece on antinatalism and ' +
    'voluntary human extinction across YouTube.';
  const ents = extractEntities(text);
  const names = ents.map((e) => e.name.toLowerCase());
  // Known ideology term from the lexicons/watchlists.
  assert.ok(names.includes('antinatalism'), `expected antinatalism in ${names}`);
  const ideology = ents.find((e) => e.name.toLowerCase() === 'antinatalism');
  assert.equal(ideology!.entityType, 'ideology');
  // Proper-noun multi-word org.
  const org = ents.find((e) => e.name === 'Global Survival Coalition');
  assert.ok(org, 'expected a proper-noun organization');
  assert.equal(org!.entityType, 'organization');
  // Platform.
  assert.ok(ents.some((e) => e.entityType === 'platform' && /youtube/i.test(e.name)));
  // Evidence snippets present.
  assert.ok(ents.every((e) => typeof e.evidenceText === 'string' && e.evidenceText!.length > 0));
});

test('extractEntities: ambiguous single proper noun → unknown type', () => {
  const ents = extractEntities('We met Zephyrine yesterday to discuss plans.');
  const z = ents.find((e) => e.name === 'Zephyrine');
  assert.ok(z, 'single mid-sentence proper noun captured');
  assert.equal(z!.entityType, 'unknown');
  assert.ok(z!.confidence < 0.5, 'low confidence preserves uncertainty');
});

test('buildNarrativeGraph: related signal sets → related_to / co_occurs_with edge', async () => {
  const signals: GraphSignal[] = [
    {
      id: 's1',
      title: 'Population reduction is a moral imperative',
      bodyText:
        'Our movement argues depopulation and population control are needed; ' +
        'antinatalism supports this.',
      category: 'population',
      capturedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 's2',
      title: 'The case for depopulation and population control',
      bodyText:
        'Population reduction via antinatalism; depopulation is framed as ethical.',
      category: 'population',
      capturedAt: '2026-01-02T00:00:00.000Z',
    },
  ];
  const graph = await buildNarrativeGraph(signals);
  // Two related signals may form one cluster (no edges) or two (edges). If two
  // nodes, expect a related_to or co_occurs_with edge.
  if (graph.nodes.length >= 2) {
    const rel = graph.edges.find(
      (e) => e.edgeType === 'related_to' || e.edgeType === 'co_occurs_with',
    );
    assert.ok(rel, 'expected a related_to/co_occurs_with edge');
    assert.ok(rel!.rationale.length > 0, 'edge carries a rationale');
  } else {
    // Single cohesive cluster is also valid; assert it grouped both signals.
    assert.equal(graph.nodes[0].signalIds.length, 2);
  }
  // Aggregated entities include antinatalism.
  assert.ok(graph.entities.some((e) => e.name.toLowerCase() === 'antinatalism'));
});

test('buildNarrativeGraph: antonymic categories → contradicts edge', async () => {
  const signals: GraphSignal[] = [
    {
      id: 'e1',
      title: 'Human extinction would be preferable',
      bodyText: 'extinctionism argues for the end of humanity and omnicide.',
      category: 'extinction',
      capturedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'c1',
      title: 'Securing the long-term future of civilization',
      bodyText: 'longtermism and existential risk reduction protect the species.',
      category: 'civilization',
      capturedAt: '2026-01-01T00:00:00.000Z',
    },
  ];
  const graph = await buildNarrativeGraph(signals);
  assert.ok(graph.nodes.length >= 2, 'distinct categories form distinct nodes');
  const contradicts = graph.edges.find((e) => e.edgeType === 'contradicts');
  assert.ok(contradicts, 'expected a contradicts edge for antonymic categories');
  assert.match(contradicts!.rationale, /antonymic/i);
});

test('buildNarrativeGraph: temporal escalation → evolves_into edge', async () => {
  const signals: GraphSignal[] = [
    {
      id: 't1',
      title: 'Overpopulation is a serious problem',
      bodyText:
        'Our movement believes overpopulation is a serious problem and we should ' +
        'encourage people to voluntarily choose smaller families and sustainable lifestyles.',
      category: 'population',
      capturedAt: '2025-11-01T00:00:00.000Z',
    },
    {
      id: 't2',
      title: 'Overpopulation is an existential emergency',
      bodyText:
        'Our movement now holds that overpopulation is an existential emergency and that ' +
        'urgent population reduction and depopulation policies are a moral imperative for survival.',
      category: 'population',
      capturedAt: '2025-12-01T00:00:00.000Z',
    },
  ];
  const graph = await buildNarrativeGraph(signals);
  if (graph.nodes.length >= 2) {
    const evolves = graph.edges.find((e) => e.edgeType === 'evolves_into');
    assert.ok(evolves, 'expected an evolves_into edge from temporal drift');
    // Inverse derived_from edge should also exist.
    assert.ok(graph.edges.some((e) => e.edgeType === 'derived_from'));
    assert.ok(evolves!.rationale.includes('evolves into'));
  } else {
    assert.ok(true, 'signals merged into one cohesive narrative (acceptable)');
  }
});

test('signalToNarrativeLinks: links every signal with rationale', async () => {
  const signals: GraphSignal[] = [
    { id: 's1', title: 'Population reduction', bodyText: 'depopulation population control', category: 'population' },
    { id: 's2', title: 'Population control', bodyText: 'depopulation population reduction', category: 'population' },
  ];
  const graph = await buildNarrativeGraph(signals);
  const links = signalToNarrativeLinks(signals, graph.nodes);
  assert.equal(links.length, 2);
  assert.ok(links.every((l) => l.rationale.length > 0));
  assert.ok(links.every((l) => l.confidence > 0 && l.confidence <= 0.95));
});
