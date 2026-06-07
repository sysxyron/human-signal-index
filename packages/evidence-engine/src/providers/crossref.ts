// =============================================================================
// providers/crossref.ts — Crossref REST API provider.
//
// Endpoint (no key; a mailto puts you in the faster "polite pool"):
//   https://api.crossref.org/works?query=<terms>&rows=N&mailto=<email>
//   Single work: https://api.crossref.org/works/<doi>
//   Docs: https://api.crossref.org/swagger-ui/index.html
//
// Returns JSON. We map the minimal fields we need. `enabled()` requires a
// configured mailto (Crossref etiquette) and live mode.
// =============================================================================

import type {
  EvidenceEngineConfig,
  EvidenceProvider,
  EvidenceQuery,
  EvidenceResult,
  PublicationType,
} from '../types';
import { normalizeResult } from '../normalize';

const CROSSREF_ENDPOINT = 'https://api.crossref.org/works';

interface CrossrefAuthor {
  given?: string;
  family?: string;
  name?: string;
}
interface CrossrefItem {
  DOI?: string;
  title?: string[];
  author?: CrossrefAuthor[];
  abstract?: string;
  URL?: string;
  type?: string;
  'published-print'?: { 'date-parts'?: number[][] };
  'published-online'?: { 'date-parts'?: number[][] };
  issued?: { 'date-parts'?: number[][] };
}

function crossrefType(type: string | undefined): PublicationType {
  switch (type) {
    case 'journal-article':
    case 'proceedings-article':
    case 'book-chapter':
      return 'peer-reviewed';
    case 'posted-content':
      return 'preprint';
    case 'review':
      return 'review';
    case 'dataset':
      return 'dataset';
    default:
      return 'unknown';
  }
}

function crossrefYear(item: CrossrefItem): number | undefined {
  const parts =
    item.issued?.['date-parts'] ??
    item['published-print']?.['date-parts'] ??
    item['published-online']?.['date-parts'];
  const year = parts?.[0]?.[0];
  return typeof year === 'number' ? year : undefined;
}

function authorName(a: CrossrefAuthor): string {
  if (a.name) return a.name;
  return [a.given, a.family].filter(Boolean).join(' ').trim();
}

function mapItem(item: CrossrefItem, now: string): EvidenceResult {
  return normalizeResult(
    {
      title: item.title?.[0] ?? '',
      authors: (item.author ?? []).map(authorName).filter((n) => n.length > 0),
      year: crossrefYear(item),
      // Crossref abstracts are JATS XML; strip tags for a plain summary.
      abstract: item.abstract?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      url: item.URL,
      doi: item.DOI,
      publicationType: crossrefType(item.type),
      raw: { provider: 'crossref', type: item.type },
    },
    'Crossref',
    now,
  );
}

export function createCrossrefProvider(
  cfg: EvidenceEngineConfig,
  now: string,
): EvidenceProvider {
  const mailto = cfg.crossrefMailto;
  return {
    name: 'Crossref',
    enabled: () => cfg.mode === 'live' && Boolean(mailto),
    async search(query: EvidenceQuery): Promise<EvidenceResult[]> {
      if (cfg.mode !== 'live' || !mailto) return [];
      try {
        const rows = query.limit ?? 10;
        const url = `${CROSSREF_ENDPOINT}?query=${encodeURIComponent(
          query.text,
        )}&rows=${rows}&mailto=${encodeURIComponent(mailto)}`;
        const res = await fetch(url);
        if (!res.ok) return [];
        const json = (await res.json()) as { message?: { items?: CrossrefItem[] } };
        const items = json.message?.items ?? [];
        return items.map((i) => mapItem(i, now));
      } catch {
        return [];
      }
    },
    async lookupById(id: string): Promise<EvidenceResult | null> {
      if (cfg.mode !== 'live' || !mailto) return null;
      try {
        const doi = id.replace(/^doi:/i, '');
        const url = `${CROSSREF_ENDPOINT}/${encodeURIComponent(doi)}?mailto=${encodeURIComponent(mailto)}`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const json = (await res.json()) as { message?: CrossrefItem };
        if (!json.message) return null;
        return mapItem(json.message, now);
      } catch {
        return null;
      }
    },
  };
}
