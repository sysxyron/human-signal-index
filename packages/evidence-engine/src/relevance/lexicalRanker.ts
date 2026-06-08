// =============================================================================
// relevance/lexicalRanker.ts — deterministic lexical (Jaccard) ranker (Phase 5).
//
// Wraps the existing pure `relevanceScore` (Jaccard over tokens) as a
// RelevanceEngine. This is the fixture/default ranker: fully deterministic,
// offline, no keys. Used as the fallback for the embedding ranker too.
// =============================================================================

import type { EvidenceQuery, EvidenceResult } from '../types';
import { relevanceScore } from '../score';
import type { RelevanceEngine } from './types';

/** Rank `results` against `claimText` by Jaccard relevance, best-first. */
export function rankLexical(
  claimText: string,
  results: EvidenceResult[],
): EvidenceResult[] {
  const query: EvidenceQuery = { text: claimText };
  return results
    .map((r) => ({ ...r, relevanceScore: relevanceScore(query, r) }))
    .sort(
      (a, b) =>
        b.relevanceScore - a.relevanceScore || a.id.localeCompare(b.id),
    );
}

/** The deterministic lexical RelevanceEngine. */
export function createLexicalRanker(): RelevanceEngine {
  return {
    name: 'lexical',
    mode: 'fixture',
    async rank(claimText, results): Promise<EvidenceResult[]> {
      return rankLexical(claimText, results);
    },
  };
}
