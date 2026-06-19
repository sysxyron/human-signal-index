import { test } from 'node:test';
import assert from 'node:assert/strict';

import { clusterFromSubgraph, composeMembers } from './clustering';
import { computeNarrativeHealth, statusFromMetrics, detectNarrativeAlerts, buildTimeline } from './health';
import type { MemberComposition, NarrativeSnapshot } from './types';
import type { GraphNode, GraphEdge } from '@/lib/evidence-graph/types';

function node(id: string, type: GraphNode['nodeType']): GraphNode {
  return { id, nodeType: type, entityId: `ent-${id}`, label: `${type} ${id}`, status: null, visibility: 'internal', metadata: {}, createdAt: 'x' };
}
function edge(id: string, from: string, to: string, rel: GraphEdge['relationshipType'], conf = 1): GraphEdge {
  return { id, sourceNodeId: from, targetNodeId: to, relationshipType: rel, confidence: conf, provenance: `prov-${id}`, createdAt: 'x' };
}

// ---- clustering (deterministic, explainable) -------------------------------

test('clusterFromSubgraph expands membership over real edges, with reasons + depth', () => {
  const nodes = [node('a', 'INVESTIGATION'), node('b', 'EVIDENCE'), node('c', 'SOURCE'), node('d', 'SIGNAL')];
  const edges = [
    edge('e1', 'b', 'a', 'SUPPORTS', 0.8),
    edge('e3', 'c', 'a', 'RELATED_TO'),
    edge('e2', 'd', 'c', 'DERIVED_FROM'),
  ];
  const members = clusterFromSubgraph({ seedId: 'a', nodes, edges, maxDepth: 2, maxMembers: 50 });
  const byId = Object.fromEntries(members.map((m) => [m.nodeId, m]));
  assert.equal(members.length, 4);
  assert.equal(byId.a.reason, 'Seed node');
  assert.equal(byId.a.depth, 0);
  assert.equal(byId.b.stance, 'supporting');         // reached via SUPPORTS
  assert.match(byId.b.reason, /Supports/);
  assert.equal(byId.c.depth, 1);
  assert.equal(byId.d.depth, 2);                      // d → c → a
  assert.equal(byId.d.stance, 'neutral');
});

test('clusterFromSubgraph respects maxMembers (no runaway)', () => {
  const nodes = [node('a', 'INVESTIGATION'), node('b', 'EVIDENCE'), node('c', 'EVIDENCE'), node('d', 'EVIDENCE')];
  const edges = [edge('e1', 'b', 'a', 'RELATED_TO'), edge('e2', 'c', 'a', 'RELATED_TO'), edge('e3', 'd', 'a', 'RELATED_TO')];
  const members = clusterFromSubgraph({ seedId: 'a', nodes, edges, maxDepth: 3, maxMembers: 2 });
  assert.ok(members.length <= 2);
});

test('composeMembers tallies by type + stance', () => {
  const nodes = [node('a', 'INVESTIGATION'), node('b', 'EVIDENCE'), node('c', 'SOURCE'), node('d', 'SIGNAL')];
  const edges = [edge('e1', 'b', 'a', 'SUPPORTS'), edge('e3', 'c', 'a', 'RELATED_TO'), edge('e2', 'd', 'c', 'DERIVED_FROM')];
  const c = composeMembers(clusterFromSubgraph({ seedId: 'a', nodes, edges, maxDepth: 2, maxMembers: 50 }));
  assert.equal(c.investigations, 1);
  assert.equal(c.evidence, 1);
  assert.equal(c.sources, 1);
  assert.equal(c.signals, 1);
  assert.equal(c.supporting, 1);
  assert.equal(c.distinctSources, 1);
});

// ---- health (explainable, no black box) ------------------------------------

function comp(over: Partial<MemberComposition> = {}): MemberComposition {
  return { total: 10, sources: 3, signals: 2, evidence: 3, reports: 1, investigations: 1, actors: 0, events: 0, organizations: 0, supporting: 2, contradicting: 1, distinctSources: 3, distinctActors: 0, ...over };
}

test('computeNarrativeHealth is explainable + bounded', () => {
  const h = computeNarrativeHealth(comp(), 0);
  assert.ok(h.stabilityScore >= 0 && h.stabilityScore <= 100);
  assert.ok(h.coverage > 0 && h.coverage <= 1);
  assert.ok(h.contradictionRatio > 0 && h.contradictionRatio < 1);
  assert.ok(h.explanation.includes('Stability ='));
  assert.equal(h.factors.length, 5);
});

test('failing sources drag stability down', () => {
  const healthy = computeNarrativeHealth(comp(), 0);
  const degraded = computeNarrativeHealth(comp(), 3);
  assert.ok(degraded.stabilityScore < healthy.stabilityScore);
  assert.equal(degraded.failingSources, 3);
});

test('empty narrative → zero-ish health, never fabricated', () => {
  const h = computeNarrativeHealth(comp({ total: 0, sources: 0, signals: 0, evidence: 0, reports: 0, investigations: 0, supporting: 0, contradicting: 0, distinctSources: 0 }), 0);
  assert.equal(h.coverage, 0);
  assert.equal(h.contradictionRatio, 0);
});

// ---- status ----------------------------------------------------------------

function snap(over: Partial<NarrativeSnapshot> = {}): NarrativeSnapshot {
  return { memberCount: 10, signalCount: 2, evidenceCount: 3, sourceCount: 3, actorCount: 0, contradictionRatio: 0.2, stabilityScore: 60, snapshotAt: '2026-06-18T00:00:00Z', ...over };
}

test('statusFromMetrics: emerging / fragmenting / declining / dominant / active', () => {
  assert.equal(statusFromMetrics(null, snap(), 50), 'emerging');
  assert.equal(statusFromMetrics(snap(), snap({ contradictionRatio: 0.7 }), 50), 'fragmenting');
  assert.equal(statusFromMetrics(snap({ memberCount: 10 }), snap({ memberCount: 5 }), 50), 'declining');
  assert.equal(statusFromMetrics(snap({ memberCount: 20 }), snap({ memberCount: 30 }), 75), 'dominant');
  assert.equal(statusFromMetrics(snap({ memberCount: 10 }), snap({ memberCount: 12 }), 50), 'active');
});

// ---- alerts ----------------------------------------------------------------

test('detectNarrativeAlerts: emerging / growing / declining / fragmenting', () => {
  const emerging = detectNarrativeAlerts({ prev: null, cur: snap(), prevStatus: null, status: 'emerging' });
  assert.equal(emerging[0].alertType, 'NARRATIVE_EMERGING');

  const growing = detectNarrativeAlerts({ prev: snap({ memberCount: 10 }), cur: snap({ memberCount: 16 }), prevStatus: 'active', status: 'active' });
  assert.ok(growing.some((a) => a.alertType === 'NARRATIVE_GROWING'));

  const declining = detectNarrativeAlerts({ prev: snap({ memberCount: 10 }), cur: snap({ memberCount: 6 }), prevStatus: 'active', status: 'declining' });
  assert.ok(declining.some((a) => a.alertType === 'NARRATIVE_DECLINING'));

  const fragmenting = detectNarrativeAlerts({ prev: snap(), cur: snap({ contradictionRatio: 0.7 }), prevStatus: 'active', status: 'fragmenting' });
  assert.ok(fragmenting.some((a) => a.alertType === 'NARRATIVE_FRAGMENTING'));
});

// ---- timeline --------------------------------------------------------------

test('buildTimeline: phases + peak + bounds', () => {
  assert.equal(buildTimeline([]).phase, 'insufficient');
  const t = buildTimeline([
    snap({ memberCount: 4, snapshotAt: '2026-06-01T00:00:00Z' }),
    snap({ memberCount: 9, snapshotAt: '2026-06-05T00:00:00Z' }),
    snap({ memberCount: 14, snapshotAt: '2026-06-10T00:00:00Z' }),
  ]);
  assert.equal(t.points.length, 3);
  assert.equal(t.peakMembers, 14);
  assert.equal(t.phase, 'peak');
  assert.ok(t.firstAppearance && t.latestActivity);
});
