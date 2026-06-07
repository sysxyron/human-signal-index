// =============================================================================
// providers/webFallback.ts — generic, low-reliability web fallback.
//
// A placeholder for a generic web/search backend (e.g. a search API the host
// app wires in later). It is DISABLED by default and produces only low-
// reliability ('web') results when turned on. There is no built-in public web
// search endpoint, so without a host-provided fetcher this returns [] — it never
// fabricates sources.
// =============================================================================

import type {
  EvidenceEngineConfig,
  EvidenceProvider,
  EvidenceQuery,
  EvidenceResult,
} from '../types';

/**
 * Optional host-provided web fetcher. The app can inject a function that hits
 * its own search backend and returns raw hits; we keep reliability low ('web').
 */
export type WebFetcher = (
  query: EvidenceQuery,
) => Promise<{ title: string; url: string; snippet?: string }[]>;

import { normalizeResult } from '../normalize';

export function createWebFallbackProvider(
  cfg: EvidenceEngineConfig,
  now: string,
  fetcher?: WebFetcher,
): EvidenceProvider {
  return {
    name: 'Web',
    // Requires both live mode AND a host-provided fetcher — off by default.
    enabled: () => cfg.mode === 'live' && Boolean(fetcher),
    async search(query: EvidenceQuery): Promise<EvidenceResult[]> {
      if (cfg.mode !== 'live' || !fetcher) return [];
      try {
        const hits = await fetcher(query);
        return hits.map((h) =>
          normalizeResult(
            {
              title: h.title,
              authors: [],
              abstract: h.snippet,
              url: h.url,
              publicationType: 'web',
              raw: { provider: 'web' },
            },
            'Web',
            now,
          ),
        );
      } catch {
        return [];
      }
    },
    async lookupById(): Promise<EvidenceResult | null> {
      return null;
    },
  };
}
