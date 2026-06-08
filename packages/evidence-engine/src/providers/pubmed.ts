// =============================================================================
// providers/pubmed.ts — NCBI PubMed (E-utilities) provider.
//
// Two-step, no key required (but `tool` + `email` are requested etiquette):
//   1. esearch: https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi
//        ?db=pubmed&term=<terms>&retmax=N&retmode=json&email=<email>
//   2. efetch:  https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi
//        ?db=pubmed&id=<csv ids>&retmode=xml&email=<email>
//   Docs: https://www.ncbi.nlm.nih.gov/books/NBK25501/
//
// `enabled()` requires a configured contact email and live mode.
// =============================================================================

import type {
  EvidenceEngineConfig,
  EvidenceProvider,
  EvidenceQuery,
  EvidenceResult,
} from '../types';
import { normalizeResult } from '../normalize';
import { fetchJson, fetchText } from './http';
import { httpOptionsFor, type ProviderDeps } from './deps';

const ESEARCH = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi';
const EFETCH = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi';

function xmlTag(chunk: string, name: string): string | undefined {
  const m = chunk.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  if (!m) return undefined;
  return m[1]
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseEfetch(xml: string, now: string): EvidenceResult[] {
  const articles = xml.split(/<PubmedArticle>/i).slice(1);
  const out: EvidenceResult[] = [];
  for (const raw of articles) {
    const art = raw.split(/<\/PubmedArticle>/i)[0] ?? raw;
    const title = xmlTag(art, 'ArticleTitle');
    if (!title) continue;
    const pmid = xmlTag(art, 'PMID');
    const yearStr = xmlTag(art, 'Year');
    const year = yearStr ? Number(yearStr) : undefined;
    const abstract = xmlTag(art, 'AbstractText');
    const authors = [...art.matchAll(/<Author[^>]*>[\s\S]*?<\/Author>/gi)]
      .map((m) => {
        const last = xmlTag(m[0], 'LastName');
        const fore = xmlTag(m[0], 'ForeName');
        return [fore, last].filter(Boolean).join(' ').trim();
      })
      .filter((n) => n.length > 0);
    const doi = art.match(/<ArticleId IdType="doi">([\s\S]*?)<\/ArticleId>/i)?.[1]?.trim();
    out.push(
      normalizeResult(
        {
          title,
          authors,
          year: Number.isFinite(year) ? year : undefined,
          abstract,
          pubmedId: pmid,
          doi,
          url: pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : undefined,
          publicationType: 'peer-reviewed',
          raw: { provider: 'pubmed' },
        },
        'PubMed',
        now,
      ),
    );
  }
  return out;
}

export function createPubmedProvider(
  cfg: EvidenceEngineConfig,
  now: string,
  deps?: ProviderDeps,
): EvidenceProvider {
  const email = cfg.pubmedEmail;
  const name = 'PubMed';
  const fetchByIds = async (ids: string[]): Promise<EvidenceResult[]> => {
    if (ids.length === 0) return [];
    const url = `${EFETCH}?db=pubmed&id=${ids.join(',')}&retmode=xml&email=${encodeURIComponent(
      email ?? '',
    )}`;
    const res = await fetchText(url, httpOptionsFor(deps, name, now));
    if (!res.ok) return [];
    return parseEfetch(res.value, now);
  };
  return {
    name,
    enabled: () => cfg.mode === 'live' && Boolean(email),
    async search(query: EvidenceQuery): Promise<EvidenceResult[]> {
      if (cfg.mode !== 'live' || !email) return [];
      const retmax = query.limit ?? 10;
      const url = `${ESEARCH}?db=pubmed&term=${encodeURIComponent(
        query.text,
      )}&retmax=${retmax}&retmode=json&email=${encodeURIComponent(email)}`;
      const res = await fetchJson<{ esearchresult?: { idlist?: string[] } }>(
        url,
        httpOptionsFor(deps, name, now),
      );
      if (!res.ok) return [];
      const ids = res.value.esearchresult?.idlist ?? [];
      return await fetchByIds(ids);
    },
    async lookupById(id: string): Promise<EvidenceResult | null> {
      if (cfg.mode !== 'live' || !email) return null;
      const pmid = id.replace(/^pmid:/i, '');
      const results = await fetchByIds([pmid]);
      return results[0] ?? null;
    },
  };
}
