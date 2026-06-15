// =============================================================================
// Outcome chain model (Deliverable 2). PURE.
//
//   Signal → Investigation → Review → Governance → Publication → Outcome
//
// Supports single chains AND many-to-many (a publication may originate from many
// investigations; an outcome may have many origins). buildChains() resolves, for
// each OUTCOME, the upstream subgraph: its links, distinct origins, and a strength
// (the strongest path's weight product). Cycles are pre-removed by cleanAttribution.
// =============================================================================

import type { AttributionEdge, ChainLink, EntityRef, OutcomeChain } from './types';
import { cleanAttribution } from './attribution';

const refKey = (r: EntityRef): string => `${r.type}:${r.id}`;

/** Build outcome chains from a (cleaned) edge set. PURE + DETERMINISTIC. */
export function buildChains(rawEdges: AttributionEdge[]): OutcomeChain[] {
  const edges = cleanAttribution(rawEdges).clean;

  // Reverse adjacency: destinationKey → incoming edges.
  const incoming = new Map<string, AttributionEdge[]>();
  const nodes = new Map<string, EntityRef>();
  const hasOutgoing = new Set<string>();
  for (const e of edges) {
    nodes.set(refKey(e.origin), e.origin);
    nodes.set(refKey(e.destination), e.destination);
    const dk = refKey(e.destination);
    const list = incoming.get(dk) ?? [];
    list.push(e);
    incoming.set(dk, list);
    hasOutgoing.add(refKey(e.origin));
  }

  const outcomes = [...nodes.values()].filter((n) => n.type === 'outcome');
  const chains: OutcomeChain[] = [];

  for (const outcome of outcomes) {
    const links: ChainLink[] = [];
    const origins: EntityRef[] = [];
    const seenLink = new Set<string>();
    let bestStrength = 0;

    // DFS upstream, accumulating the strongest path weight product.
    const walk = (nodeKey: string, pathWeight: number, visited: Set<string>): void => {
      const ins = incoming.get(nodeKey) ?? [];
      if (ins.length === 0) {
        // a true origin (no incoming) — record it + the path strength.
        const ref = nodes.get(nodeKey);
        if (ref && ref.type !== 'outcome') origins.push(ref);
        bestStrength = Math.max(bestStrength, pathWeight);
        return;
      }
      for (const e of ins) {
        const lk = `${refKey(e.origin)}->${refKey(e.destination)}`;
        if (!seenLink.has(lk)) {
          seenLink.add(lk);
          links.push({ from: e.origin, to: e.destination, relationship: e.relationship, weight: e.weight });
        }
        const ok = refKey(e.origin);
        if (visited.has(ok)) continue; // cycle guard (defensive; cleanAttribution already removed cycles)
        walk(ok, pathWeight * clamp01(e.weight), new Set(visited).add(ok));
      }
    };
    walk(refKey(outcome), 1, new Set([refKey(outcome)]));

    // Dedupe origins.
    const uniqOrigins = [...new Map(origins.map((o) => [refKey(o), o])).values()];
    chains.push({ outcome, links, origins: uniqOrigins, strength: Math.round(bestStrength * 100) / 100 });
  }
  return chains;
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/** Distinct origins of a given type feeding an outcome chain (e.g. signals, investigations). */
export function originsOfType(chain: OutcomeChain, type: EntityRef['type']): EntityRef[] {
  return chain.origins.filter((o) => o.type === type);
}
