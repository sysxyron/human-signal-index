// =============================================================================
// relevance/embeddingRanker.ts — embedding (cosine) relevance ranker (Phase 5).
//
// Live mode ranks by cosine similarity over embeddings. Embeddings come from
// EITHER an injected `embed(texts)` function OR an OpenAI embeddings call via
// global fetch (gated by `openaiApiKey`). If NEITHER is available — or anything
// fails — it FALLS BACK to the deterministic lexical ranker. NEVER throws.
//
// OpenAI endpoint: https://api.openai.com/v1/embeddings
// Model:           text-embedding-3-small
// =============================================================================

import type { EvidenceEngineConfig, EvidenceResult } from '../types';
import { clamp01 } from '../score';
import type { EmbedFn, RelevanceEngine } from './types';
import { rankLexical } from './lexicalRanker';
import type { FetchImpl, MillisClock } from '../providers/http';
import type { ProviderHealthTracker } from '../providerHealth';

const OPENAI_EMBEDDINGS = 'https://api.openai.com/v1/embeddings';
const EMBED_MODEL = 'text-embedding-3-small';

/** Injectable deps for the embedding ranker. */
export interface EmbeddingRankerDeps {
  /** Direct embedding function (preferred; bypasses the network). */
  embed?: EmbedFn;
  /** Injected fetch for the OpenAI path (defaults to global fetch). */
  fetchImpl?: FetchImpl;
  /** Clock for health latency. */
  clock?: MillisClock;
  /** ISO now for health stamping. */
  now?: string;
  /** Health tracker for the OpenAI embeddings backend. */
  healthTracker?: ProviderHealthTracker;
}

const HEALTH_NAME = 'OpenAI Embeddings';

/** The text we embed for a result (title + abstract). */
function resultText(r: EvidenceResult): string {
  return `${r.title} ${r.abstract ?? ''}`.trim();
}

/** Cosine similarity of two equal-length vectors, mapped into [0,1]. */
function cosine01(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  const cos = dot / (Math.sqrt(na) * Math.sqrt(nb));
  // cosine is in [-1,1]; map to [0,1] so it composes with the rest of the engine.
  return clamp01((cos + 1) / 2);
}

/**
 * Create an embedding-based RelevanceEngine. In live mode it embeds the claim +
 * each result and ranks by cosine similarity. With no embed fn AND no key (or on
 * any failure) it transparently falls back to the lexical ranker.
 */
export function createEmbeddingRanker(
  cfg: EvidenceEngineConfig,
  deps: EmbeddingRankerDeps = {},
): RelevanceEngine {
  const apiKey = cfg.openaiApiKey;
  // Prefer an injected embed fn; else build the OpenAI one IF a key is present.
  const embed: EmbedFn | undefined =
    deps.embed ?? (apiKey ? openAiEmbedViaPost(apiKey, deps) : undefined);

  const name = deps.embed
    ? 'embedding(injected)'
    : apiKey
      ? `embedding(${EMBED_MODEL})`
      : 'embedding(fallback:lexical)';

  return {
    name,
    mode: embed ? 'live' : 'fixture',
    async rank(claimText, results): Promise<EvidenceResult[]> {
      if (!embed || results.length === 0) {
        return rankLexical(claimText, results);
      }
      try {
        const texts = [claimText, ...results.map(resultText)];
        const vectors = await embed(texts);
        if (!Array.isArray(vectors) || vectors.length !== texts.length) {
          return rankLexical(claimText, results);
        }
        const claimVec = vectors[0];
        const scored = results.map((r, i) => ({
          ...r,
          relevanceScore: cosine01(claimVec, vectors[i + 1] ?? []),
        }));
        scored.sort(
          (a, b) =>
            b.relevanceScore - a.relevanceScore || a.id.localeCompare(b.id),
        );
        return scored;
      } catch {
        // Honesty + resilience: never throw, fall back to deterministic lexical.
        return rankLexical(claimText, results);
      }
    },
  };
}

/**
 * The OpenAI embeddings API requires a POST with a JSON body, which `fetchJson`
 * (a GET-style helper) does not send. We use a minimal local POST here, still
 * routed through global/injected fetch, gracefully failing to throw → caught by
 * `rank` → lexical fallback.
 */
function openAiEmbedViaPost(apiKey: string, deps: EmbeddingRankerDeps): EmbedFn {
  return async (texts: string[]): Promise<number[][]> => {
    const fetchImpl =
      deps.fetchImpl ??
      ((globalThis as { fetch?: FetchImpl }).fetch?.bind(globalThis) as
        | FetchImpl
        | undefined);
    if (!fetchImpl) throw new Error('no-fetch-available');
    const clock = deps.clock ?? (() => 0);
    const start = clock();
    try {
      const res = await fetchImpl(OPENAI_EMBEDDINGS, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
      });
      if (!res.ok) throw new Error(`http-${res.status}`);
      const json = (await res.json()) as { data?: { embedding?: number[] }[] };
      deps.healthTracker?.recordSuccess(HEALTH_NAME, clock() - start, deps.now);
      return (json.data ?? []).map((d) => d.embedding ?? []);
    } catch (err) {
      deps.healthTracker?.recordFailure(
        HEALTH_NAME,
        deps.now,
        err instanceof Error ? err.message : String(err),
      );
      throw err;
    }
  };
}
