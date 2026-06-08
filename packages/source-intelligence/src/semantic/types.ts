// =============================================================================
// @hsi/source-intelligence — SEMANTIC layer types (Phase 8).
//
// Semantic classification + narrative clustering ENRICH the deterministic
// Phase-7 lexical classifier — they never replace it. When an `embed` function
// is injected (or the optional OpenAI path is configured upstream) we rank text
// against category prototypes by cosine similarity; with no embed fn we fall
// back gracefully to the existing lexical `classifySignal`.
//
// ETHICS (binding, inherited from Phase 7): PUBLIC information only; DRAFTS only;
// nothing auto-published or auto-actioned. PRESERVE UNCERTAINTY — low confidence
// and category 'other' when ambiguous; certainty is never forced. Determinism:
// callers inject `now`; no Date.now()/Math.random() in pure code; embeddings are
// only ever computed through the INJECTED `embed` fn (never at import time).
// =============================================================================

/**
 * Result of semantic classification. Mirrors the shape of the lexical
 * `Classification` where it overlaps, but adds semantic neighbors and the exact
 * lexical `matchedTerms` that contributed, so the decision stays explainable.
 */
export interface SemanticClassification {
  /** Winning category id (`string` — unlimited custom categories supported). */
  category: string;
  /** Calibrated confidence in [0,1]. Low + 'other' when ambiguous. */
  confidence: number;
  /** Human-readable explanation of WHY this category was chosen. */
  rationale: string;
  /** Lexical terms that matched (from the deterministic classifier). */
  matchedTerms: string[];
  /** Nearest category prototypes by semantic score (empty in lexical fallback). */
  semanticNeighbors: { label: string; score: number }[];
}

/**
 * Injectable dependencies for the semantic layer. `embed` follows the same
 * contract as evidence-engine's `EmbedFn` (texts -> vectors) so a host can pass
 * ONE embedder to both engines. Omit it for the deterministic lexical fallback.
 */
export interface SemanticDeps {
  /** Embedding function (preferred; bypasses network). Omit → lexical fallback. */
  embed?: (texts: string[]) => Promise<number[][]>;
  /** ISO timestamp injected by the caller (determinism). */
  now?: string;
}
