// =============================================================================
// relevance/index.ts — relevance engine factory + barrel (Phase 5).
//
// Picks the embedding ranker when live (an OpenAI key OR an injected embed fn is
// present); otherwise the deterministic lexical ranker. Designed to also accept
// a future local embedder via the injected `embed` dependency.
// =============================================================================

import type { EvidenceEngineConfig } from '../types';
import type { RelevanceEngine } from './types';
import { createLexicalRanker } from './lexicalRanker';
import { createEmbeddingRanker, type EmbeddingRankerDeps } from './embeddingRanker';

export type { RelevanceEngine, EmbedFn } from './types';
export { createLexicalRanker, rankLexical } from './lexicalRanker';
export {
  createEmbeddingRanker,
  type EmbeddingRankerDeps,
} from './embeddingRanker';

/** Dependencies for selecting/constructing a relevance engine. */
export interface RelevanceDeps extends EmbeddingRankerDeps {}

/**
 * Choose a relevance engine. If `relevanceMode` is 'lexical' we always use the
 * lexical ranker. Otherwise we use the embedding ranker when an embed fn or an
 * OpenAI key is available (it self-falls-back to lexical when neither is).
 */
export function createRelevanceEngine(
  cfg: EvidenceEngineConfig,
  deps: RelevanceDeps = {},
): RelevanceEngine {
  if (cfg.relevanceMode === 'lexical') return createLexicalRanker();
  const hasEmbedding = Boolean(deps.embed || cfg.openaiApiKey);
  if (cfg.relevanceMode === 'embedding' || hasEmbedding) {
    return createEmbeddingRanker(cfg, deps);
  }
  return createLexicalRanker();
}
