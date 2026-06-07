// =============================================================================
// normalize.ts — turn partial/raw provider payloads into stable EvidenceResults,
// validate citations, and de-duplicate. PURE: no Date.now(), no randomness.
// =============================================================================

import type {
  EvidenceResult,
  PublicationType,
  ReliabilityTier,
} from './types';
import { reliabilityFromPublicationType, reliabilityTier } from './score';

/**
 * A fixed, deterministic fallback timestamp. Pure code MUST NOT call Date.now();
 * callers pass a real `now` (e.g. from the app) when determinism is not required.
 */
export const DEFAULT_NOW = '2024-01-01T00:00:00.000Z';

/**
 * DOI syntax per the Crossref/DOI handbook: `10.` then a registrant code, a
 * slash, and a suffix. We accept the common shape and reject obvious garbage.
 */
export const DOI_REGEX = /^10\.\d{4,9}\/[-._;()/:a-z0-9]+$/i;

/** Normalize a DOI: strip any URL/scheme prefix and lower-case it. */
export function normalizeDoi(doi: string | undefined): string | undefined {
  if (!doi) return undefined;
  let d = doi.trim();
  // Strip resolver prefixes and the `doi:` scheme.
  d = d.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
  d = d.replace(/^doi:/i, '');
  d = d.trim().toLowerCase();
  return d.length > 0 ? d : undefined;
}

/** Normalize an arXiv id: strip an `arXiv:` prefix and any URL wrapper. */
export function normalizeArxivId(id: string | undefined): string | undefined {
  if (!id) return undefined;
  let a = id.trim();
  a = a.replace(/^https?:\/\/arxiv\.org\/abs\//i, '');
  a = a.replace(/^arxiv:/i, '');
  // Drop a trailing version marker (v1, v2, ...) for stable de-duplication.
  a = a.replace(/v\d+$/i, '');
  a = a.trim();
  return a.length > 0 ? a : undefined;
}

/** Coerce an unknown authors value into a clean string[]. */
function normalizeAuthors(authors: unknown): string[] {
  if (Array.isArray(authors)) {
    return authors
      .map((x) => (typeof x === 'string' ? x.trim() : String(x).trim()))
      .filter((x) => x.length > 0);
  }
  if (typeof authors === 'string') {
    return authors
      .split(/[;,]| and /i)
      .map((x) => x.trim())
      .filter((x) => x.length > 0);
  }
  return [];
}

/** A loose partial used as input to {@link normalizeResult}. */
export type PartialEvidenceResult = Partial<
  Omit<EvidenceResult, 'authors'>
> & {
  authors?: unknown;
};

/**
 * Fill defaults and normalize a partial result into a complete EvidenceResult.
 * `now` is accepted so the operation stays pure/deterministic.
 */
export function normalizeResult(
  partial: PartialEvidenceResult,
  sourceName: string,
  now: string = DEFAULT_NOW,
): EvidenceResult {
  const publicationType: PublicationType = partial.publicationType ?? 'unknown';
  const doi = normalizeDoi(partial.doi);
  const arxivId = normalizeArxivId(partial.arxivId);
  const title = (partial.title ?? '').trim();

  const reliabilityScore =
    typeof partial.reliabilityScore === 'number'
      ? partial.reliabilityScore
      : reliabilityFromPublicationType(publicationType);

  // A stable id: prefer DOI, then arXiv, then any provider id, then the title.
  const id =
    (partial.id && partial.id.trim()) ||
    (doi && `doi:${doi}`) ||
    (arxivId && `arxiv:${arxivId}`) ||
    (partial.pubmedId && `pmid:${partial.pubmedId}`) ||
    (partial.semanticScholarId && `s2:${partial.semanticScholarId}`) ||
    `title:${title.toLowerCase()}`;

  return {
    id,
    title,
    authors: normalizeAuthors(partial.authors),
    year: partial.year,
    abstract: partial.abstract,
    sourceName,
    url: partial.url,
    doi,
    arxivId,
    pubmedId: partial.pubmedId,
    semanticScholarId: partial.semanticScholarId,
    publicationType,
    retrievedAt: partial.retrievedAt ?? now,
    reliabilityScore,
    relevanceScore: partial.relevanceScore ?? 0,
    supportType: partial.supportType ?? 'unclear',
    confidence: partial.confidence ?? 0,
    isFixture: partial.isFixture,
    raw: partial.raw,
  };
}

/**
 * Validate a citation's basic integrity and return a ReliabilityTier.
 * Returns 'invalid' for malformed records (no title, a present-but-malformed
 * DOI/arXiv id). Otherwise delegates to the reliability buckets.
 */
export function validateCitation(r: EvidenceResult): ReliabilityTier {
  if (!r.title || r.title.trim().length === 0) return 'invalid';
  // A DOI that is present but does not match the DOI grammar is malformed.
  if (r.doi !== undefined && !DOI_REGEX.test(r.doi)) return 'invalid';
  // An arXiv id, if present, must look like an identifier (digits + dots/slash).
  if (r.arxivId !== undefined && !/^[a-z\-]*\/?\d{3,}(\.\d{3,})?$/i.test(r.arxivId)) {
    return 'invalid';
  }

  // A citation "exists" if it has at least one durable identifier OR a URL.
  const hasCitation = Boolean(r.doi || r.arxivId || r.pubmedId || r.semanticScholarId || r.url);
  return reliabilityTier(r.reliabilityScore, hasCitation);
}

/** A de-dupe key: DOI > arXiv id > normalized title. */
function dedupeKey(r: EvidenceResult): string {
  if (r.doi) return `doi:${r.doi}`;
  if (r.arxivId) return `arxiv:${r.arxivId}`;
  return `title:${r.title.trim().toLowerCase().replace(/\s+/g, ' ')}`;
}

/**
 * De-duplicate results by DOI / arXiv id / title. The first occurrence wins
 * (callers should pass higher-quality sources first for stable results).
 */
export function dedupeResults(results: EvidenceResult[]): EvidenceResult[] {
  const seen = new Set<string>();
  const out: EvidenceResult[] = [];
  for (const r of results) {
    const key = dedupeKey(r);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}
