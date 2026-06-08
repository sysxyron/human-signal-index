// =============================================================================
// @hsi/source-intelligence — RSS/Atom capture provider (PUBLIC feeds only).
//
// Parses RSS 2.0 / Atom with a dependency-free regex parser (`parseRssFeed`).
// Capture fetches a PUBLIC feed via injected/gated fetch and returns a
// CaptureResult whose doc.bodyText is the concatenated item text and whose
// doc.raw carries the parsed RssItem[]. Enforces the public-only policy.
// =============================================================================

import { fnv1a, sha256Hex } from '../internal/hash';
import { htmlToText, normalizeWhitespace } from '../internal/text';
import { CapturePolicyError, assertPublicCapturePolicy } from '../policy';
import type { CaptureProvider, CaptureResult, RssItem } from '../types';
import { type CaptureDeps, resolveFetch } from './fetchDeps';

const PROVIDER = 'rss';

/** Extract a tag's text from a feed-item block (handles CDATA). */
function pick(block: string, tag: string): string | undefined {
  const cdata = block.match(
    new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, 'i'),
  );
  if (cdata) return normalizeWhitespace(cdata[1]);
  const plain = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return plain ? normalizeWhitespace(htmlToText(plain[1])) : undefined;
}

function pickLink(block: string): string | undefined {
  const href = block.match(/<link[^>]*href=["']([^"']+)["']/i);
  if (href) return href[1];
  return pick(block, 'link');
}

/**
 * Parse RSS/Atom XML into normalized RssItem[]. Pure & synchronous. Each item
 * gets a stable contentHash (FNV-1a over title+summary) so the parser stays
 * synchronous; full sha-256 hashes are used elsewhere for chain-of-custody.
 */
export function parseRssFeed(xml: string): RssItem[] {
  const out: RssItem[] = [];
  const blocks = xml.match(/<(item|entry)[\s\S]*?<\/(item|entry)>/gi) ?? [];
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    const title = pick(block, 'title') ?? '(untitled)';
    const link = pickLink(block);
    const summary =
      pick(block, 'description') ?? pick(block, 'summary') ?? pick(block, 'content');
    const publishedAt =
      pick(block, 'pubDate') ?? pick(block, 'updated') ?? pick(block, 'published');
    const guid = pick(block, 'guid') ?? pick(block, 'id');
    const id = guid ?? link ?? `item-${i}-${fnv1a(title)}`;
    out.push({
      id,
      title,
      link,
      summary,
      publishedAt,
      contentHash: `fnv1a-${fnv1a(`${title}\n${summary ?? ''}`)}`,
    });
  }
  return out;
}

/** Build an RSS CaptureProvider. */
export function rssProvider(deps?: CaptureDeps): CaptureProvider {
  return {
    name: PROVIDER,
    sourceType: 'rss',
    enabled: () => true,
    async capture(input): Promise<CaptureResult> {
      const { url, now } = input;
      if (!url) return { ok: false, provider: PROVIDER, error: 'no url provided' };
      try {
        assertPublicCapturePolicy(url);
      } catch (e) {
        const msg = e instanceof CapturePolicyError ? e.message : String(e);
        return { ok: false, provider: PROVIDER, error: msg };
      }
      const doFetch = resolveFetch(deps);
      if (!doFetch) {
        return {
          ok: false,
          provider: PROVIDER,
          error: 'network not enabled (inject fetchImpl or set allowNetwork)',
        };
      }
      try {
        const res = await doFetch(url);
        if (!res.ok) {
          return { ok: false, provider: PROVIDER, error: `fetch failed ${res.status}` };
        }
        const xml = await res.text();
        const items = parseRssFeed(xml);
        const bodyText = items
          .map((it) => [it.title, it.summary].filter(Boolean).join('\n'))
          .join('\n\n');
        return {
          ok: true,
          provider: PROVIDER,
          doc: {
            url,
            title: items[0]?.title,
            bodyText,
            capturedAt: now,
            contentHash: await sha256Hex(bodyText),
            raw: items,
          },
        };
      } catch (e) {
        return { ok: false, provider: PROVIDER, error: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}
