// =============================================================================
// @hsi/source-intelligence — pure vector helpers for the semantic layer.
//
// Cosine similarity mapped into [0,1], mirroring evidence-engine's
// relevance/embeddingRanker `cosine01` so the two engines score embeddings the
// same way. Kept local (not imported) to preserve this package's ZERO required
// runtime deps and bundler-safety. Pure & deterministic given its inputs.
// =============================================================================

import { clamp } from './text';

/**
 * Cosine similarity of two equal-length vectors, mapped from [-1,1] to [0,1].
 * Returns 0 for empty, mismatched-length, or zero-magnitude vectors so it never
 * produces NaN and always composes with the rest of the engine.
 */
export function cosine01(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  const cos = dot / (Math.sqrt(na) * Math.sqrt(nb));
  return clamp((cos + 1) / 2, 0, 1);
}
