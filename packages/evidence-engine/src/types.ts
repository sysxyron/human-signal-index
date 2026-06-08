// =============================================================================
// @hsi/evidence-engine — public type model (WorldForge Phase 4)
// An Evidence & Citation Engine. It replaces placeholder research citations with
// real, retrievable evidence sources. It is deterministic WITHOUT API keys via
// curated fixtures, and only touches the network when explicitly configured
// (live mode + the right key/email). ZERO required runtime dependencies.
// =============================================================================

/**
 * How a given piece of evidence relates to a claim.
 * - `supports`     — the source affirms the claim.
 * - `contradicts`  — the source argues against the claim.
 * - `background`   — relevant context, neither affirming nor contradicting.
 * - `unclear`      — matched, but the relationship cannot be determined.
 */
export type SupportType = 'supports' | 'contradicts' | 'background' | 'unclear';

/** The bibliographic class of a source — drives the base reliability score. */
export type PublicationType =
  | 'peer-reviewed'
  | 'preprint'
  | 'review'
  | 'encyclopedia'
  | 'web'
  | 'dataset'
  | 'unknown';

/**
 * A coarse reliability bucket for a citation.
 * - `invalid`     — the citation is malformed (no title, bad DOI, etc.).
 * - `unsupported` — there is no citation backing the score at all.
 * - `low`/`medium`/`high` — increasing reliability for a present citation.
 */
export type ReliabilityTier = 'high' | 'medium' | 'low' | 'unsupported' | 'invalid';

/** A query against the evidence engine, derived from a claim or topic. */
export interface EvidenceQuery {
  /** Free-text query (usually a claim's text). */
  text: string;
  /** Optional topic tags to bias matching. */
  topics?: string[];
  /** Optional publication year hint. */
  year?: number;
  /** Max results to return. */
  limit?: number;
  /** Minimum relevance [0..1] a result must clear to be returned. */
  minRelevance?: number;
}

/** A single retrievable evidence source, normalized into a stable shape. */
export interface EvidenceResult {
  id: string;
  title: string;
  authors: string[];
  year?: number;
  abstract?: string;
  /** Human-readable provider/source name, e.g. 'arXiv', 'Crossref', 'fixture'. */
  sourceName: string;
  url?: string;
  /** Normalized DOI (no scheme, lower-cased), e.g. '10.1038/nature12373'. */
  doi?: string;
  arxivId?: string;
  pubmedId?: string;
  semanticScholarId?: string;
  publicationType: PublicationType;
  /** ISO timestamp the result was retrieved/produced (deterministic in fixtures). */
  retrievedAt: string;
  /** 0..1 — how reliable the source itself is (publication type driven). */
  reliabilityScore: number;
  /** 0..1 — how relevant the source is to the query (lexical, deterministic). */
  relevanceScore: number;
  /** How this source relates to the claim it was matched against. */
  supportType: SupportType;
  /** 0..1 — combined confidence the source backs the claim as classified. */
  confidence: number;
  /** True when this came from the curated demo fixture set. */
  isFixture?: boolean;
  /**
   * Optional short, human-readable justification for this source's support
   * classification (Phase 5). Populated by the support classifier.
   */
  rationale?: string;
  /** Provider-specific payload (never typed `any` in the public API). */
  raw?: unknown;
}

/** The contract every evidence provider implements. */
export interface EvidenceProvider {
  /** Stable provider name (used in coverage `bySource`). */
  name: string;
  /** Whether this provider is wired up and may be called. */
  enabled(): boolean;
  /** Search the provider; MUST return [] (never throw) when disabled/failed. */
  search(query: EvidenceQuery): Promise<EvidenceResult[]>;
  /** Look up a single source by an id the provider understands (doi/arxiv/etc). */
  lookupById(id: string): Promise<EvidenceResult | null>;
}

/** Evidence gathered for one claim, ranked and classified. */
export interface ClaimEvidence {
  claimId: string;
  /** Ranked results (best first). */
  results: EvidenceResult[];
  /** The strongest support relationship found across `results`. */
  bestSupport: SupportType;
  /** Coverage verdict for the claim. */
  coverage: 'supported' | 'contradicted' | 'background' | 'unsupported';
  /** The highest relevance score among `results` (0 when none). */
  topRelevance: number;
}

/** Aggregate coverage across all claims in a run. */
export interface EvidenceCoverage {
  totalClaims: number;
  supported: number;
  contradicted: number;
  background: number;
  unsupported: number;
  /** 0..100 — fraction of claims with supporting or contradicting evidence. */
  coverageScore: number;
  /** Count of results contributed per source name. */
  bySource: Record<string, number>;
  /** Whether the evidence came from fixtures, the network, or both. */
  mode: 'fixture' | 'live' | 'mixed';
}

/** Operating mode of the engine. */
export type EvidenceMode = 'fixture' | 'live';

/**
 * How relevance ranking is performed (Phase 5):
 * - `lexical`   — deterministic Jaccard ranker (default; no keys).
 * - `embedding` — cosine over embeddings (OpenAI or injected embed fn), with a
 *                 lexical fallback when neither is available.
 * - `auto`      — embedding when a key/embed fn is present, else lexical.
 */
export type RelevanceMode = 'lexical' | 'embedding' | 'auto';

/**
 * Engine configuration. The PURE package never reads process.env — the host app
 * passes resolved config in (so keys/emails come from the app's own loader).
 */
export interface EvidenceEngineConfig {
  mode: EvidenceMode;
  /** Default minimum relevance [0..1] for matching. */
  minRelevance: number;
  /** Semantic Scholar API key (optional; enables that provider in live mode). */
  semanticScholarApiKey?: string;
  /** Contact email required by NCBI eutils etiquette (enables PubMed live). */
  pubmedEmail?: string;
  /** Contact mailto for the Crossref "polite pool" (enables Crossref live). */
  crossrefMailto?: string;
  /**
   * OpenAI API key (Phase 5). When present, enables the embedding relevance
   * ranker and the LLM support classifier. NEVER read from env by this package —
   * the host app passes it in. Absent → deterministic lexical + heuristic.
   */
  openaiApiKey?: string;
  /** Retrieval-cache TTL in seconds (default 86400 = 24h). */
  cacheTtlSeconds?: number;
  /** Relevance ranking strategy (default 'auto'). */
  relevanceMode?: RelevanceMode;
}
