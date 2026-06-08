// =============================================================================
// @hsi/temporal-intelligence — public type surface (Phase 10).
//
// "Git history for ideas." Every type here describes a deterministic, explainable
// view of how PUBLIC narratives evolve over time. Forecasts are PROBABILISTIC —
// distributions over states, never certainties. No truth is asserted; these are
// triage/decision aids for HUMAN review.
// =============================================================================

/** Point-in-time, derived statistics for a single narrative. */
export interface NarrativeStats {
  narrativeId: string;
  /** Count of signals attached to the narrative at capture. */
  signalCount: number;
  /** Count of distinct sources carrying the narrative. */
  sourceCount: number;
  /** Count of communities the narrative spans. */
  communityCount: number;
  /** Amplification composite 0..100 (how strongly it is being amplified). */
  amplificationScore: number;
  /** Reliability composite 0..100 (source/evidence quality). */
  reliabilityScore: number;
  /** Fraction of evidence that supports the narrative, 0..1. */
  supportRatio: number;
  /** Fraction of evidence that contradicts the narrative, 0..1. */
  contradictionRatio: number;
}

/** An immutable snapshot of a narrative's stats at a moment (a "commit"). */
export interface NarrativeSnapshot extends NarrativeStats {
  /** Stable snapshot id (deterministic when derived from narrativeId + time). */
  id: string;
  /** ISO time the snapshot was captured. */
  capturedAt: string;
  /** Free-form, deterministic metadata (e.g. category, composition tokens). */
  metadata?: Record<string, unknown>;
}

/** Cadence at which snapshots are taken. */
export type SnapshotCadence = 'daily' | 'weekly' | 'monthly';

/** The kind of change observed between two consecutive snapshots. */
export type EvolutionChangeType =
  | 'growth'
  | 'decline'
  | 'mutation'
  | 'split'
  | 'merge';

/** A diff between two snapshots (an "evolution commit message"). */
export interface EvolutionRecord {
  id?: string;
  narrativeId: string;
  parentSnapshotId: string;
  childSnapshotId: string;
  changeType: EvolutionChangeType;
  /** Percent change in signal count, (curr-prev)/max(1,prev)*100. */
  growthPct: number;
  amplificationDelta: number;
  communityDelta: number;
  sourceDelta: number;
  reliabilityDelta: number;
  contradictionDelta: number;
  /** 0..1 confidence in the classification (magnitude + consistency). */
  confidence: number;
  /** Human-readable explanations for the classification. */
  reasoning: string[];
  createdAt: string;
}

/** Relationship between two narratives in the genealogy graph. */
export type GenealogyRelationship =
  | 'derived_from'
  | 'split_from'
  | 'merged_from'
  | 'contradicts'
  | 'amplifies';

/** A directed genealogy edge: child ⟵ relationship ⟶ parent. */
export interface GenealogyEdge {
  id?: string;
  parentNarrativeId: string;
  childNarrativeId: string;
  relationship: GenealogyRelationship;
  /** 0..1 confidence in the relationship. */
  confidence: number;
  sharedEntities: number;
  sharedSources: number;
  /** Semantic similarity 0..1 of the two narratives' text. */
  similarity: number;
  rationale: string;
  createdAt: string;
}

/** A directed influence edge: source narrative → target narrative. */
export interface InfluenceEdge {
  id?: string;
  sourceNarrativeId: string;
  targetNarrativeId: string;
  /** 0..100 influence strength. */
  influenceScore: number;
  sharedEntities: number;
  sharedSources: number;
  sharedCommunities: number;
  rationale: string;
  createdAt: string;
}

/** A forecasted trajectory state for a narrative. */
export type ForecastState =
  | 'emerging'
  | 'rising'
  | 'stable'
  | 'declining'
  | 'dead';

/** A probabilistic, explainable forecast over the 5 trajectory states. */
export interface NarrativeForecast {
  id?: string;
  narrativeId: string;
  /** The argmax state of {@link distribution}. */
  forecastType: ForecastState;
  /** Probability of {@link forecastType}, 0..1 (always < 1 — never certainty). */
  probability: number;
  /** Explainable reasoning, including any uncertainty caveats. */
  reasoning: string[];
  /** Full probability distribution over all states (sums to ~1). */
  distribution?: Record<ForecastState, number>;
  generatedAt: string;
}

// ---- Input shapes -----------------------------------------------------------

/** A narrative as supplied to the temporal engine. */
export interface NarrativeInput {
  id: string;
  name: string;
  signalIds: string[];
  category?: string;
  entityIds?: string[];
  sourceIds?: string[];
  communityIds?: string[];
  firstSeenAt?: string;
  lastSeenAt?: string;
}

/** A signal as supplied to the temporal engine. */
export interface SignalInput {
  id: string;
  narrativeId?: string;
  sourceId?: string;
  capturedAt?: string;
  title?: string;
  bodyText?: string;
  entityIds?: string[];
}

/** Injected dependencies for deterministic, offline operation. */
export interface TemporalDeps {
  /** Injected "now" — the engine NEVER calls Date.now(). */
  now: string;
  /** Optional embedder; falls back to localLexicalEmbed when absent. */
  embed?: (texts: string[]) => Promise<number[][]>;
  /** Optional seed for any tie-breaking (kept deterministic regardless). */
  seed?: number;
}
