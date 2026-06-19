import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  NODE_TYPES, RELATIONSHIP_TYPES, isNodeType, isRelationshipType,
  traverse, graphDepthFrom, summarizeNode,
  type GraphNode, type GraphEdge, type Neighbor, type NodeType, type RelationshipType,
} from './types';
import { stanceFor, stanceConfidence, RELATIONSHIP_LABEL, NODE_LABEL, FK_CONFIDENCE } from './catalog';
import { nodeKey } from './persistence';

// ---- vocabulary ------------------------------------------------------------

test('12 node types and 15 relationship types', () => {
  assert.equal(NODE_TYPES.length, 12);
  assert.equal(RELATIONSHIP_TYPES.length, 15);
  for (const t of ['SOURCE', 'SIGNAL', 'EVIDENCE', 'NARRATIVE', 'ACTOR', 'ORGANIZATION'] as const) assert.ok(isNodeType(t));
  for (const r of ['SUPPORTS', 'CONTRADICTS', 'DERIVED_FROM', 'CORRECTED_BY', 'WATCHES'] as const) assert.ok(isRelationshipType(r));
  assert.ok(!isNodeType('NOPE'));
  assert.ok(!isRelationshipType('NOPE'));
});

test('every type has a display label', () => {
  for (const t of NODE_TYPES) assert.ok(NODE_LABEL[t as NodeType]);
  for (const r of RELATIONSHIP_TYPES) assert.ok(RELATIONSHIP_LABEL[r as RelationshipType]);
});

test('nodeKey is node_type:entity_id', () => {
  assert.equal(nodeKey('SIGNAL', 'abc'), 'SIGNAL:abc');
});

// ---- deterministic confidence (no fabrication) -----------------------------

test('stanceFor: support>=challenge supports, else contradicts', () => {
  assert.equal(stanceFor(5, 2), 'SUPPORTS');
  assert.equal(stanceFor(2, 2), 'SUPPORTS');
  assert.equal(stanceFor(1, 4), 'CONTRADICTS');
});

test('stanceConfidence: explicit strength wins; else majority share; else neutral', () => {
  assert.equal(stanceConfidence(0, 0, 0.83), 0.83);   // explicit strength
  assert.equal(stanceConfidence(8, 2, null), 0.8);    // 8/10 majority
  assert.equal(stanceConfidence(0, 0, null), 0.5);    // no signal → neutral, not fabricated
  assert.ok(stanceConfidence(3, 1, 2 /* invalid */) >= 0 && stanceConfidence(3, 1, 2) <= 1);
});

test('FK confidence is a recorded fact (1.0)', () => {
  assert.equal(FK_CONFIDENCE, 1);
});

// ---- pure traversal (large graphs never blow up) ---------------------------

const EDGES = [
  { from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'd' }, { from: 'a', to: 'e' },
];

test('traverse respects maxDepth', () => {
  const r1 = traverse(EDGES, 'a', 1, 100);
  assert.deepEqual(new Set(r1.nodeIds), new Set(['a', 'b', 'e']));
  const r2 = traverse(EDGES, 'a', 2, 100);
  assert.ok(r2.nodeIds.includes('c'));
  assert.equal(r2.depthOf.get('c'), 2);
});

test('traverse caps total nodes and reports truncation', () => {
  const star = [{ from: 'a', to: 'b' }, { from: 'a', to: 'c' }, { from: 'a', to: 'd' }];
  const r = traverse(star, 'a', 3, 2);
  assert.equal(r.nodeIds.length, 2);
  assert.equal(r.truncated, true);
});

test('graphDepthFrom returns the deepest reachable level', () => {
  assert.equal(graphDepthFrom(EDGES, 'a', 5, 100), 3); // a→b→c→d
});

// ---- node summary ----------------------------------------------------------

function node(id: string, type: NodeType): GraphNode {
  return { id, nodeType: type, entityId: id, label: id, status: null, visibility: 'internal', metadata: {}, createdAt: 'x' };
}
function edge(rel: RelationshipType): GraphEdge {
  return { id: `e-${rel}-${Math.round(0)}`, sourceNodeId: 'n', targetNodeId: 'm', relationshipType: rel, confidence: 1, provenance: 'p', createdAt: 'x' };
}
function nb(type: NodeType, rel: RelationshipType, id: string = type): Neighbor {
  return { edge: { ...edge(rel), id: `${rel}-${id}` }, node: node(id, type), direction: 'outgoing' };
}

test('summarizeNode counts by node type + relationship + supporting/contradicting', () => {
  const neighbors: Neighbor[] = [
    nb('SOURCE', 'DERIVED_FROM', 's1'),
    nb('SIGNAL', 'DERIVED_FROM', 'sig1'),
    nb('EVIDENCE', 'SUPPORTS', 'ev1'),
    nb('EVIDENCE', 'CONTRADICTS', 'ev2'),
    nb('REPORT', 'PUBLISHED_AS', 'r1'),
    nb('CORRECTION', 'CORRECTED_BY', 'c1'),
  ];
  const s = summarizeNode(neighbors, 3);
  assert.equal(s.connectedSources, 1);
  assert.equal(s.connectedSignals, 1);
  assert.equal(s.connectedEvidence, 2);
  assert.equal(s.connectedReports, 1);
  assert.equal(s.connectedCorrections, 1);
  assert.equal(s.supportingEvidence, 1);
  assert.equal(s.contradictingEvidence, 1);
  assert.equal(s.relationshipCount, 6);
  assert.equal(s.graphDepth, 3);
  assert.equal(s.byRelationship.DERIVED_FROM, 2);
});
