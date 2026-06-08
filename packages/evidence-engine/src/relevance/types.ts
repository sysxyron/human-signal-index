// =============================================================================
// relevance/types.ts — relevance ranking contract (WorldForge Phase 5).
// =============================================================================

import type { EvidenceResult } from '../types';

/**
 * A relevance engine ranks candidate results against a claim's text, returning
 * the results with `relevanceScore` (0..1) set and sorted descending.
 * Implementations MUST never throw — degrade to a sensible ordering on error.
 */
export interface RelevanceEngine {
  /** Human-readable name, e.g. 'lexical', 'embedding(text-embedding-3-small)'. */
  name: string;
  /** Whether this is the deterministic fixture/default ranker or a live one. */
  mode: 'fixture' | 'live';
  /**
   * Rank results for a claim. Returns a NEW array (does not mutate input) with
   * each result's `relevanceScore` set, sorted best-first.
   */
  rank(
    claimText: string,
    results: EvidenceResult[],
    now?: string,
  ): Promise<EvidenceResult[]>;
}

/** An injected embedding function: maps texts to unit-or-raw vectors. */
export type EmbedFn = (texts: string[]) => Promise<number[][]>;
