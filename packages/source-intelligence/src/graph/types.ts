// =============================================================================
// @hsi/source-intelligence — NARRATIVE / ENTITY GRAPH types (Phase 8).
//
// A narrative graph maps how PUBLIC narratives relate: nodes are candidate
// narratives (from clustering), edges are explainable relationships between
// them, and entities are extracted topics/movements/orgs/etc. mentioned across
// signals. This is RESEARCH tooling over PUBLIC signals — never a dossier on a
// private person. Every edge carries a `rationale` (explainability is binding).
//
// ETHICS: extracted entities describe PUBLIC narratives/ideologies/movements/
// publications/platforms — NOT private individuals' personal data. We surface
// proper-noun candidates for human review; an 'unknown' type preserves doubt.
// =============================================================================

/** An entity extracted from signal text (deterministic, heuristic). */
export interface ExtractedEntity {
  name: string;
  entityType:
    | 'person'
    | 'organization'
    | 'movement'
    | 'ideology'
    | 'topic'
    | 'place'
    | 'platform'
    | 'publication'
    | 'unknown';
  /** 0..1 confidence in BOTH the entity and its type (uncertainty preserved). */
  confidence: number;
  /** A short surrounding snippet evidencing the mention. */
  evidenceText?: string;
}

/** A narrative node: a candidate narrative aggregated from clustered signals. */
export interface NarrativeNode {
  id: string;
  name: string;
  description?: string;
  category?: string;
  /** 0..1 aggregated risk weighting (heuristic; for human triage, not a verdict). */
  riskLevel?: number;
  signalIds: string[];
}

/** A directed, weighted, EXPLAINABLE relationship between two narratives. */
export interface NarrativeEdge {
  sourceNarrativeId: string;
  targetNarrativeId: string;
  edgeType:
    | 'related_to'
    | 'contradicts'
    | 'amplifies'
    | 'evolves_into'
    | 'derived_from'
    | 'co_occurs_with';
  /** 0..1 strength of the relationship. */
  weight: number;
  /** WHY this edge exists — required (explainability is binding). */
  rationale: string;
}

/** The assembled narrative + entity graph. */
export interface NarrativeGraph {
  nodes: NarrativeNode[];
  edges: NarrativeEdge[];
  entities: ExtractedEntity[];
}

/** A link from a signal to the narrative node it belongs to. */
export interface SignalNarrativeLink {
  signalId: string;
  narrativeId: string;
  confidence: number;
  rationale: string;
}
