// =============================================================================
// @hsi/evidence-engine — public entry point (WorldForge Phase 4).
//
// Replaces placeholder research citations with real, retrievable evidence.
// Deterministic WITHOUT API keys via curated fixtures (default mode 'fixture').
// In 'live' mode it fans out across real public APIs (each self-gated by key/
// email presence). ZERO required runtime dependencies; the network is only ever
// touched when explicitly configured, never at import time.
// =============================================================================

import type { Claim } from '@hsi/research-agents';
import type {
  ClaimEvidence,
  EvidenceCoverage,
  EvidenceEngineConfig,
  EvidenceMode,
  EvidenceProvider,
  EvidenceQuery,
  EvidenceResult,
} from './types';
import { DEFAULT_NOW, dedupeResults } from './normalize';
import {
  claimToQuery,
  computeCoverage,
  coverageModeFromResults,
  resolveConfig,
} from './claimMatcher';
import { createProviders, type WebFetcher } from './providers';
import type { FetchImpl, MillisClock, ProviderDeps } from './providers';
import { createFixtureProvider } from './fixtures/chronid-sources';
import {
  ProviderHealthTracker,
  defaultProviderHealthTracker,
  type ProviderHealth,
} from './providerHealth';
import { cacheKey, type CacheStore } from './cache';
import {
  createRelevanceEngine,
  type EmbedFn,
  type RelevanceEngine,
} from './relevance';
import {
  createSupportClassifier,
  type SupportClassifier,
} from './nli';

// -- Re-exports: types -------------------------------------------------------
export type {
  SupportType,
  PublicationType,
  ReliabilityTier,
  EvidenceQuery,
  EvidenceResult,
  EvidenceProvider,
  ClaimEvidence,
  EvidenceCoverage,
  EvidenceMode,
  RelevanceMode,
  EvidenceEngineConfig,
} from './types';

// -- Re-exports: normalize ---------------------------------------------------
export {
  DEFAULT_NOW,
  DOI_REGEX,
  normalizeDoi,
  normalizeArxivId,
  normalizeResult,
  validateCitation,
  dedupeResults,
  type PartialEvidenceResult,
} from './normalize';

// -- Re-exports: score -------------------------------------------------------
export {
  reliabilityFromPublicationType,
  reliabilityTier,
  relevanceScore,
  supportTypeFor,
  confidenceFor,
  tokenize,
  extractResultTopics,
  extractStance,
  clamp01,
  RELEVANCE_SUPPORT_THRESHOLD,
} from './score';

// -- Re-exports: claimMatcher ------------------------------------------------
export {
  matchClaim,
  matchClaims,
  computeCoverage,
  claimToQuery,
  coverageModeFromResults,
  resolveConfig,
  DEFAULT_CONFIG,
  type SearchFn,
} from './claimMatcher';

// -- Re-exports: providers ---------------------------------------------------
export {
  createProviders,
  createArxivProvider,
  createCrossrefProvider,
  createPubmedProvider,
  createSemanticScholarProvider,
  createDoiProvider,
  createWebFallbackProvider,
  type WebFetcher,
} from './providers';

// -- Re-exports: providers (hardened HTTP + deps) ----------------------------
export {
  fetchJson,
  fetchText,
  httpOptionsFor,
  type FetchImpl,
  type MillisClock,
  type HttpResult,
  type HttpOptions,
  type ProviderDeps,
} from './providers';

// -- Re-exports: provider health ---------------------------------------------
export {
  ProviderHealthTracker,
  defaultProviderHealthTracker,
  getProviderHealth,
  HEALTH_WINDOW,
  type ProviderHealth,
  type ProviderStatus,
} from './providerHealth';

// -- Re-exports: retrieval cache ---------------------------------------------
export {
  InMemoryCacheStore,
  cacheKey,
  hashQuery,
  type CacheStore,
  type CachedEntry,
} from './cache';

// -- Re-exports: relevance ---------------------------------------------------
export {
  createRelevanceEngine,
  createLexicalRanker,
  createEmbeddingRanker,
  rankLexical,
  type RelevanceEngine,
  type RelevanceDeps,
  type EmbeddingRankerDeps,
  type EmbedFn,
} from './relevance';

// -- Re-exports: support/contradiction NLI -----------------------------------
export {
  createSupportClassifier,
  createHeuristicClassifier,
  createLlmClassifier,
  classifyHeuristic,
  type SupportClassifier,
  type SupportClassification,
  type SupportClassifierDeps,
  type LlmClassifierDeps,
} from './nli';

// -- Re-exports: fixtures ----------------------------------------------------
export {
  CHRONID_FIXTURES,
  FixtureProvider,
  createFixtureProvider,
} from './fixtures/chronid-sources';

/**
 * The assembled engine. `search` fans out across enabled providers (fixture
 * mode uses only the FixtureProvider). It is consumed by {@link gatherEvidence}.
 */
export interface EvidenceEngine {
  readonly mode: EvidenceMode;
  readonly config: EvidenceEngineConfig;
  /** The providers backing this engine (for introspection/coverage). */
  readonly providers: EvidenceProvider[];
  /** The relevance ranker (lexical or embedding) used by gatherEvidence. */
  readonly relevance: RelevanceEngine;
  /** The support classifier (heuristic or LLM) used by gatherEvidence. */
  readonly classifier: SupportClassifier;
  /** Search all enabled providers (cache-aware), merge + de-dupe the union. */
  search(query: EvidenceQuery): Promise<EvidenceResult[]>;
  /** Look up a single source across enabled providers (first hit wins). */
  lookupById(id: string): Promise<EvidenceResult | null>;
  /** A point-in-time snapshot of provider health for this engine. */
  health(): ProviderHealth[];
}

/** Options for {@link createEvidenceEngine} beyond raw config. */
export interface CreateEngineOptions {
  /** Deterministic timestamp stamped onto live results. */
  now?: string;
  /** Optional host-provided web backend for the (otherwise disabled) fallback. */
  webFetcher?: WebFetcher;
  /** Retrieval cache (e.g. InMemoryCacheStore or an app Supabase store). */
  cacheStore?: CacheStore;
  /** Provider-health tracker (defaults to the module-level shared one). */
  healthTracker?: ProviderHealthTracker;
  /** Injected embedding function (overrides the OpenAI path). */
  embed?: EmbedFn;
  /** Injected fetch for all network paths (defaults to global fetch). */
  fetchImpl?: FetchImpl;
  /** Millisecond clock for latency measurement (health). */
  clock?: MillisClock;
  /** Deterministic jitter seed for HTTP backoff (replaces Math.random). */
  jitterSeed?: number;
  /** Per-request HTTP timeout (ms). */
  timeoutMs?: number;
  /** Retries after the first HTTP attempt. */
  retries?: number;
  /** Base HTTP backoff (ms). */
  backoffMs?: number;
  /** Injectable sleep for HTTP backoff (tests can skip real delays). */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Create an EvidenceEngine. Default mode is 'fixture' (deterministic, no keys).
 * Config is resolved from the passed object only — the pure package NEVER reads
 * process.env; the host app supplies keys/emails.
 *
 * Phase 5: the engine also owns a relevance ranker, a support classifier, an
 * optional retrieval cache, and a provider-health tracker. All network/OpenAI
 * paths are gated by config + injected deps and degrade gracefully.
 */
export function createEvidenceEngine(
  cfg?: Partial<EvidenceEngineConfig>,
  options?: CreateEngineOptions,
): EvidenceEngine {
  const config = resolveConfig(cfg);
  const now = options?.now ?? DEFAULT_NOW;
  const healthTracker = options?.healthTracker ?? defaultProviderHealthTracker;
  const cacheStore = options?.cacheStore;
  const cacheTtlSeconds = config.cacheTtlSeconds ?? 86400;

  const providerDeps: ProviderDeps = {
    fetchImpl: options?.fetchImpl,
    clock: options?.clock,
    jitterSeed: options?.jitterSeed,
    timeoutMs: options?.timeoutMs,
    retries: options?.retries,
    backoffMs: options?.backoffMs,
    sleep: options?.sleep,
    healthTracker,
  };

  // In fixture mode we deliberately use ONLY the fixture provider (no network).
  const providers: EvidenceProvider[] =
    config.mode === 'fixture'
      ? [createFixtureProvider()]
      : createProviders(config, now, options?.webFetcher, providerDeps);

  if (config.mode === 'fixture') {
    healthTracker.register('fixture', true);
  }

  const relevance = createRelevanceEngine(config, {
    embed: options?.embed,
    fetchImpl: options?.fetchImpl,
    clock: options?.clock,
    now,
    healthTracker,
  });

  const classifier = createSupportClassifier(config, {
    fetchImpl: options?.fetchImpl,
    clock: options?.clock,
    now,
    healthTracker,
  });

  const searchProviders = async (
    query: EvidenceQuery,
  ): Promise<EvidenceResult[]> => {
    const enabled = providers.filter((p) => p.enabled());
    const settled = await Promise.all(
      enabled.map((p) => p.search(query).catch((): EvidenceResult[] => [])),
    );
    // Order matters for de-dupe (first occurrence wins): providers are listed
    // best-first, so fixtures/peer-reviewed sources take precedence.
    return dedupeResults(settled.flat());
  };

  return {
    mode: config.mode,
    config,
    providers,
    relevance,
    classifier,
    async search(query: EvidenceQuery): Promise<EvidenceResult[]> {
      // Cache-aware: check → on miss call providers → store. Any cache error
      // degrades gracefully to a direct provider search.
      if (cacheStore) {
        const key = cacheKey(config.mode, query.text);
        try {
          const hit = await cacheStore.get(key);
          if (hit && Array.isArray(hit.value)) {
            return hit.value as EvidenceResult[];
          }
        } catch {
          // cache miss/failure — fall through to providers
        }
        const fresh = await searchProviders(query);
        try {
          await cacheStore.set(key, fresh, cacheTtlSeconds, now);
        } catch {
          // best-effort store; ignore failures
        }
        return fresh;
      }
      return searchProviders(query);
    },
    async lookupById(id: string): Promise<EvidenceResult | null> {
      const enabled = providers.filter((p) => p.enabled());
      for (const p of enabled) {
        const hit = await p.lookupById(id).catch(() => null);
        if (hit) return hit;
      }
      return null;
    },
    health(): ProviderHealth[] {
      return healthTracker.snapshot();
    },
  };
}

/** Precedence: supported > contradicted > background > unsupported. */
function coverageFromResults(results: EvidenceResult[]): ClaimEvidence['coverage'] {
  const present = new Set(results.map((r) => r.supportType));
  if (present.has('supports')) return 'supported';
  if (present.has('contradicts')) return 'contradicted';
  if (present.has('background')) return 'background';
  return 'unsupported';
}

function bestSupportFromResults(results: EvidenceResult[]): ClaimEvidence['bestSupport'] {
  const present = new Set(results.map((r) => r.supportType));
  if (present.has('supports')) return 'supports';
  if (present.has('contradicts')) return 'contradicts';
  if (present.has('background')) return 'background';
  return 'unclear';
}

/**
 * Top-level orchestration (Phase 5 pipeline). For each claim:
 *   1. derive a query and `engine.search` it (cache → providers → health),
 *   2. rank candidates with the engine's relevance ranker (lexical/embedding),
 *   3. classify each ranked result with the support classifier (heuristic/LLM),
 *   4. assemble a ClaimEvidence (drop sub-`minRelevance` matches; no fabrication).
 * Then de-dupe the union of all sources and compute coverage.
 *
 * Deterministic in fixture mode (pass a fixed `now`). EVERY provider/relevance/
 * classifier call is wrapped so a failure yields a graceful unsupported result —
 * the run never throws and never fails.
 */
export async function gatherEvidence(
  claims: Claim[],
  engine: EvidenceEngine,
  now: string = DEFAULT_NOW,
): Promise<{
  matches: ClaimEvidence[];
  sources: EvidenceResult[];
  coverage: EvidenceCoverage;
}> {
  const cfg = engine.config;
  const matches: ClaimEvidence[] = [];
  const allSources: EvidenceResult[] = [];

  for (const claim of claims) {
    const query: EvidenceQuery = claimToQuery(claim, cfg);

    // 1. Retrieve (never throws).
    const candidates = await engine.search(query).catch((): EvidenceResult[] => []);

    // 2. Rank by relevance (never throws → empty ranking on failure).
    const ranked = await engine.relevance
      .rank(claim.text, candidates, now)
      .catch((): EvidenceResult[] => []);

    // 3. Classify each candidate above the relevance floor (honesty: drop weak).
    const scored: EvidenceResult[] = [];
    for (const r of ranked) {
      const relevance = r.relevanceScore;
      if (relevance < cfg.minRelevance) continue;
      const cls = await engine.classifier
        .classify(claim, r, relevance, now)
        .catch(() => null);
      const supportType = cls?.classification ?? 'unclear';
      const confidence = cls?.confidence ?? 0;
      scored.push({
        ...r,
        relevanceScore: relevance,
        supportType,
        confidence,
        rationale: cls?.rationale,
        retrievedAt: r.retrievedAt ?? now,
      });
    }

    // 4. Rank: confidence, then relevance, then reliability — all deterministic.
    scored.sort(
      (a, b) =>
        b.confidence - a.confidence ||
        b.relevanceScore - a.relevanceScore ||
        b.reliabilityScore - a.reliabilityScore ||
        a.id.localeCompare(b.id),
    );

    const match: ClaimEvidence = {
      claimId: claim.id,
      results: scored,
      bestSupport: bestSupportFromResults(scored),
      coverage: coverageFromResults(scored),
      topRelevance: scored.length > 0 ? scored[0].relevanceScore : 0,
    };
    matches.push(match);
    for (const r of match.results) allSources.push(r);
  }

  const sources = dedupeResults(allSources);
  const mode = coverageModeFromResults(sources, engine.mode);
  const coverage = computeCoverage(matches, mode);

  return { matches, sources, coverage };
}
