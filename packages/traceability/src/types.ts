// =============================================================================
// @hsi/traceability — types
// Provenance-first traceability engine for the Human Signal Index.
//
// Core principle (HSI): every AI claim must be traceable to declared source
// material. This package scores how well each generated passage is supported by
// the source passages the operator declared as inputs, and BLOCKS publishing
// when overall support falls below a confidence threshold.
//
// All scoring is pure TypeScript (no runtime dependencies). Pure functions
// never call Date.now() / new Date() internally — any timestamp is passed in.
// =============================================================================

/** Support classification for a single generated passage. */
export type SupportLabel =
  | 'supported' // strong overlap with one or more declared sources
  | 'weakly_supported' // some overlap, below the strong threshold
  | 'unsupported' // overlap exists but is too low to claim support
  | 'imported_knowledge'; // effectively no source overlap — model brought this in

/** A declared source passage (raw or extracted source material). */
export interface SourcePassage {
  /** Stable id so reports can reference the exact source span. */
  id: string;
  text: string;
  /** Optional provenance metadata (url, evidence id, capture hash, etc.). */
  sourceUrl?: string;
  evidenceId?: string;
  label?: string;
}

/** A generated passage (an AI-produced sentence/paragraph/claim). */
export interface GeneratedPassage {
  id: string;
  text: string;
  /** Optional: passage role e.g. 'summary' | 'interpretation' | 'quote'. */
  kind?: string;
}

/** A single source match for one generated passage. */
export interface SourceMatch {
  sourceId: string;
  sourceUrl?: string;
  evidenceId?: string;
  /** 0..1 cosine similarity over term-frequency vectors. */
  cosine: number;
  /** 0..1 n-gram / shingle overlap (Jaccard over shingles). */
  shingleOverlap: number;
  /** 0..1 blended confidence used for ranking and flagging. */
  confidence: number;
  /** Best-matching contiguous span of the source text. */
  matchedSpan: string;
}

/** Per-generated-passage traceability result. */
export interface PassageTrace {
  generatedId: string;
  generatedText: string;
  label: SupportLabel;
  /** 0..1 confidence of the best supporting source (0 if none). */
  confidence: number;
  /** Ranked best matches (highest confidence first). */
  matches: SourceMatch[];
  /** True when this passage is flagged for human attention. */
  flagged: boolean;
  /** Human-readable reason for the label / flag. */
  reason: string;
}

/** Aggregate confidence for an individual declared source. */
export interface SourceConfidence {
  sourceId: string;
  sourceUrl?: string;
  /** Mean confidence of generated passages best-matched to this source. */
  meanConfidence: number;
  /** How many generated passages this source best-supports. */
  supportsCount: number;
}

/** Provenance metadata captured for the whole report. */
export interface ProvenanceMetadata {
  /** ISO timestamp — PASSED IN by the caller (never Date.now() inside). */
  generatedAt: string;
  /** Declared source inputs (ids + optional urls). */
  declaredInputs: { id: string; sourceUrl?: string; evidenceId?: string }[];
  /** Engine version for auditability. */
  engineVersion: string;
  /** Thresholds in effect when the report was produced. */
  thresholds: TraceabilityThresholds;
  /** Optional free-form note (e.g. ai_run id). */
  note?: string;
}

/** The full traceability report. */
export interface TraceabilityReport {
  /** 0..1 weighted overall traceability score. */
  traceabilityScore: number;
  passages: PassageTrace[];
  /** Generated passages flagged unsupported or imported_knowledge. */
  flaggedClaims: PassageTrace[];
  sourceConfidence: SourceConfidence[];
  provenance: ProvenanceMetadata;
  /** Convenience: is the report publishable at the active threshold. */
  publishable: boolean;
}

/** Tunable thresholds for scoring + flagging. */
export interface TraceabilityThresholds {
  /** >= this blended confidence => 'supported'. */
  supported: number;
  /** >= this (and < supported) => 'weakly_supported'. */
  weaklySupported: number;
  /** < this => treated as 'imported_knowledge' (no real source). */
  importedKnowledgeFloor: number;
  /** Minimum overall traceabilityScore required to publish. */
  minPublishConfidence: number;
  /** N for n-gram shingles. */
  shingleSize: number;
}

export const DEFAULT_THRESHOLDS: TraceabilityThresholds = {
  supported: 0.62,
  weaklySupported: 0.32,
  importedKnowledgeFloor: 0.08,
  minPublishConfidence: 0.72,
  shingleSize: 3,
};

export const ENGINE_VERSION = '1.0.0';
