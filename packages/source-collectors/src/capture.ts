// =============================================================================
// Capture engines — fetch injected (testable offline). Feed-backed captures reuse
// the @hsi/source-connectors RSS/Atom parser; reddit adds author extraction;
// watchlist captures readable page text. captureForType routes by source type and
// createSignalFromCapture turns a capture into a signal draft. PUBLIC-only policy.
// =============================================================================

// Deep submodule imports (NOT the barrel) so the Playwright-backed public-page
// connector never enters a web/client bundle that only needs hashing/RSS.
import { parseRssXml, type FetchText } from '@hsi/source-connectors/src/rssConnector';
import type { FeedItem } from '@hsi/source-connectors/src/types';
import { sha256Hex } from '@hsi/source-connectors/src/hash';
import { normalizeSourceUrl } from '@hsi/source-connectors/src/url';
import { assertPublicCapturePolicy } from '@hsi/source-connectors/src/policy';
import { captureWatchlist } from './watchlist';
import { signalTypeForSource } from './routing';
import type { CapturedItem, CollectorCapture, CollectorSourceType, SignalDraftFromCapture } from './types';

export interface CaptureOptions {
  capturedAt: string;
  maxItems?: number;
  fetchText: FetchText;
}

function itemsToContent(items: CapturedItem[]): string {
  return items.map((i) => [i.title, i.content].filter(Boolean).join('\n')).filter(Boolean).join('\n\n');
}

function feedItemToCaptured(i: FeedItem): CapturedItem {
  return { title: (i.title ?? '').trim() || 'Untitled', url: i.link, content: (i.content ?? '').trim(), publishedAt: i.isoDate, metadata: i.guid ? { guid: i.guid } : undefined };
}

/** Generic feed capture (rss/news/research/government/intelligence_feed). */
async function captureFeed(sourceType: CollectorSourceType, url: string, opts: CaptureOptions): Promise<CollectorCapture> {
  assertPublicCapturePolicy(url);
  const normalized = normalizeSourceUrl(url);
  const xml = await opts.fetchText(normalized);
  const items = (await parseRssXml(xml)).slice(0, opts.maxItems ?? 50).map(feedItemToCaptured);
  const content = itemsToContent(items);
  return {
    sourceType, connector: 'rss', url: normalized, items, content,
    hashDigest: await sha256Hex(content), capturedAt: opts.capturedAt, raw: xml,
    metadata: { itemCount: items.length },
  };
}

export const captureRss = (url: string, opts: CaptureOptions) => captureFeed('rss', url, opts);
export const captureNews = (url: string, opts: CaptureOptions) => captureFeed('news', url, opts);
export const captureResearch = (url: string, opts: CaptureOptions) => captureFeed('research', url, opts);
export const captureGovernment = (url: string, opts: CaptureOptions) => captureFeed('government', url, opts);

/** Extract Atom <entry> author/title/link/updated from reddit .rss (best-effort). */
function redditEntries(xml: string): CapturedItem[] {
  const blocks = xml.match(/<entry[\s\S]*?<\/entry>/gi) ?? [];
  const pick = (b: string, tag: string) => {
    const m = b.match(new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, 'i')) || b.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
    return m ? m[1].trim() : undefined;
  };
  return blocks.map((b) => {
    const href = b.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1];
    const authorBlock = b.match(/<author>([\s\S]*?)<\/author>/i)?.[1] ?? '';
    const author = authorBlock.match(/<name>([\s\S]*?)<\/name>/i)?.[1]?.trim();
    return { title: pick(b, 'title') ?? 'Untitled', url: href, content: pick(b, 'content') ?? '', author, publishedAt: pick(b, 'updated') ?? pick(b, 'published') };
  });
}

/** Reddit capture: subreddit .rss (Atom) → posts with author/title/url/timestamp. */
export async function captureReddit(url: string, opts: CaptureOptions): Promise<CollectorCapture> {
  assertPublicCapturePolicy(url);
  const normalized = normalizeSourceUrl(url);
  const xml = await opts.fetchText(normalized);
  let items = redditEntries(xml).slice(0, opts.maxItems ?? 50);
  if (items.length === 0) items = (await parseRssXml(xml)).slice(0, opts.maxItems ?? 50).map(feedItemToCaptured);
  const content = itemsToContent(items);
  return {
    sourceType: 'reddit', connector: 'rss', url: normalized, items, content,
    hashDigest: await sha256Hex(content), capturedAt: opts.capturedAt, raw: xml,
    metadata: { itemCount: items.length },
  };
}

/** Watchlist capture as a CollectorCapture (single page-text item). */
export async function captureWatchlistSource(url: string, opts: CaptureOptions): Promise<CollectorCapture> {
  const snap = await captureWatchlist(url, opts.capturedAt, opts.fetchText);
  const item: CapturedItem = { title: 'Page snapshot', url: snap.url, content: snap.text };
  return {
    sourceType: 'watchlist', connector: 'public_page', url: snap.url, items: [item], content: snap.text,
    hashDigest: snap.contentHash, capturedAt: snap.capturedAt, metadata: { length: snap.text.length },
  };
}

/** Route a capture by source type. Throws for foundation-only types. */
export async function captureForType(sourceType: CollectorSourceType, url: string, opts: CaptureOptions): Promise<CollectorCapture> {
  switch (sourceType) {
    case 'reddit': return captureReddit(url, opts);
    case 'watchlist': return captureWatchlistSource(url, opts);
    case 'rss': case 'news': case 'research': case 'government': case 'podcast': case 'youtube': case 'intelligence_feed':
      return captureFeed(sourceType, url, opts);
    case 'website': case 'forum': case 'social': case 'archive': case 'tiktok':
      return captureWatchlistSource(url, { ...opts });
    default:
      throw new Error(`Source type "${sourceType}" does not support automated capture.`);
  }
}

/** Turn a capture into a signal draft (status 'new'; never auto-published). PURE-ish. */
export function createSignalFromCapture(sourceId: string, capture: CollectorCapture): SignalDraftFromCapture {
  const first = capture.items[0];
  const title = (first?.title ?? `${capture.sourceType} update`).slice(0, 280);
  const summary = (first?.content ?? capture.content).slice(0, 600) || undefined;
  return {
    source_id: sourceId,
    title,
    summary,
    raw_content: capture.content || undefined,
    content_hash: capture.hashDigest,
    signal_type: signalTypeForSource(capture.sourceType),
    captured_at: capture.capturedAt,
    status: 'new',
  };
}
