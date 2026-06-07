// =============================================================================
// @hsi/simulation-engine — dependency graph types
// A directed graph where each node computes its value from its parents' values.
// The graph is the "Simulation Graph" between World State and Report.
// =============================================================================

import type { Provenance } from '@hsi/world-models';

export type NodeCategory =
  | 'star'
  | 'planet'
  | 'chemistry'
  | 'biology'
  | 'intelligence'
  | 'civilization'
  | 'risk';

/** Inputs handed to a node's compute fn: parent node id -> resolved value. */
export type ComputeInputs = Record<string, number>;

/** A node's compute function: derive this node's numeric value from inputs. */
export type ComputeFn = (inputs: ComputeInputs) => number;

export interface GraphNode {
  id: string;
  label: string;
  category: NodeCategory;
  /** Current numeric value (resolved). */
  value: number;
  /** Optional unit string for display, e.g. 'K', 'km/s', 'g', 'AU'. */
  unit?: string;
  /**
   * Optional compute function. Root/input nodes (taken straight from state)
   * have no compute fn; derived nodes do.
   */
  compute?: ComputeFn;
  provenance: Provenance;
  /** Human-readable modelling assumptions baked into this node. */
  assumptions: string[];
}

export interface GraphEdge {
  id: string;
  /** Parent node id. */
  source: string;
  /** Child node id. */
  target: string;
  /** WHY the edge exists — the causal relation label. */
  relation: string;
}

export interface SimulationGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Indexed view of a graph for O(1) lookups and O(V+E) traversal. Built once and
 * reused by the resolver / propagation engine to avoid quadratic scans.
 */
export interface GraphIndex {
  nodeById: Map<string, GraphNode>;
  /** node id -> parent node ids (incoming edges). */
  parents: Map<string, string[]>;
  /** node id -> child node ids (outgoing edges). */
  children: Map<string, string[]>;
}

/** Build the index once. O(V + E). */
export function indexGraph(graph: SimulationGraph): GraphIndex {
  const nodeById = new Map<string, GraphNode>();
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  for (const n of graph.nodes) {
    nodeById.set(n.id, n);
    if (!parents.has(n.id)) parents.set(n.id, []);
    if (!children.has(n.id)) children.set(n.id, []);
  }
  for (const e of graph.edges) {
    // Guard against dangling edges referencing missing nodes.
    if (!nodeById.has(e.source) || !nodeById.has(e.target)) continue;
    (children.get(e.source) as string[]).push(e.target);
    (parents.get(e.target) as string[]).push(e.source);
  }
  return { nodeById, parents, children };
}
