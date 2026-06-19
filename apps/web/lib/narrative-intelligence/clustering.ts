// =============================================================================
// HSI Phase 65 — Narrative clustering (PURE, no I/O, no LLM).
//
// Given a SEED graph node and the Phase 64 subgraph around it, expand membership
// DETERMINISTICALLY via real provenance-backed edges (bounded BFS). Every member
// records WHY it joined (the relationship + provenance) and at what depth — so a
// narrative cluster is fully explainable. No semantic guessing, no fabrication.
//
// Relative imports for VALUES (catalog) so the unit tests resolve from any cwd.
// =============================================================================

import type { GraphNode, GraphEdge, NodeType } from '../evidence-graph/types';
import { RELATIONSHIP_LABEL } from '../evidence-graph/catalog';
import type { NarrativeMember, MemberComposition, Stance } from './types';

interface AdjEntry { neighbor: string; edge: GraphEdge }

function stanceForEdge(edge: GraphEdge, toward: 'seed' | 'member'): Stance {
  if (edge.relationshipType === 'SUPPORTS') return 'supporting';
  if (edge.relationshipType === 'CONTRADICTS') return 'contradicting';
  void toward;
  return 'neutral';
}

/**
 * Deterministic membership expansion. BFS from the seed over the subgraph; the
 * edge used to first reach a node becomes that member's explainable reason.
 */
export function clusterFromSubgraph(input: {
  seedId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  maxDepth: number;
  maxMembers: number;
}): NarrativeMember[] {
  const { seedId, nodes, edges, maxDepth, maxMembers } = input;
  const nodeById = new Map<string, GraphNode>();
  for (const n of nodes) nodeById.set(n.id, n);

  const adj = new Map<string, AdjEntry[]>();
  for (const e of edges) {
    (adj.get(e.sourceNodeId) ?? adj.set(e.sourceNodeId, []).get(e.sourceNodeId)!).push({ neighbor: e.targetNodeId, edge: e });
    (adj.get(e.targetNodeId) ?? adj.set(e.targetNodeId, []).get(e.targetNodeId)!).push({ neighbor: e.sourceNodeId, edge: e });
  }

  const depthOf = new Map<string, number>([[seedId, 0]]);
  const reachEdge = new Map<string, GraphEdge>();
  const order: string[] = [seedId];
  let head = 0;
  while (head < order.length) {
    const cur = order[head++];
    const d = depthOf.get(cur)!;
    if (d >= maxDepth) continue;
    for (const { neighbor, edge } of adj.get(cur) ?? []) {
      if (depthOf.has(neighbor)) continue;
      if (order.length >= maxMembers) break;
      depthOf.set(neighbor, d + 1);
      reachEdge.set(neighbor, edge);
      order.push(neighbor);
    }
    if (order.length >= maxMembers) break;
  }

  const members: NarrativeMember[] = [];
  for (const id of order) {
    const node = nodeById.get(id);
    if (!node) continue;
    const depth = depthOf.get(id)!;
    if (id === seedId) {
      members.push({ nodeId: id, memberType: node.nodeType, label: node.label, reason: 'Seed node', confidence: 1, depth: 0, stance: 'neutral' });
      continue;
    }
    const e = reachEdge.get(id);
    const reason = e ? `${RELATIONSHIP_LABEL[e.relationshipType]} — ${e.provenance ?? 'graph edge'}` : 'graph adjacency';
    const stance: Stance = e ? stanceForEdge(e, 'member') : 'neutral';
    const confidence = e ? e.confidence : 0.5;
    members.push({ nodeId: id, memberType: node.nodeType, label: node.label, reason, confidence, depth, stance });
  }
  return members;
}

/** Tally a membership set by node type + stance (computed; no fabrication). */
export function composeMembers(members: NarrativeMember[]): MemberComposition {
  const c: MemberComposition = {
    total: members.length, sources: 0, signals: 0, evidence: 0, reports: 0, investigations: 0,
    actors: 0, events: 0, organizations: 0, supporting: 0, contradicting: 0, distinctSources: 0, distinctActors: 0,
  };
  const sourceIds = new Set<string>();
  const actorIds = new Set<string>();
  for (const m of members) {
    countType(c, m.memberType);
    if (m.memberType === 'SOURCE') sourceIds.add(m.nodeId);
    if (m.memberType === 'ACTOR') actorIds.add(m.nodeId);
    if (m.memberType === 'EVIDENCE' || m.memberType === 'CLAIM') {
      if (m.stance === 'supporting') c.supporting += 1;
      else if (m.stance === 'contradicting') c.contradicting += 1;
    }
  }
  c.distinctSources = sourceIds.size;
  c.distinctActors = actorIds.size;
  return c;
}

function countType(c: MemberComposition, t: NodeType): void {
  switch (t) {
    case 'SOURCE': c.sources += 1; break;
    case 'SIGNAL': c.signals += 1; break;
    case 'EVIDENCE': case 'CLAIM': c.evidence += 1; break;
    case 'REPORT': c.reports += 1; break;
    case 'INVESTIGATION': c.investigations += 1; break;
    case 'ACTOR': c.actors += 1; break;
    case 'EVENT': c.events += 1; break;
    case 'ORGANIZATION': c.organizations += 1; break;
  }
}
