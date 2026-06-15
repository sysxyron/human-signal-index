// =============================================================================
// Attribution edges + ANTI-GAMING (Deliverable 23). PURE.
//
// Trust/impact can be gamed by fabricating attribution. This module enforces:
//   * no self-loops          (origin === destination)
//   * no duplicate edges     (same origin→destination+relationship)
//   * no circular attribution (A→B→A cycles dropped, processing in order)
//   * no self-attribution    (same owner on both ends of a CREDIT edge)
// `cleanAttribution()` returns the safe edge set + a breakdown of what was dropped
// (for transparency / the admin audit). Idempotent: re-cleaning is a no-op.
// =============================================================================

import type { AttributionEdge, EntityRef } from './types';

const refKey = (r: EntityRef): string => `${r.type}:${r.id}`;
export function attributionKey(e: AttributionEdge): string {
  return `${refKey(e.origin)}->${refKey(e.destination)}:${e.relationship}`;
}

/** Credit relationships where same-owner-both-ends is self-attribution. */
const CREDIT_RELATIONSHIPS = new Set(['contributor_to_outcome', 'team_to_outcome']);

/** A self-loop edge (origin === destination) is always invalid. */
export function isSelfLoop(e: AttributionEdge): boolean {
  return refKey(e.origin) === refKey(e.destination);
}

/** Self-attribution: the same contributor owns both ends of a credit edge. */
export function isSelfAttribution(e: AttributionEdge): boolean {
  if (!CREDIT_RELATIONSHIPS.has(e.relationship)) return false;
  return Boolean(e.originOwner && e.destinationOwner && e.originOwner === e.destinationOwner);
}

/** Remove exact-duplicate edges (first occurrence wins). PURE. */
export function dedupeEdges(edges: AttributionEdge[]): AttributionEdge[] {
  const seen = new Set<string>();
  const out: AttributionEdge[] = [];
  for (const e of edges) {
    const k = attributionKey(e);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

/** Would adding `edge` to the graph close a cycle? (DFS over existing edges.) */
function reaches(adj: Map<string, string[]>, from: string, target: string): boolean {
  const stack = [from];
  const seen = new Set<string>();
  while (stack.length) {
    const n = stack.pop()!;
    if (n === target) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    for (const nxt of adj.get(n) ?? []) stack.push(nxt);
  }
  return false;
}

/**
 * Drop edges that would create a cycle, processing in order (an edge is kept only
 * if its destination cannot already reach its origin). Deterministic.
 */
export function removeCycles(edges: AttributionEdge[]): { kept: AttributionEdge[]; dropped: AttributionEdge[] } {
  const adj = new Map<string, string[]>();
  const kept: AttributionEdge[] = [];
  const dropped: AttributionEdge[] = [];
  for (const e of edges) {
    const o = refKey(e.origin);
    const d = refKey(e.destination);
    if (reaches(adj, d, o)) { dropped.push(e); continue; } // d already reaches o → adding o→d closes a cycle
    kept.push(e);
    let list = adj.get(o);
    if (!list) { list = []; adj.set(o, list); }
    list.push(d);
  }
  return { kept, dropped };
}

export interface CleanResult {
  clean: AttributionEdge[];
  dropped: { selfLoops: number; duplicates: number; cycles: number; selfAttributions: number };
}

/**
 * Full anti-gaming pass: drop self-loops, dedupe, drop self-attribution credit
 * edges, then break cycles. Returns the safe set + counts of what was removed.
 */
export function cleanAttribution(edges: AttributionEdge[]): CleanResult {
  let selfLoops = 0; let selfAttributions = 0;
  const noLoops = edges.filter((e) => { if (isSelfLoop(e)) { selfLoops++; return false; } return true; });
  const beforeDup = noLoops.length;
  const deduped = dedupeEdges(noLoops);
  const duplicates = beforeDup - deduped.length;
  const noSelf = deduped.filter((e) => { if (isSelfAttribution(e)) { selfAttributions++; return false; } return true; });
  const { kept, dropped } = removeCycles(noSelf);
  return { clean: kept, dropped: { selfLoops, duplicates, cycles: dropped.length, selfAttributions } };
}

/** Total attribution weight credited to a contributor (after anti-gaming). */
export function contributorAttributedWeight(edges: AttributionEdge[], contributorId: string): number {
  return cleanAttribution(edges).clean
    .filter((e) => e.relationship === 'contributor_to_outcome' && e.origin.id === contributorId)
    .reduce((sum, e) => sum + (Number.isFinite(e.weight) ? e.weight : 0), 0);
}
