// =============================================================================
// @hsi/simulation-engine — dependency resolver
// Iterative graph algorithms (no deep recursion) so 1000+ node graphs are safe:
//   - topologicalSort: Kahn's algorithm, O(V+E)
//   - detectCycles: report nodes left after Kahn's (cycle members)
//   - getDownstream / getUpstream: iterative BFS over child / parent edges
//   - getAncestryChain: ordered path of upstream dependencies (deepest first)
// =============================================================================

import { indexGraph, type GraphIndex, type SimulationGraph } from './types';

/** Resolve an index (accepts a prebuilt one to avoid re-indexing in hot loops). */
function idx(graph: SimulationGraph, index?: GraphIndex): GraphIndex {
  return index ?? indexGraph(graph);
}

/**
 * Topological order (parents before children) via Kahn's algorithm.
 * If the graph has a cycle, the returned array omits the cycle members.
 */
export function topologicalSort(graph: SimulationGraph, index?: GraphIndex): string[] {
  const g = idx(graph, index);
  const indegree = new Map<string, number>();
  for (const [id, parents] of g.parents) indegree.set(id, parents.length);

  // Seed the queue with all zero-indegree nodes.
  const queue: string[] = [];
  for (const [id, deg] of indegree) if (deg === 0) queue.push(id);

  const order: string[] = [];
  let head = 0;
  while (head < queue.length) {
    const id = queue[head++];
    order.push(id);
    for (const child of g.children.get(id) ?? []) {
      const d = (indegree.get(child) ?? 0) - 1;
      indegree.set(child, d);
      if (d === 0) queue.push(child);
    }
  }
  return order;
}

/** Returns the set of node ids participating in a cycle (empty if acyclic). */
export function detectCycles(graph: SimulationGraph, index?: GraphIndex): string[] {
  const g = idx(graph, index);
  const order = topologicalSort(graph, g);
  if (order.length === g.nodeById.size) return [];
  const sorted = new Set(order);
  const cyclic: string[] = [];
  for (const id of g.nodeById.keys()) if (!sorted.has(id)) cyclic.push(id);
  return cyclic;
}

/** All nodes reachable downstream of `nodeId` (excludes the node itself). */
export function getDownstream(
  graph: SimulationGraph,
  nodeId: string,
  index?: GraphIndex,
): string[] {
  return bfs(idx(graph, index).children, nodeId);
}

/** All nodes reachable upstream of `nodeId` (excludes the node itself). */
export function getUpstream(
  graph: SimulationGraph,
  nodeId: string,
  index?: GraphIndex,
): string[] {
  return bfs(idx(graph, index).parents, nodeId);
}

function bfs(adj: Map<string, string[]>, start: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const queue: string[] = [...(adj.get(start) ?? [])];
  let head = 0;
  while (head < queue.length) {
    const id = queue[head++];
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    for (const nxt of adj.get(id) ?? []) if (!seen.has(nxt)) queue.push(nxt);
  }
  return out;
}

/**
 * Ordered ancestry chain for a node: the upstream dependencies arranged in
 * topological order (root causes first, the node's direct parents last). Useful
 * for explanations ("A -> B -> C -> this").
 */
export function getAncestryChain(
  graph: SimulationGraph,
  nodeId: string,
  index?: GraphIndex,
): string[] {
  const g = idx(graph, index);
  const upstream = new Set(getUpstream(graph, nodeId, g));
  if (upstream.size === 0) return [];
  const topo = topologicalSort(graph, g);
  return topo.filter((id) => upstream.has(id));
}
