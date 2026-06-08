// =============================================================================
// providers/arxiv.ts — arXiv Atom API provider.
//
// Endpoint (no key required):
//   http://export.arxiv.org/api/query?search_query=all:<terms>&max_results=N
//   Docs: https://info.arxiv.org/help/api/user-manual.html
//
// arXiv returns an Atom XML feed. We parse only the minimal fields we need with
// small regexes (zero XML dependency). `enabled()` is gated to live mode; we are
// polite and never call the network unless explicitly turned on.
// =============================================================================

import type {
  EvidenceEngineConfig,
  EvidenceProvider,
  EvidenceQuery,
  EvidenceResult,
} from '../types';
import { normalizeResult } from '../normalize';
import { fetchText } from './http';
import { httpOptionsFor, type ProviderDeps } from './deps';

const ARXIV_ENDPOINT = 'http://export.arxiv.org/api/query';

/** Extract the inner text of the first <tag>…</tag> within a chunk. */
function tag(chunk: string, name: string): string | undefined {
  const m = chunk.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decodeXml(m[1].trim()) : undefined;
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parseAtom(xml: string, now: string): EvidenceResult[] {
  const entries = xml.split(/<entry>/i).slice(1);
  const out: EvidenceResult[] = [];
  for (const raw of entries) {
    const entry = raw.split(/<\/entry>/i)[0] ?? raw;
    const title = tag(entry, 'title');
    if (!title) continue;
    const idUrl = tag(entry, 'id');
    const arxivId = idUrl?.match(/abs\/([^\s<]+)$/i)?.[1];
    const published = tag(entry, 'published');
    const year = published ? Number(published.slice(0, 4)) : undefined;
    const authors = [...entry.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/gi)].map(
      (m) => decodeXml(m[1]),
    );
    const doiMatch = entry.match(/<arxiv:doi[^>]*>([\s\S]*?)<\/arxiv:doi>/i);
    out.push(
      normalizeResult(
        {
          title,
          authors,
          year: Number.isFinite(year) ? year : undefined,
          abstract: tag(entry, 'summary'),
          url: idUrl,
          arxivId,
          doi: doiMatch ? doiMatch[1].trim() : undefined,
          publicationType: 'preprint',
          raw: { provider: 'arxiv' },
        },
        'arXiv',
        now,
      ),
    );
  }
  return out;
}

export function createArxivProvider(
  cfg: EvidenceEngineConfig,
  now: string,
  deps?: ProviderDeps,
): EvidenceProvider {
  const name = 'arXiv';
  return {
    name,
    // arXiv needs no key — but we still only call the network in live mode.
    enabled: () => cfg.mode === 'live',
    async search(query: EvidenceQuery): Promise<EvidenceResult[]> {
      if (cfg.mode !== 'live') return [];
      const limit = query.limit ?? 10;
      const url = `${ARXIV_ENDPOINT}?search_query=${encodeURIComponent(
        `all:${query.text}`,
      )}&max_results=${limit}`;
      const res = await fetchText(url, httpOptionsFor(deps, name, now));
      if (!res.ok) return []; // never throw, never fabricate
      return parseAtom(res.value, now);
    },
    async lookupById(id: string): Promise<EvidenceResult | null> {
      if (cfg.mode !== 'live') return null;
      const url = `${ARXIV_ENDPOINT}?id_list=${encodeURIComponent(id)}&max_results=1`;
      const res = await fetchText(url, httpOptionsFor(deps, name, now));
      if (!res.ok) return null;
      return parseAtom(res.value, now)[0] ?? null;
    },
  };
}
