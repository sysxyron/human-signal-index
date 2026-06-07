// =============================================================================
// @hsi/source-connectors — RSS/Atom connector (PUBLIC feeds only).
// Uses 'rss-parser' when installed (dynamic import → graceful), otherwise a
// dependency-free regex parser sufficient for capture. Output is a normalized
// CapturedSource with a content hash + caller-supplied capture timestamp.
// =============================================================================

import { sha256Hex } from './hash';
import { assertPublicCapturePolicy } from './policy';
import type { CapturedSource, FeedItem, RssCaptureOptions } from './types';
import { normalizeSourceUrl } from './url';

/** Inject fetch so the connector is testable / runtime-agnostic. */
export type FetchText = (url: string) => Promise<string>;

const defaultFetchText: FetchText = async (url) => {
  const res = await fetch(url, { headers: { 'user-agent': 'HSI-PublicCapture/1.0 (+public-only)' } });
  if (!res.ok) throw new Error(`RSS fetch failed ${res.status} for ${url}`);
  return res.text();
};

/** Try rss-parser if present; returns null when unavailable. */
async function parseWithRssParser(xml: string): Promise<FeedItem[] | null> {
  try {
    // @ts-ignore — optional peer dep; may not be installed.
    const mod = await import('rss-parser');
    const Parser = (mod.default ?? mod) as new () => {
      parseString: (s: string) => Promise<{ items?: any[] }>;
    };
    const parser = new Parser();
    const feed = await parser.parseString(xml);
    return (feed.items ?? []).map((i) => ({
      title: i.title,
      link: i.link,
      content: i.contentSnippet ?? i.content ?? i.summary,
      isoDate: i.isoDate,
      guid: i.guid ?? i.id,
    }));
  } catch {
    return null;
  }
}

/** Dependency-free fallback parser for RSS 2.0 / Atom. */
function parseFallback(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  const blocks = xml.match(/<(item|entry)[\s\S]*?<\/(item|entry)>/gi) ?? [];
  const pick = (block: string, tag: string) => {
    const m =
      block.match(new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, 'i')) ||
      block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
    return m ? m[1].trim() : undefined;
  };
  const pickLink = (block: string) => {
    const href = block.match(/<link[^>]*href=["']([^"']+)["']/i);
    if (href) return href[1];
    return pick(block, 'link');
  };
  for (const block of blocks) {
    items.push({
      title: pick(block, 'title'),
      link: pickLink(block),
      content: pick(block, 'description') ?? pick(block, 'content') ?? pick(block, 'summary'),
      isoDate: pick(block, 'pubDate') ?? pick(block, 'updated') ?? pick(block, 'published'),
      guid: pick(block, 'guid') ?? pick(block, 'id'),
    });
  }
  return items;
}

/** Low-level: parse RSS/Atom xml into normalized items. */
export async function parseRssXml(xml: string): Promise<FeedItem[]> {
  const viaLib = await parseWithRssParser(xml);
  return viaLib ?? parseFallback(xml);
}

/**
 * Capture a public RSS/Atom feed into a normalized CapturedSource.
 * Enforces the public-only policy before fetching.
 */
export async function captureRssFeed(
  url: string,
  options: RssCaptureOptions,
  fetchText: FetchText = defaultFetchText,
): Promise<CapturedSource> {
  assertPublicCapturePolicy(url);
  const normalized = normalizeSourceUrl(url);
  const xml = await fetchText(normalized);
  const items = (await parseRssXml(xml)).slice(0, options.maxItems ?? 50);

  const content = items
    .map((i) => [i.title, i.content].filter(Boolean).join('\n'))
    .filter(Boolean)
    .join('\n\n');

  return {
    connector: 'rss',
    url: normalized,
    title: items[0]?.title,
    content,
    raw: xml,
    hashDigest: await sha256Hex(content),
    capturedAt: options.capturedAt,
    metadata: { itemCount: items.length, items },
  };
}

/**
 * Backward-compatible thin helper (replaces the old stub). Returns raw xml +
 * the captured url. Prefer captureRssFeed for normalized provenance output.
 */
export async function parseRssFeed(url: string, fetchText: FetchText = defaultFetchText) {
  assertPublicCapturePolicy(url);
  const normalized = normalizeSourceUrl(url);
  const xml = await fetchText(normalized);
  return { url: normalized, raw: xml };
}
