// =============================================================================
// HSI Phase 64 — Evidence Graph: shared types + PURE helpers (no I/O).
//
// The node/relationship vocabulary, the graph data shapes, a pure bounded
// traversal (so large graphs never crash — capped breadth + depth), and the pure
// node-summary aggregation. PURE: no imports, no clocks, no DB.
// =============================================================================

/** Node types (all stored in one graph). NARRATIVE/ACTOR/EVENT/ORGANIZATION are
 *  supported for Phase 65 readiness; the auto-builder fills the rest. */
export const NODE_TYPES = [
  'SOURCE', 'SIGNAL', 'EVIDENCE', 'CLAIM', 'INVESTIGATION', 'REPORT',
  'CORRECTION', 'WATCHLIST', 'NARRATIVE', 'ACTOR', 'EVENT', 'ORGANIZATION',
] as const;
export type NodeType = (typeof NODE_TYPES)[number];

/** Canonical relationship types (Deliverable 2). */
export const RELATIONSHIP_TYPES = [
  'SUPPORTS', 'CONTRADICTS', 'REFERENCES', 'DUPLICATES', 'DERIVED_FROM', 'RELATED_TO',
  'SAME_SOURCE', 'SAME_ACTOR', 'SAME_EVENT', 'PART_OF', 'PUBLISHED_AS', 'CORRECTED_BY',
  'WATCHES', 'MENTIONS', 'INVESTIGATES',
] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export function isNodeType(v: unknown): v is NodeType {
  return typeof v === 'string' && (NODE_TYPES as readonly string[]).includes(v);
}
export function isRelationshipType(v: unknown): v is RelationshipType {
  return typeof v === 'string' && (RELATIONSHIP_TYPES as readonly string[]).includes(v);
}

export interface GraphNode {
  id: string;
  nodeType: NodeType;
  entityId: string;
  label: string;
  status: string | null;
  visibility: 'public' | 'internal' | 'restricted';
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface GraphEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationshipType: RelationshipType;
  confidence: number;
  provenance: string | null;
  createdAt: string;
}

export interface Neighbor {
  edge: GraphEdge;
  node: GraphNode;
  direction: 'outgoing' | 'incoming';
}

export interface NodeSummary {
  connectedSources: number;
  connectedSignals: number;
  connectedEvidence: number;
  connectedReports: number;
  connectedCorrections: number;
  supportingEvidence: number;
  contradictingEvidence: number;
  relationshipCount: number;
  graphDepth: number;
  byRelationship: Record<string, number>;
}

export interface GraphStats {
  totalNodes: number;
  totalEdges: number;
  avgConnectivity: number; // edges*2 / nodes
  nodesByType: Record<string, number>;
  edgesByRelationship: Record<string, number>;
}

// ---- pure bounded traversal -------------------------------------------------

export interface EdgeLite { from: string; to: string }
export interface TraversalResult { nodeIds: string[]; depthOf: Map<string, number>; truncated: boolean }

/**
 * Bounded BFS over an undirected view of edges. Caps both depth and total nodes
 * so a huge graph can never blow up the request — when the cap is hit it returns
 * `truncated: true` and stops (server-side paging handles the rest).
 */
export function traverse(edges: EdgeLite[], start: string, maxDepth: number, maxNodes: number): TraversalResult {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    (adj.get(e.from) ?? adj.set(e.from, []).get(e.from)!).push(e.to);
    (adj.get(e.to) ?? adj.set(e.to, []).get(e.to)!).push(e.from);
  }
  const depthOf = new Map<string, number>([[start, 0]]);
  const order: string[] = [start];
  let head = 0;
  let truncated = false;
  while (head < order.length) {
    const cur = order[head++];
    const d = depthOf.get(cur)!;
    if (d >= maxDepth) continue;
    for (const nb of adj.get(cur) ?? []) {
      if (depthOf.has(nb)) continue;
      if (order.length >= maxNodes) { truncated = true; break; }
      depthOf.set(nb, d + 1);
      order.push(nb);
    }
    if (truncated) break;
  }
  return { nodeIds: order, depthOf, truncated };
}

/** Graph depth = the maximum BFS depth reached from a node (bounded). */
export function graphDepthFrom(edges: EdgeLite[], start: string, maxDepth = 5, maxNodes = 500): number {
  const { depthOf } = traverse(edges, start, maxDepth, maxNodes);
  let max = 0;
  for (const d of depthOf.values()) if (d > max) max = d;
  return max;
}

/** Pure node-summary aggregation from a node's neighbors. */
export function summarizeNode(neighbors: Neighbor[], depth: number): NodeSummary {
  const byRelationship: Record<string, number> = {};
  let connectedSources = 0, connectedSignals = 0, connectedEvidence = 0, connectedReports = 0, connectedCorrections = 0;
  let supportingEvidence = 0, contradictingEvidence = 0;
  for (const nb of neighbors) {
    byRelationship[nb.edge.relationshipType] = (byRelationship[nb.edge.relationshipType] ?? 0) + 1;
    switch (nb.node.nodeType) {
      case 'SOURCE': connectedSources += 1; break;
      case 'SIGNAL': connectedSignals += 1; break;
      case 'EVIDENCE': case 'CLAIM': connectedEvidence += 1; break;
      case 'REPORT': connectedReports += 1; break;
      case 'CORRECTION': connectedCorrections += 1; break;
    }
    if (nb.edge.relationshipType === 'SUPPORTS') supportingEvidence += 1;
    if (nb.edge.relationshipType === 'CONTRADICTS') contradictingEvidence += 1;
  }
  return {
    connectedSources, connectedSignals, connectedEvidence, connectedReports, connectedCorrections,
    supportingEvidence, contradictingEvidence, relationshipCount: neighbors.length, graphDepth: depth, byRelationship,
  };
}
