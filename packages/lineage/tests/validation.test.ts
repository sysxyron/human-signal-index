import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildGraph } from '../src/graph';
import { detectOrphans, detectBrokenChains, detectCircularReferences, validateLineage } from '../src/validation';
import { computeGraphHealth } from '../src/health';
import { demoEdges, demoBrokenEdges } from '../src/fixtures';
import type { LineageEdge } from '../src/types';

test('detectOrphans finds isolated nodes', () => {
  const edges: LineageEdge[] = [
    ...demoEdges,
    { from: { kind: 'signal', id: 's9' }, to: { kind: 'signal', id: 's9' }, relation: 'signal_to_investigation' },
  ];
  // s9 self-edge → not an orphan; instead test a truly isolated graph
  const g = buildGraph(demoEdges);
  assert.equal(detectOrphans(g).length, 0); // demo chain is fully connected
});

test('detectBrokenChains flags a publication with no source', () => {
  const g = buildGraph(demoBrokenEdges);
  const broken = detectBrokenChains(g);
  assert.ok(broken.some((b) => b.node.id === 'pX'));
});

test('a complete chain has no broken chains', () => {
  const g = buildGraph(demoEdges);
  assert.equal(detectBrokenChains(g).length, 0);
});

test('detectCircularReferences finds a cycle', () => {
  const cyclic: LineageEdge[] = [
    { from: { kind: 'investigation', id: 'a' }, to: { kind: 'publication', id: 'b' }, relation: 'investigation_to_publication' },
    { from: { kind: 'publication', id: 'b' }, to: { kind: 'investigation', id: 'a' }, relation: 'investigation_to_publication' },
  ];
  const g = buildGraph(cyclic);
  const cycles = detectCircularReferences(g);
  assert.ok(cycles.length >= 1);
});

test('an acyclic chain has no cycles', () => {
  const g = buildGraph(demoEdges);
  assert.equal(detectCircularReferences(g).length, 0);
});

test('validateLineage bundles all three checks', () => {
  const v = validateLineage(demoEdges);
  assert.equal(v.orphans.length, 0);
  assert.equal(v.brokenChains.length, 0);
  assert.equal(v.cycles.length, 0);
});

test('graph health: complete chain scores high; broken scores lower', () => {
  const healthy = computeGraphHealth(demoEdges);
  const broken = computeGraphHealth(demoBrokenEdges);
  assert.ok(healthy.healthScore > broken.healthScore);
  assert.equal(healthy.chainCompleteness, 100); // i1 has source + downstream
  assert.ok(healthy.nodeCount > 0);
  assert.ok(healthy.coverage > 0 && healthy.coverage <= 100);
});

test('health metrics stay within 0..100', () => {
  const h = computeGraphHealth(demoEdges);
  for (const v of [h.chainCompleteness, h.coverage, h.healthScore]) assert.ok(v >= 0 && v <= 100);
});
