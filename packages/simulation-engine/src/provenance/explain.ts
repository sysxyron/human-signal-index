// =============================================================================
// @hsi/simulation-engine — explanation walker
// explainNode(graph, nodeId) walks the upstream chain and produces a human-
// readable "WHY" for a node's value, e.g.:
//   "Atmosphere Density is 0.4 atm because Atmospheric Retention declined
//    (← Escape Velocity decreased ← Gravity decreased)."
// =============================================================================

import { indexGraph, type GraphIndex, type SimulationGraph } from '../graph/types';
import { getAncestryChain } from '../graph/resolver';
import { sigFigs } from '@hsi/world-models';

/** Structured explanation for a node. */
export interface NodeExplanation {
  nodeId: string;
  label: string;
  value: number;
  unit?: string;
  /** One-line summary. */
  summary: string;
  /** Ordered upstream causes (root cause first). */
  chain: { id: string; label: string; value: number; relation: string }[];
  scientificTier: string;
  confidence: number;
}

/** Relation label for the edge source -> target, or a default. */
function relationBetween(graph: SimulationGraph, source: string, target: string): string {
  const e = graph.edges.find((x) => x.source === source && x.target === target);
  return e?.relation ?? 'feeds into';
}

/**
 * Explain WHY a node has its value by walking its ancestry chain (topo order,
 * root cause first). Reads provenance for the scientific tag.
 */
export function explainNode(
  graph: SimulationGraph,
  nodeId: string,
  index?: GraphIndex,
): NodeExplanation {
  const g = index ?? indexGraph(graph);
  const node = g.nodeById.get(nodeId);
  if (!node) {
    return {
      nodeId,
      label: nodeId,
      value: 0,
      summary: `No node "${nodeId}" exists in this graph.`,
      chain: [],
      scientificTier: 'speculative',
      confidence: 0,
    };
  }

  const ancestry = getAncestryChain(graph, nodeId, g);
  // Build a readable chain: for each ancestor, find the relation toward the next
  // node on the path (or toward the target node for direct parents).
  const directParents = new Set(g.parents.get(nodeId) ?? []);
  const chain = ancestry.map((id) => {
    const a = g.nodeById.get(id);
    const relation = directParents.has(id)
      ? relationBetween(graph, id, nodeId)
      : node.provenance.reason; // upstream contributes indirectly
    return {
      id,
      label: a?.label ?? id,
      value: a ? sigFigs(a.value, 5) : 0,
      relation,
    };
  });

  const causeText =
    chain.length > 0
      ? ` because ${chain
          .slice(-3)
          .map((c) => `${c.label} = ${c.value} (${c.relation})`)
          .join(' ← ')}`
      : ' (this is a root input — taken directly from the world state)';

  return {
    nodeId,
    label: node.label,
    value: sigFigs(node.value, 5),
    unit: node.unit,
    summary: `${node.label} is ${sigFigs(node.value, 5)}${node.unit ? ' ' + node.unit : ''}${causeText}.`,
    chain,
    scientificTier: node.provenance.scientificConfidence.tier,
    confidence: node.provenance.confidence,
  };
}
