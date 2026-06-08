// =============================================================================
// nli/index.ts — support classifier factory + barrel (Phase 5).
//
// Picks the LLM classifier when live (an OpenAI key present, unless forced to
// 'heuristic'); otherwise the deterministic heuristic. The LLM classifier
// self-falls-back to the heuristic on any failure, so this is always safe.
// =============================================================================

import type { EvidenceEngineConfig } from '../types';
import type { SupportClassifier } from './types';
import { createHeuristicClassifier } from './heuristicClassifier';
import { createLlmClassifier, type LlmClassifierDeps } from './llmClassifier';

export type { SupportClassification, SupportClassifier } from './types';
export {
  createHeuristicClassifier,
  classifyHeuristic,
} from './heuristicClassifier';
export { createLlmClassifier, type LlmClassifierDeps } from './llmClassifier';

/** Dependencies for selecting/constructing a support classifier. */
export interface SupportClassifierDeps extends LlmClassifierDeps {
  /** Force the heuristic classifier even when a key is present. */
  forceHeuristic?: boolean;
}

/**
 * Choose a support classifier. Uses the LLM classifier when an OpenAI key is
 * configured (and not forced to heuristic); otherwise the deterministic
 * heuristic. Either way it preserves uncertainty and never throws.
 */
export function createSupportClassifier(
  cfg: EvidenceEngineConfig,
  deps: SupportClassifierDeps = {},
): SupportClassifier {
  if (deps.forceHeuristic || !cfg.openaiApiKey) {
    return createHeuristicClassifier();
  }
  return createLlmClassifier(cfg, deps);
}
