// =============================================================================
// Graph health metrics (Deliverable 23). PURE + DETERMINISTIC.
//   chainCompleteness  — share of investigations with BOTH a source + a downstream.
//   orphanCount        — isolated nodes.
//   brokenChains       — from validation.
//   averageTraceDepth  — mean component depth across investigations.
//   coverage           — share of nodes that sit in a multi-node component.
//   healthScore        — headline blend (higher = healthier).
// =============================================================================

import { buildGraph, componentFrom, neighbours, nodeKey } from './graph';
import { detectBrokenChains, detectCircularReferences, detectOrphans } from './validation';
import type { GraphHealth, LineageEdge } from './types';

const clamp = (n: number): number => (n < 0 ? 0 : n > 100 ? 100 : Math.round(n));

export function computeGraphHealth(edges: LineageEdge[]): GraphHealth {
  const g = buildGraph(edges);
  const nodeCount = g.nodes.size;
  const edgeCount = edges.length;
  const orphans = detectOrphans(g);
  const broken = detectBrokenChains(g);
  const cycles = detectCircularReferences(g);

  const investigationKeys = [...g.nodes.values()].filter((n) => n.kind === 'investigation').map((n) => nodeKey(n));
  let complete = 0;
  let depthSum = 0;
  for (const key of investigationKeys) {
    const nb = neighbours(g, key).map((k) => g.nodes.get(k));
    const hasSource = nb.some((n) => n && (n.kind === 'signal' || n.kind === 'evidence'));
    const hasDownstream = nb.some((n) => n && (n.kind === 'publication' || n.kind === 'outcome'));
    if (hasSource && hasDownstream) complete++;
    const comp = componentFrom(g, key);
    depthSum += Math.max(...[0, ...comp.values()]);
  }
  const chainCompleteness = investigationKeys.length > 0 ? clamp((complete / investigationKeys.length) * 100) : 100;
  const averageTraceDepth = investigationKeys.length > 0 ? Math.round((depthSum / investigationKeys.length) * 10) / 10 : 0;
  const connected = nodeCount > 0 ? clamp(((nodeCount - orphans.length) / nodeCount) * 100) : 100;

  // Health: reward completeness + connectivity, penalise broken chains + cycles.
  const penalty = clamp((broken.length * 5 + cycles.length * 10));
  const healthScore = clamp(0.5 * chainCompleteness + 0.5 * connected - penalty);

  return {
    nodeCount, edgeCount, orphanCount: orphans.length, brokenChainCount: broken.length, cycleCount: cycles.length,
    chainCompleteness, averageTraceDepth, coverage: connected, healthScore,
  };
}
