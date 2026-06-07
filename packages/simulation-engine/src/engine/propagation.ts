// =============================================================================
// @hsi/simulation-engine — propagation engine
// propagate(graph, changedNodeIds) recomputes ONLY the affected downstream nodes
// in topological order and returns an ImpactChain describing every value change.
// This is the "dynamic recalculation" step: change one knob, watch the cascade.
// =============================================================================

import { indexGraph, type GraphIndex, type GraphNode, type SimulationGraph } from '../graph/types';
import { getDownstream, topologicalSort } from '../graph/resolver';
import { sigFigs } from '@hsi/world-models';

/** A single recomputed step in a cascade. */
export interface ImpactStep {
  nodeId: string;
  label: string;
  before: number;
  after: number;
  /** after - before. */
  delta: number;
  /** WHY it changed (incoming relation labels of the node). */
  reason: string;
}

export interface ImpactChain {
  steps: ImpactStep[];
  /** Number of downstream nodes that actually changed value. */
  affectedCount: number;
}

/** Gather inputs (parent id -> value) for a node from the current index. */
function gatherInputs(g: GraphIndex, nodeId: string): Record<string, number> {
  const inputs: Record<string, number> = {};
  for (const pid of g.parents.get(nodeId) ?? []) {
    const pn = g.nodeById.get(pid);
    inputs[pid] = pn ? pn.value : 0;
  }
  return inputs;
}

/** Build the "reason" string for a node from its incoming edges' relations. */
function reasonFor(graph: SimulationGraph, nodeId: string): string {
  const rels = graph.edges
    .filter((e) => e.target === nodeId)
    .map((e) => e.relation);
  return rels.length ? rels.join('; ') : 'recomputed from updated inputs';
}

/**
 * Recompute affected nodes after the given roots changed. The caller is expected
 * to have ALREADY mutated the changed root node values (e.g. set gravity). This
 * recomputes everything downstream of those roots in topo order, mutating node
 * values in place, and returns the cascade.
 *
 * Performance: only touches the downstream closure of the changed set, processed
 * in a single topo pass. O(V + E) over that closure.
 */
export function propagate(
  graph: SimulationGraph,
  changedNodeIds: string[],
  index?: GraphIndex,
): ImpactChain {
  const g = index ?? indexGraph(graph);

  // 1. Compute the downstream closure of all changed roots (the dirty set).
  const dirty = new Set<string>();
  for (const id of changedNodeIds) {
    for (const d of getDownstream(graph, id, g)) dirty.add(d);
  }

  // 2. Process the dirty set in global topo order so parents are done first.
  const order = topologicalSort(graph, g);
  const steps: ImpactStep[] = [];

  // Capture "before" for changed roots too (so the cascade shows the trigger).
  for (const id of changedNodeIds) {
    const node = g.nodeById.get(id);
    if (!node) continue;
    // Roots have no compute fn; their value was set by the caller. Record as a step.
    steps.push({
      nodeId: id,
      label: node.label,
      before: node.value, // already-updated value; delta 0 marks it as the trigger
      after: node.value,
      delta: 0,
      reason: 'trigger (input changed by caller)',
    });
  }

  for (const id of order) {
    if (!dirty.has(id)) continue;
    const node = g.nodeById.get(id);
    if (!node || !node.compute) continue;
    const before = node.value;
    const after = node.compute(gatherInputs(g, id));
    node.value = after;
    if (after !== before) {
      steps.push({
        nodeId: id,
        label: node.label,
        before: sigFigs(before, 5),
        after: sigFigs(after, 5),
        delta: sigFigs(after - before, 5),
        reason: reasonFor(graph, id),
      });
    }
  }

  const affectedCount = steps.filter((s) => s.delta !== 0).length;
  return { steps, affectedCount };
}

/**
 * Full (re)resolve of EVERY derived node in topo order from current root values.
 * Used after building a graph or applying many changes at once.
 */
export function resolveAll(graph: SimulationGraph, index?: GraphIndex): SimulationGraph {
  const g = index ?? indexGraph(graph);
  for (const id of topologicalSort(graph, g)) {
    const node = g.nodeById.get(id);
    if (node?.compute) node.value = node.compute(gatherInputs(g, id));
  }
  return graph;
}

/** Read a node's resolved value by id (helper for evaluators). */
export function nodeValue(graph: SimulationGraph, nodeId: string): number {
  const found = graph.nodes.find((n) => n.id === nodeId);
  return found ? found.value : 0;
}

/** Map of node id -> value (handy for evaluators / reports). O(V). */
export function valueMap(graph: SimulationGraph): Map<string, GraphNode> {
  const m = new Map<string, GraphNode>();
  for (const n of graph.nodes) m.set(n.id, n);
  return m;
}
