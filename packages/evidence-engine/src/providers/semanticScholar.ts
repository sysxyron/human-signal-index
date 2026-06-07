// =============================================================================
// providers/semanticScholar.ts — Semantic Scholar Graph API provider.
//
// Endpoint (works keyless at low rate; a key raises limits via x-api-key):
//   Search: https://api.semanticscholar.org/graph/v1/paper/search
//             ?query=<terms>&limit=N&fields=title,abstract,year,authors,...
//   Single: https://api.semanticscholar.org/graph/v1/paper/<id>?fields=...
//   Docs:   https://api.semanticscholar.org/api-docs/graph
//
// `enabled()` requires a configured API key and live mode (so demos never hit
// the shared anonymous pool unexpectedly).
// =============================================================================

import type {
  EvidenceEngineConfig,
  EvidenceProvider,
  EvidenceQuery,
  EvidenceResult,
  PublicationType,
} from '../types';
import { normalizeResult } from '../normalize';

const S2_BASE = 'https://api.semanticscholar.org/graph/v1/paper';
const S2_FIELDS = 'title,abstract,year,authors,externalIds,url,publicationTypes';

interface S2Paper {
  paperId?: string;
  title?: string;
  abstract?: string;
  year?: number;
  url?: string;
  authors?: { name?: string }[];
  externalIds?: { DOI?: string; ArXiv?: string; PubMed?: string };
  publicationTypes?: string[];
}

function s2Type(types: string[] | undefined): PublicationType {
  if (!types || types.length === 0) return 'unknown';
  if (types.includes('Review')) return 'review';
  if (types.includes('Dataset')) return 'dataset';
  if (types.includes('JournalArticle') || types.includes('Conference')) {
    return 'peer-reviewed';
  }
  return 'unknown';
}

function mapPaper(p: S2Paper, now: string): EvidenceResult {
  return normalizeResult(
    {
      title: p.title ?? '',
      authors: (p.authors ?? []).map((a) => a.name ?? '').filter((n) => n.length > 0),
      year: p.year,
      abstract: p.abstract ?? undefined,
      url: p.url,
      doi: p.externalIds?.DOI,
      arxivId: p.externalIds?.ArXiv,
      pubmedId: p.externalIds?.PubMed,
      semanticScholarId: p.paperId,
      publicationType: s2Type(p.publicationTypes),
      raw: { provider: 'semanticScholar' },
    },
    'Semantic Scholar',
    now,
  );
}

export function createSemanticScholarProvider(
  cfg: EvidenceEngineConfig,
  now: string,
): EvidenceProvider {
  const key = cfg.semanticScholarApiKey;
  const headers: Record<string, string> = key ? { 'x-api-key': key } : {};
  return {
    name: 'Semantic Scholar',
    enabled: () => cfg.mode === 'live' && Boolean(key),
    async search(query: EvidenceQuery): Promise<EvidenceResult[]> {
      if (cfg.mode !== 'live' || !key) return [];
      try {
        const limit = query.limit ?? 10;
        const url = `${S2_BASE}/search?query=${encodeURIComponent(
          query.text,
        )}&limit=${limit}&fields=${S2_FIELDS}`;
        const res = await fetch(url, { headers });
        if (!res.ok) return [];
        const json = (await res.json()) as { data?: S2Paper[] };
        return (json.data ?? []).map((p) => mapPaper(p, now));
      } catch {
        return [];
      }
    },
    async lookupById(id: string): Promise<EvidenceResult | null> {
      if (cfg.mode !== 'live' || !key) return null;
      try {
        // Accept raw ids, DOIs ('DOI:10...'), or our 's2:' prefix.
        const cleaned = id.replace(/^s2:/i, '');
        const url = `${S2_BASE}/${encodeURIComponent(cleaned)}?fields=${S2_FIELDS}`;
        const res = await fetch(url, { headers });
        if (!res.ok) return null;
        const json = (await res.json()) as S2Paper;
        if (!json.title) return null;
        return mapPaper(json, now);
      } catch {
        return null;
      }
    },
  };
}
