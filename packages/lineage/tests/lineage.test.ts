import { test } from 'node:test';
import assert from 'node:assert/strict';

import { getSignalLineage, getInvestigationLineage, getPublicationLineage, getContributorLineage } from '../src/lineage';
import { buildGraph, componentFrom } from '../src/graph';
import { demoEdges } from '../src/fixtures';

test('signal lineage traces the whole chain (where it came from + what resulted)', () => {
  const l = getSignalLineage(demoEdges, 's1');
  assert.equal(l.root.id, 's1');
  assert.deepEqual(l.investigations.map((n) => n.id), ['i1']);
  assert.deepEqual(l.publications.map((n) => n.id), ['p1']);
  assert.deepEqual(l.outcomes.map((n) => n.id), ['o1']);
  assert.deepEqual(l.evidence.map((n) => n.id), ['e1']);
  assert.deepEqual(l.contributors.map((n) => n.id), ['u1']);
  assert.ok(l.depth >= 2);
});

test('two signals feed one investigation (many-to-many upstream)', () => {
  const l = getInvestigationLineage(demoEdges, 'i1');
  assert.deepEqual(l.signals.map((n) => n.id).sort(), ['s1', 's2']);
});

test('publication lineage returns origin signals + evidence + outcomes', () => {
  const l = getPublicationLineage(demoEdges, 'p1');
  assert.deepEqual(l.signals.map((n) => n.id).sort(), ['s1', 's2']);
  assert.deepEqual(l.evidence.map((n) => n.id), ['e1']);
  assert.deepEqual(l.outcomes.map((n) => n.id), ['o1']);
});

test('contributor lineage returns artifacts they touched', () => {
  const l = getContributorLineage(demoEdges, 'u1');
  assert.deepEqual(l.investigations.map((n) => n.id), ['i1']);
  assert.ok(l.publications.length >= 1); // reachable through the investigation
});

test('unknown root → isolated lineage (no throw)', () => {
  const l = getSignalLineage(demoEdges, 'does-not-exist');
  assert.equal(l.signals.length, 0);
  assert.equal(l.investigations.length, 0);
  assert.equal(l.depth, 0);
});

test('empty edges → empty lineage', () => {
  const l = getSignalLineage([], 's1');
  assert.equal(l.investigations.length, 0);
});

test('graph build + component traversal is undirected', () => {
  const g = buildGraph(demoEdges);
  const comp = componentFrom(g, 'outcome:o1');
  // from the outcome we can still reach the originating signals (undirected)
  assert.ok(comp.has('signal:s1'));
  assert.ok(comp.has('signal:s2'));
});
