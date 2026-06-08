// =============================================================================
// @hsi/source-intelligence — embedder factory (Phase 9).
//
// createEmbedder returns an Embedder whose `embed(texts)` matches the EmbedFn
// signature used across the semantic layer (and evidence-engine), so ONE
// embedder can be injected anywhere a `embed` fn is accepted.
//
//   * If `openaiApiKey` is present AND `local` is not forced → OpenAI embeddings
//     (text-embedding-3-small, documented endpoint) via the injected/global
//     fetch. Gated, never at import; any failure throws (callers already wrap
//     embed in graceful fallbacks).
//   * Otherwise → a DETERMINISTIC local lexical embedder: hashed token + bigram
//     bag, TF-weighted into a fixed-dim (default 256) L2-normalized vector. Pure,
//     ZERO deps, NO network, NO Date.now()/Math.random(). Stable for identical
//     input; similar texts land closer (higher cosine) than dissimilar ones.
//
// Outputs are labeled by `method` ('openai' | 'local-lexical') for transparency.
// =============================================================================

import { fnv1a } from '../internal/hash';
import { tokenize } from '../internal/text';

const OPENAI_EMBEDDINGS = 'https://api.openai.com/v1/embeddings';
const EMBED_MODEL = 'text-embedding-3-small';

/** Default dimensionality of the local lexical embedding. */
export const LOCAL_EMBED_DIM = 256;

/** An embedder labeled by the method it used. */
export interface Embedder {
  method: 'openai' | 'local-lexical';
  embed(texts: string[]): Promise<number[][]>;
}

/** Options for {@link createEmbedder}. */
export interface CreateEmbedderOptions {
  /** When present (and `local` not forced), use OpenAI embeddings. */
  openaiApiKey?: string;
  /** Injected fetch for the OpenAI path (else global fetch). */
  fetchImpl?: typeof fetch;
  /** Force the deterministic local lexical embedder regardless of key. */
  local?: boolean;
  /** Local embedding dimensionality (default 256). */
  dim?: number;
}

/**
 * Hash a token to a bucket index in [0, dim). Uses the package's fnv1a so it is
 * deterministic and dependency-free.
 */
function bucketOf(token: string, dim: number): number {
  const hex = fnv1a(token);
  // fnv1a returns 8 hex chars (32-bit) — parse and mod into the dim.
  return parseInt(hex, 16) % dim;
}

/**
 * Deterministic local lexical embedding. Builds a TF bag over unigrams AND
 * adjacent bigrams (so word order contributes), hashes each feature into a
 * fixed-dim vector, then L2-normalizes. Pure; identical input → identical output.
 *
 * Empty / token-less text yields an all-zero vector (cosine 0 — uncertainty
 * preserved, never NaN).
 */
export function localLexicalEmbed(texts: string[], dim: number = LOCAL_EMBED_DIM): number[][] {
  return texts.map((text) => {
    const vec = new Array<number>(dim).fill(0);
    const tokens = tokenize(text);
    // Unigrams.
    for (const t of tokens) {
      vec[bucketOf(t, dim)] += 1;
    }
    // Adjacent bigrams (order sensitivity).
    for (let i = 0; i + 1 < tokens.length; i += 1) {
      vec[bucketOf(`${tokens[i]}_${tokens[i + 1]}`, dim)] += 1;
    }
    // L2-normalize (guard the zero vector).
    let norm = 0;
    for (let i = 0; i < dim; i += 1) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm);
    if (norm === 0) return vec;
    for (let i = 0; i < dim; i += 1) vec[i] = vec[i] / norm;
    return vec;
  });
}

/**
 * The OpenAI embeddings POST (documented endpoint). Routed through the injected/
 * global fetch. Throws on any failure — callers (semantic layer) already degrade
 * gracefully to lexical similarity when an injected embed throws.
 */
function openAiEmbed(apiKey: string, fetchImpl?: typeof fetch): (texts: string[]) => Promise<number[][]> {
  return async (texts: string[]): Promise<number[][]> => {
    const f = fetchImpl ?? (globalThis as { fetch?: typeof fetch }).fetch;
    if (!f) throw new Error('no-fetch-available');
    const res = await f(OPENAI_EMBEDDINGS, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
    });
    if (!res.ok) throw new Error(`http-${res.status}`);
    const json = (await res.json()) as { data?: { embedding?: number[] }[] };
    return (json.data ?? []).map((d) => d.embedding ?? []);
  };
}

/**
 * Create an Embedder. OpenAI when a key is present and `local` is not forced;
 * otherwise the deterministic local lexical embedder. The returned `embed`
 * matches the EmbedFn signature used by the semantic layer + evidence-engine.
 */
export function createEmbedder(opts: CreateEmbedderOptions = {}): Embedder {
  const dim = opts.dim ?? LOCAL_EMBED_DIM;
  if (opts.openaiApiKey && !opts.local) {
    const embed = openAiEmbed(opts.openaiApiKey, opts.fetchImpl);
    return { method: 'openai', embed };
  }
  return {
    method: 'local-lexical',
    embed: async (texts: string[]): Promise<number[][]> => localLexicalEmbed(texts, dim),
  };
}
