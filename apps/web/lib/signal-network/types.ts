// =============================================================================
// HSI Phase 70.4 — Signal Network Intelligence: shared types (PURE).
//
// A relationship + influence layer OVER existing intelligence. It READS the
// Phase 64 evidence graph (graph_nodes/graph_edges), Phase 65 narratives
// (narrative_members), and Phase 67 forecasts — it never creates edges, never
// infers relationships, never fabricates a metric. Insufficient data → UNKNOWN.
// PURE: no I/O, no @/ value imports.
// =============================================================================

export const SIGNAL_HEALTHS = ['ACTIVE', 'DORMANT', 'ESCALATING', 'RESOLVED', 'CONTRADICTED', 'ARCHIVED', 'UNKNOWN'] as const;
export type SignalHealth = (typeof SIGNAL_HEALTHS)[number];

/** The five signal-relationship types this layer surfaces (a subset of the Phase
 *  64 catalog). Edges are only ever READ, never created here. */
export const SIGNAL_RELATIONSHIPS = ['SUPPORTS', 'CONTRADICTS', 'REFERENCES', 'DERIVED_FROM', 'RELATED_TO'] as const;
export type SignalRelationship = (typeof SIGNAL_RELATIONSHIPS)[number];

/** All inputs are REAL counts/timestamps computed by the DAL from existing
 *  records. Absence means "unknown", never a fabricated value. */
export interface SignalHealthInput {
  hasNode: boolean;            // signal is present in the evidence graph
  signalStatus: string | null; // hsin_signals.status
  incomingContradicts: number; // CONTRADICTS edges targeting the signal node
  publishedAsCount: number;    // PUBLISHED_AS edges (resolved into a report)
  correctedByCount: number;    // CORRECTED_BY edges (retracted/corrected)
  totalEdges: number;          // all edges touching the node (either direction)
  narrativeCount: number;      // narrative memberships
  recentActivity: number;      // edges+members created in the recent window
  priorActivity: number;       // edges+members in the prior window
  lastActivityAt: string | null;
  nowIso: string;
}

export interface InfluenceCounts {
  evidenceCount: number;       // connected EVIDENCE/CLAIM nodes
  reportCount: number;         // connected REPORT nodes
  narrativeCount: number;      // narrative memberships
  forecastCount: number;       // forecasts attributed via those narratives / node
  relationshipCount: number;   // total edges touching the node
  supportsCount: number;
  contradictsCount: number;
  referencesCount: number;
  derivedFromCount: number;
  relatedToCount: number;
  distinctConnectedNodes: number;
  recentActivity: number;
}

export interface InfluenceSummary extends InfluenceCounts {
  reach: number;               // distinct connected nodes (how far it spreads)
  activity: number;            // recent edge/membership activity
  supportingEvidence: number;  // SUPPORTS count
  downstreamUsage: number;     // reports + forecasts + narratives (real sum)
  observed: boolean;           // false → "not yet observed"
}

/** Per-signal attribution completeness — the Phase 71 readiness inputs. */
export interface AttributionFlags {
  hasSourceLineage: boolean;
  hasNarrative: boolean;
  hasForecast: boolean;
  hasRelationship: boolean;
  hasEvidence: boolean;
  hasGeo: boolean;
}

export interface ClassifiedResult<T> { value: T; reason: string }
