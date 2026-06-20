// =============================================================================
// HSI Phase 70.4 — Signal relationship tallies (PURE, deterministic). Reads
// real graph edges only. An edge is counted ONLY when both endpoints resolve to
// a real node — edges to a missing record are dropped, never fabricated. No I/O.
// =============================================================================

import { SIGNAL_RELATIONSHIPS, type SignalRelationship } from './types';

export interface EdgeRef {
  relationshipType: string;
  otherNodeId: string;        // the node at the other end
  direction: 'incoming' | 'outgoing';
}

export interface RelationshipTally {
  total: number;
  byType: Record<SignalRelationship, number>;
  dropped: number;            // edges referencing a missing node (excluded)
}

const ZERO = (): Record<SignalRelationship, number> => ({ SUPPORTS: 0, CONTRADICTS: 0, REFERENCES: 0, DERIVED_FROM: 0, RELATED_TO: 0 });

/** Count edges by relationship type, keeping ONLY edges whose other endpoint is
 *  a real node (present in `realNodeIds`). Unknown relationship types are ignored. */
export function tallyRelationships(edges: EdgeRef[], realNodeIds: ReadonlySet<string>): RelationshipTally {
  const byType = ZERO();
  let total = 0; let dropped = 0;
  for (const e of edges) {
    if (!realNodeIds.has(e.otherNodeId)) { dropped++; continue; } // edge to a missing record — never counted
    if ((SIGNAL_RELATIONSHIPS as readonly string[]).includes(e.relationshipType)) {
      byType[e.relationshipType as SignalRelationship]++;
      total++;
    }
  }
  return { total, byType, dropped };
}

const LABELS: Record<SignalRelationship, string> = {
  SUPPORTS: 'Supports', CONTRADICTS: 'Contradicts', REFERENCES: 'References', DERIVED_FROM: 'Derived from', RELATED_TO: 'Related to',
};
export function relationshipLabel(r: SignalRelationship): string { return LABELS[r]; }
