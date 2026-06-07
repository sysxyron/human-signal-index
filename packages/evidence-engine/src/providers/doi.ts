// =============================================================================
// providers/doi.ts — DOI content-negotiation provider (resolve a DOI to metadata).
//
// Endpoint (no key): https://doi.org/<doi> with
//   Accept: application/vnd.citationstyle.csl+json
//   Docs:   https://citation.crosscite.org/docs.html
//
// This is a lookup-first provider — DOIs are identifiers, not search terms, so
// `search()` is intentionally a no-op (returns []). `enabled()` is live-mode.
// =============================================================================

import type {
  EvidenceEngineConfig,
  EvidenceProvider,
  EvidenceResult,
  PublicationType,
} from '../types';
import { normalizeResult } from '../normalize';

interface CslAuthor {
  given?: string;
  family?: string;
  literal?: string;
}
interface CslJson {
  DOI?: string;
  title?: string;
  author?: CslAuthor[];
  abstract?: string;
  URL?: string;
  type?: string;
  issued?: { 'date-parts'?: number[][] };
}

function cslType(type: string | undefined): PublicationType {
  switch (type) {
    case 'journal-article':
    case 'book':
    case 'chapter':
      return 'peer-reviewed';
    case 'posted-content':
      return 'preprint';
    case 'dataset':
      return 'dataset';
    default:
      return 'unknown';
  }
}

function authorName(a: CslAuthor): string {
  if (a.literal) return a.literal;
  return [a.given, a.family].filter(Boolean).join(' ').trim();
}

export function createDoiProvider(
  cfg: EvidenceEngineConfig,
  now: string,
): EvidenceProvider {
  return {
    name: 'DOI',
    enabled: () => cfg.mode === 'live',
    // DOIs are not searchable terms — searching is a deliberate no-op.
    async search(): Promise<EvidenceResult[]> {
      return [];
    },
    async lookupById(id: string): Promise<EvidenceResult | null> {
      if (cfg.mode !== 'live') return null;
      try {
        const doi = id.replace(/^doi:/i, '').replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
        const res = await fetch(`https://doi.org/${doi}`, {
          headers: { Accept: 'application/vnd.citationstyle.csl+json' },
        });
        if (!res.ok) return null;
        const json = (await res.json()) as CslJson;
        if (!json.title) return null;
        return normalizeResult(
          {
            title: json.title,
            authors: (json.author ?? []).map(authorName).filter((n) => n.length > 0),
            year: json.issued?.['date-parts']?.[0]?.[0],
            abstract: json.abstract?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
            url: json.URL,
            doi: json.DOI,
            publicationType: cslType(json.type),
            raw: { provider: 'doi' },
          },
          'DOI',
          now,
        );
      } catch {
        return null;
      }
    },
  };
}
