// =============================================================================
// claimMatcher.ts — rank evidence against claims, classify support/coverage, and
// aggregate coverage. Deterministic in fixture mode (no Date.now/randomness).
// =============================================================================

import type { Claim } from '@hsi/research-agents';
import type {
  ClaimEvidence,
  EvidenceCoverage,
  EvidenceEngineConfig,
  EvidenceMode,
  EvidenceQuery,
  EvidenceResult,
} from './types';
import { confidenceFor, relevanceScore, supportTypeFor } from './score';

/** Default config used when callers pass only a partial. */
export const DEFAULT_CONFIG: EvidenceEngineConfig = {
  mode: 'fixture',
  minRelevance: 0.12,
};

/** Resolve a partial config against the defaults. */
export function resolveConfig(
  cfg?: Partial<EvidenceEngineConfig>,
): EvidenceEngineConfig {
  return { ...DEFAULT_CONFIG, ...(cfg ?? {}) };
}

/**
 * Pick a coverage verdict for a claim from the strongest support relationship.
 * Precedence: supported > contradicted > background > unsupported.
 */
function coverageFromSupports(supports: Set<string>): ClaimEvidence['coverage'] {
  if (supports.has('supports')) return 'supported';
  if (supports.has('contradicts')) return 'contradicted';
  if (supports.has('background')) return 'background';
  return 'unsupported';
}

function bestSupportFor(results: EvidenceResult[]): ClaimEvidence['bestSupport'] {
  const present = new Set(results.map((r) => r.supportType));
  if (present.has('supports')) return 'supports';
  if (present.has('contradicts')) return 'contradicts';
  if (present.has('background')) return 'background';
  return 'unclear';
}

/**
 * Score and rank a set of candidate results against a single claim, producing a
 * ClaimEvidence. Results below `minRelevance` are dropped (no fabrication).
 */
export function matchClaim(
  claim: Claim,
  results: EvidenceResult[],
  cfg: EvidenceEngineConfig,
): ClaimEvidence {
  const query: EvidenceQuery = {
    text: claim.text,
    topics: claim.dependsOn,
    minRelevance: cfg.minRelevance,
  };

  const scored: EvidenceResult[] = [];
  for (const r of results) {
    const relevance = relevanceScore(query, r);
    if (relevance < cfg.minRelevance) continue; // honesty: drop weak matches
    const supportType = supportTypeFor(claim, r, relevance);
    const confidence = confidenceFor(r.reliabilityScore, relevance, supportType);
    scored.push({ ...r, relevanceScore: relevance, supportType, confidence });
  }

  // Rank: confidence first, then relevance, then reliability — all deterministic.
  scored.sort(
    (a, b) =>
      b.confidence - a.confidence ||
      b.relevanceScore - a.relevanceScore ||
      b.reliabilityScore - a.reliabilityScore ||
      a.id.localeCompare(b.id),
  );

  const supportsSet = new Set(scored.map((r) => r.supportType));
  const topRelevance = scored.length > 0 ? scored[0].relevanceScore : 0;

  return {
    claimId: claim.id,
    results: scored,
    bestSupport: bestSupportFor(scored),
    coverage: coverageFromSupports(supportsSet),
    topRelevance,
  };
}

/** A function that fetches candidate results for a query (e.g. an engine.search). */
export type SearchFn = (query: EvidenceQuery) => Promise<EvidenceResult[]>;

/**
 * Match many claims. The second argument is either a flat pool of pre-fetched
 * results (matched against every claim) or a search function called per claim.
 */
export async function matchClaims(
  claims: Claim[],
  resultsOrSearch: EvidenceResult[] | SearchFn,
  cfg: EvidenceEngineConfig,
): Promise<ClaimEvidence[]> {
  const out: ClaimEvidence[] = [];
  for (const claim of claims) {
    let candidates: EvidenceResult[];
    if (typeof resultsOrSearch === 'function') {
      candidates = await resultsOrSearch(claimToQuery(claim, cfg));
    } else {
      candidates = resultsOrSearch;
    }
    out.push(matchClaim(claim, candidates, cfg));
  }
  return out;
}

/** Derive an EvidenceQuery from a claim (text + dependency topics). */
export function claimToQuery(claim: Claim, cfg: EvidenceEngineConfig): EvidenceQuery {
  return {
    text: claim.text,
    topics: claim.dependsOn,
    minRelevance: cfg.minRelevance,
    limit: 20,
  };
}

/** Aggregate ClaimEvidence into an EvidenceCoverage summary. */
export function computeCoverage(
  matches: ClaimEvidence[],
  mode: 'fixture' | 'live' | 'mixed',
): EvidenceCoverage {
  let supported = 0;
  let contradicted = 0;
  let background = 0;
  let unsupported = 0;
  const bySource: Record<string, number> = {};

  for (const m of matches) {
    switch (m.coverage) {
      case 'supported':
        supported++;
        break;
      case 'contradicted':
        contradicted++;
        break;
      case 'background':
        background++;
        break;
      case 'unsupported':
        unsupported++;
        break;
    }
    for (const r of m.results) {
      bySource[r.sourceName] = (bySource[r.sourceName] ?? 0) + 1;
    }
  }

  const total = matches.length;
  // Coverage = fraction of claims with an affirming OR contradicting source.
  const covered = supported + contradicted;
  const coverageScore = total === 0 ? 0 : Math.round((covered / total) * 100);

  return {
    totalClaims: total,
    supported,
    contradicted,
    background,
    unsupported,
    coverageScore,
    bySource,
    mode,
  };
}

/** Derive the coverage `mode` from the results' fixture/live composition. */
export function coverageModeFromResults(
  sources: EvidenceResult[],
  engineMode: EvidenceMode,
): 'fixture' | 'live' | 'mixed' {
  if (sources.length === 0) return engineMode;
  let anyFixture = false;
  let anyLive = false;
  for (const s of sources) {
    if (s.isFixture) anyFixture = true;
    else anyLive = true;
  }
  if (anyFixture && anyLive) return 'mixed';
  if (anyFixture) return 'fixture';
  return 'live';
}
