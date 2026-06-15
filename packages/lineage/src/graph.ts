// =============================================================================
// Lineage graph — build adjacency + traversal. PURE + DETERMINISTIC.
// Edges are directed (for cycle detection + chain direction) but lineage queries
// traverse the connected component in BOTH directions ("where did this come from"
// AND "what resulted from it").
// =============================================================================

import type { LineageEdge, LineageNode } from './types';

export const nodeKey = (n: LineageNode): string => `${n.kind}:${n.id}`;

export interface LineageGraph {
  nodes: Map<string, LineageNode>;
  /** forward adjacency: key → outgoing neighbour keys */
  forward: Map<string, Set<string>>;
  /** reverse adjacency: key → incoming neighbour keys */
  reverse: Map<string, Set<string>>;
  edges: LineageEdge[];
}

function add(map: Map<string, Set<string>>, a: string, b: string): void {
  let s = map.get(a);
  if (!s) { s = new Set(); map.set(a, s); }
  s.add(b);
}

/** Build a lineage graph from edges. PURE. */
export function buildGraph(edges: LineageEdge[]): LineageGraph {
  const nodes = new Map<string, LineageNode>();
  const forward = new Map<string, Set<string>>();
  const reverse = new Map<string, Set<string>>();
  for (const e of edges) {
    const fk = nodeKey(e.from); const tk = nodeKey(e.to);
    if (!nodes.has(fk)) nodes.set(fk, e.from);
    if (!nodes.has(tk)) nodes.set(tk, e.to);
    add(forward, fk, tk);
    add(reverse, tk, fk);
  }
  return { nodes, forward, reverse, edges };
}

/** Undirected neighbours of a node key (forward ∪ reverse). */
export function neighbours(g: LineageGraph, key: string): string[] {
  return [...(g.forward.get(key) ?? []), ...(g.reverse.get(key) ?? [])];
}

/**
 * The connected component containing `startKey`, as node keys, with the BFS depth
 * of each from the start. Undirected traversal. Deterministic (sorted frontier).
 */
export function componentFrom(g: LineageGraph, startKey: string): Map<string, number> {
  const depth = new Map<string, number>();
  if (!g.nodes.has(startKey)) return depth;
  depth.set(startKey, 0);
  let frontier = [startKey];
  while (frontier.length) {
    const next: string[] = [];
    for (const k of frontier) {
      const d = depth.get(k)!;
      for (const nb of neighbours(g, k)) {
        if (!depth.has(nb)) { depth.set(nb, d + 1); next.push(nb); }
      }
    }
    frontier = next.sort();
  }
  return depth;
}
