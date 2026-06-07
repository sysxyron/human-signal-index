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
  matchClaim,
  resolveConfig,
} from './claimMatcher';
import { createProviders, type WebFetcher } from './providers';
import { createFixtureProvider } from './fixtures/chronid-sources';

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
  /** Search all enabled providers, merge + de-dupe the union. */
  search(query: EvidenceQuery): Promise<EvidenceResult[]>;
  /** Look up a single source across enabled providers (first hit wins). */
  lookupById(id: string): Promise<EvidenceResult | null>;
}

/** Options for {@link createEvidenceEngine} beyond raw config. */
export interface CreateEngineOptions {
  /** Deterministic timestamp stamped onto live results. */
  now?: string;
  /** Optional host-provided web backend for the (otherwise disabled) fallback. */
  webFetcher?: WebFetcher;
}

/**
 * Create an EvidenceEngine. Default mode is 'fixture' (deterministic, no keys).
 * Config is resolved from the passed object only — the pure package NEVER reads
 * process.env; the host app supplies keys/emails.
 */
export function createEvidenceEngine(
  cfg?: Partial<EvidenceEngineConfig>,
  options?: CreateEngineOptions,
): EvidenceEngine {
  const config = resolveConfig(cfg);
  const now = options?.now ?? DEFAULT_NOW;

  // In fixture mode we deliberately use ONLY the fixture provider (no network).
  const providers: EvidenceProvider[] =
    config.mode === 'fixture'
      ? [createFixtureProvider()]
      : createProviders(config, now, options?.webFetcher);

  return {
    mode: config.mode,
    config,
    providers,
    async search(query: EvidenceQuery): Promise<EvidenceResult[]> {
      const enabled = providers.filter((p) => p.enabled());
      const settled = await Promise.all(
        enabled.map((p) =>
          p.search(query).catch((): EvidenceResult[] => []),
        ),
      );
      // Order matters for de-dupe (first occurrence wins): providers are listed
      // best-first, so fixtures/peer-reviewed sources take precedence.
      return dedupeResults(settled.flat());
    },
    async lookupById(id: string): Promise<EvidenceResult | null> {
      const enabled = providers.filter((p) => p.enabled());
      for (const p of enabled) {
        const hit = await p.lookupById(id).catch(() => null);
        if (hit) return hit;
      }
      return null;
    },
  };
}

/**
 * Top-level orchestration: for each claim, derive a query, search the engine,
 * match + classify, then de-dupe the union of all sources and compute coverage.
 * Deterministic in fixture mode (pass a fixed `now`).
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
    const candidates = await engine.search(query);
    const match = matchClaim(claim, candidates, cfg);
    matches.push(match);
    // Stamp `now` so retrievedAt is consistent for this run, then collect.
    for (const r of match.results) {
      allSources.push(r.retrievedAt ? r : { ...r, retrievedAt: now });
    }
  }

  const sources = dedupeResults(allSources);
  const mode = coverageModeFromResults(sources, engine.mode);
  const coverage = computeCoverage(matches, mode);

  return { matches, sources, coverage };
}
