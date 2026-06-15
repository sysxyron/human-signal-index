// =============================================================================
// @hsi/lineage — types. PURE (no DB, no UI, no Date.now()).
//
// The intelligence LINEAGE graph makes every artifact traceable:
//   Signal → Evidence → Investigation → Review → Governance → Publication → Outcome
// plus the contributors who touched each. The engine is generic over nodes/edges
// so the worker can feed it materialized links (the new link tables) AND the real
// research-runs pipeline. GOVERNANCE: lineage is traceability only — it never
// changes RBAC.
// =============================================================================

export type LineageKind =
  | 'signal'
  | 'evidence'
  | 'investigation'
  | 'review'
  | 'governance'
  | 'publication'
  | 'outcome'
  | 'contributor';

export interface LineageNode {
  kind: LineageKind;
  id: string;
  label?: string;
}

export type LineageRelation =
  | 'signal_to_investigation'
  | 'investigation_to_evidence'
  | 'investigation_to_publication'
  | 'publication_to_evidence'
  | 'signal_to_evidence'
  | 'investigation_to_review'
  | 'review_to_governance'
  | 'publication_to_outcome'
  | 'investigation_to_outcome'
  | 'contributor_touched';

export interface LineageEdge {
  from: LineageNode;
  to: LineageNode;
  relation: LineageRelation;
}

/** The full lineage of one artifact, bucketed by kind. */
export interface Lineage {
  root: LineageNode;
  signals: LineageNode[];
  evidence: LineageNode[];
  investigations: LineageNode[];
  reviews: LineageNode[];
  governance: LineageNode[];
  publications: LineageNode[];
  outcomes: LineageNode[];
  contributors: LineageNode[];
  /** Longest path depth from the root within the connected component. */
  depth: number;
}

// ---- validation (Deliverable 10) ------------------------------------------
export interface BrokenChain {
  node: LineageNode;
  reason: string;
}

export interface ValidationResult {
  orphans: LineageNode[];
  brokenChains: BrokenChain[];
  cycles: LineageNode[][];
}

// ---- health (Deliverable 23) ----------------------------------------------
export interface GraphHealth {
  nodeCount: number;
  edgeCount: number;
  orphanCount: number;
  brokenChainCount: number;
  cycleCount: number;
  chainCompleteness: number; // 0..100 — share of investigations with a full chain
  averageTraceDepth: number;
  coverage: number; // 0..100 — share of nodes reachable in a multi-node component
  healthScore: number; // 0..100 headline
}
