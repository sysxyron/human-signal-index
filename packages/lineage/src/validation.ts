// =============================================================================
// Lineage integrity validation (Deliverable 10). PURE.
//   detectOrphans          — nodes with no edges at all.
//   detectBrokenChains     — investigations/publications missing a required link.
//   detectCircularReferences — directed cycles (lineage must be acyclic).
// =============================================================================

import { buildGraph, neighbours, nodeKey, type LineageGraph } from './graph';
import type { BrokenChain, LineageEdge, LineageNode, ValidationResult } from './types';

/** Nodes that participate in no edge (isolated artifacts). */
export function detectOrphans(g: LineageGraph): LineageNode[] {
  const out: LineageNode[] = [];
  for (const [key, node] of g.nodes) {
    if (neighbours(g, key).length === 0) out.push(node);
  }
  return out.sort((a, b) => nodeKey(a).localeCompare(nodeKey(b)));
}

/**
 * Broken chains: a publication with no upstream investigation/signal, or an
 * investigation that produced an outcome/publication but has no source signal or
 * evidence (an unsupported conclusion).
 */
export function detectBrokenChains(g: LineageGraph): BrokenChain[] {
  const broken: BrokenChain[] = [];
  for (const [key, node] of g.nodes) {
    if (node.kind === 'publication') {
      const incoming = [...(g.reverse.get(key) ?? [])].map((k) => g.nodes.get(k));
      const hasOrigin = incoming.some((n) => n && (n.kind === 'investigation' || n.kind === 'signal' || n.kind === 'evidence'));
      if (!hasOrigin) broken.push({ node, reason: 'Publication has no source investigation/signal/evidence.' });
    }
    if (node.kind === 'investigation') {
      const nb = neighbours(g, key).map((k) => g.nodes.get(k));
      const hasDownstream = nb.some((n) => n && (n.kind === 'publication' || n.kind === 'outcome'));
      const hasSource = nb.some((n) => n && (n.kind === 'signal' || n.kind === 'evidence'));
      if (hasDownstream && !hasSource) broken.push({ node, reason: 'Investigation produced output with no source signal/evidence.' });
    }
  }
  return broken;
}

/** Directed cycles in the lineage (it should be a DAG). Returns one representative path per cycle. */
export function detectCircularReferences(g: LineageGraph): LineageNode[][] {
  const cycles: LineageNode[][] = [];
  const WHITE = 0; const GRAY = 1; const BLACK = 2;
  const color = new Map<string, number>();
  for (const k of g.nodes.keys()) color.set(k, WHITE);
  const stack: string[] = [];

  const dfs = (k: string): void => {
    color.set(k, GRAY);
    stack.push(k);
    for (const nb of g.forward.get(k) ?? []) {
      if (color.get(nb) === GRAY) {
        const idx = stack.indexOf(nb);
        cycles.push(stack.slice(idx).map((x) => g.nodes.get(x)!).filter(Boolean));
      } else if (color.get(nb) === WHITE) {
        dfs(nb);
      }
    }
    stack.pop();
    color.set(k, BLACK);
  };
  for (const k of [...g.nodes.keys()].sort()) if (color.get(k) === WHITE) dfs(k);
  return cycles;
}

/** Run all three validations. PURE. */
export function validateLineage(edges: LineageEdge[]): ValidationResult {
  const g = buildGraph(edges);
  return {
    orphans: detectOrphans(g),
    brokenChains: detectBrokenChains(g),
    cycles: detectCircularReferences(g),
  };
}
