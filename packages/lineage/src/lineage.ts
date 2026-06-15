// =============================================================================
// Lineage queries (Deliverables 6–9). PURE. Each resolves an artifact's full
// connected component and buckets the reachable nodes by kind, so a user can see
// where something came from AND what resulted from it.
// =============================================================================

import { buildGraph, componentFrom, nodeKey, type LineageGraph } from './graph';
import type { Lineage, LineageEdge, LineageKind, LineageNode } from './types';

function bucket(g: LineageGraph, depthByKey: Map<string, number>, root: LineageNode): Lineage {
  const byKind: Record<LineageKind, LineageNode[]> = {
    signal: [], evidence: [], investigation: [], review: [], governance: [], publication: [], outcome: [], contributor: [],
  };
  let maxDepth = 0;
  for (const [key, depth] of depthByKey) {
    const n = g.nodes.get(key);
    if (!n) continue;
    if (key !== nodeKey(root)) byKind[n.kind].push(n);
    if (depth > maxDepth) maxDepth = depth;
  }
  for (const k of Object.keys(byKind) as LineageKind[]) byKind[k].sort((a, b) => a.id.localeCompare(b.id));
  return {
    root,
    signals: byKind.signal, evidence: byKind.evidence, investigations: byKind.investigation,
    reviews: byKind.review, governance: byKind.governance, publications: byKind.publication,
    outcomes: byKind.outcome, contributors: byKind.contributor, depth: maxDepth,
  };
}

function lineageOf(edges: LineageEdge[], kind: LineageKind, id: string): Lineage {
  const g = buildGraph(edges);
  const root: LineageNode = g.nodes.get(`${kind}:${id}`) ?? { kind, id };
  const comp = componentFrom(g, `${kind}:${id}`);
  if (comp.size === 0) comp.set(`${kind}:${id}`, 0); // isolated root
  return bucket(g, comp, root);
}

/** Deliverable 6 — full lineage of a signal. */
export function getSignalLineage(edges: LineageEdge[], signalId: string): Lineage {
  return lineageOf(edges, 'signal', signalId);
}
/** Deliverable 7 — full lineage of an investigation. */
export function getInvestigationLineage(edges: LineageEdge[], investigationId: string): Lineage {
  return lineageOf(edges, 'investigation', investigationId);
}
/** Deliverable 8 — full lineage of a publication. */
export function getPublicationLineage(edges: LineageEdge[], publicationId: string): Lineage {
  return lineageOf(edges, 'publication', publicationId);
}
/** Deliverable 9 — all artifacts a contributor touched. */
export function getContributorLineage(edges: LineageEdge[], contributorId: string): Lineage {
  return lineageOf(edges, 'contributor', contributorId);
}
