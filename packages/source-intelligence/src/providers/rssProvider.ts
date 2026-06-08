// =============================================================================
// @hsi/source-intelligence — RSS/Atom PROVIDER (Phase 9; PUBLIC feeds only).
//
// captureRss(url, deps) fetches a PUBLIC feed through the hardened http wrapper,
// parses it with the existing dependency-free parser (`parseRssFeed`), and
// normalizes each entry into a CapturedItem (title/url/date/summary/hash). Items
// are de-duped by canonical URL (then by content hash). NEVER throws. method 'rss'.
// =============================================================================

import { sha256Hex } from '../internal/hash';
import { parseRssFeed } from '../capture/rssProvider';
import type { CapturedItem, ProviderDeps, ProviderResult } from './types';
import { fetchPublicText } from './http';

const METHOD = 'rss';

/**
 * Capture a PUBLIC RSS/Atom feed into normalized CapturedItem[]. Reuses the
 * Phase-7 `parseRssFeed`. Deterministic given its inputs; never throws.
 */
export async function captureRss(
  url: string,
  deps: ProviderDeps,
): Promise<ProviderResult<CapturedItem[]>> {
  const fetched = await fetchPublicText(url, deps);
  if (!fetched.ok) return fetched;

  let items;
  try {
    items = parseRssFeed(fetched.data.text);
  } catch (e) {
    return { ok: false, reason: 'parse_error', message: e instanceof Error ? e.message : String(e) };
  }

  const out: CapturedItem[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const canonicalUrl = it.link;
    // De-dupe by canonical URL when present, else by the parser's content hash.
    const dedupeKey = (canonicalUrl ?? '').toLowerCase() || `hash:${it.contentHash}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const bodyText = [it.title, it.summary].filter(Boolean).join('\n');
    out.push({
      title: it.title,
      url: it.link,
      canonicalUrl,
      publishedAt: it.publishedAt,
      summary: it.summary,
      bodyText,
      // Promote the synchronous fnv1a item hash to a sha-256 over the body.
      contentHash: await sha256Hex(`${it.title}\n${it.summary ?? ''}`),
    });
  }

  return { ok: true, method: METHOD, data: out };
}
