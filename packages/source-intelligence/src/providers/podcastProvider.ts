// =============================================================================
// @hsi/source-intelligence — Podcast PROVIDER (Phase 9; interface-first).
//
// capturePodcast fetches PUBLIC podcast metadata via the documented Podcast
// Index API (https://api.podcastindex.org/api/1.0) when apiKey + apiSecret are
// supplied. Its auth scheme is a per-request signature:
//   Authorization = sha1( apiKey + apiSecret + unixSeconds )   (hex)
//   X-Auth-Key    = apiKey
//   X-Auth-Date   = unixSeconds        (derived from injected `now`)
//   User-Agent    = deps.userAgent
// With no keys it returns 'provider_not_configured'. If a PUBLIC feed URL is
// supplied it FALLS BACK to the RSS provider (delegation). Never throws.
// method 'podcast-index' (api) or 'rss' (feed fallback).
// =============================================================================

import { sha256Hex } from '../internal/hash';
import { snippet } from '../internal/text';
import type { CapturedItem, ProviderDeps, ProviderResult } from './types';
import { captureRss } from './rssProvider';

const METHOD = 'podcast-index';
const API_BASE = 'https://api.podcastindex.org/api/1.0';

/** Input for a podcast capture. */
export interface PodcastInput {
  /** Podcast Index feed id (numeric) for the API path. */
  feedId?: number;
  /** A PUBLIC RSS feed URL — enables the RSS fallback even without keys. */
  feedUrl?: string;
}

interface PodcastIndexFeedResponse {
  feed?: {
    title?: string;
    description?: string;
    url?: string;
    link?: string;
    newestItemPublishTime?: number;
  };
}

/** SHA-1 hex of a string (Podcast Index signs with sha1). Async (WebCrypto). */
async function sha1Hex(input: string): Promise<string> {
  const cryptoObj = (globalThis as unknown as { crypto?: Crypto }).crypto;
  if (cryptoObj?.subtle) {
    const data = new TextEncoder().encode(input);
    const digest = await cryptoObj.subtle.digest('SHA-1', data);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // No WebCrypto — signing is impossible; caller treats this as not configured.
  return '';
}

/**
 * Capture PUBLIC podcast metadata. With Podcast Index keys it queries the
 * documented API; else, if a public feedUrl is supplied, delegates to captureRss
 * (returning the first episode). Without either → 'provider_not_configured'.
 */
export async function capturePodcast(
  input: PodcastInput,
  deps: ProviderDeps & { apiKey?: string; apiSecret?: string },
): Promise<ProviderResult<CapturedItem>> {
  const hasKeys = Boolean(deps.apiKey && deps.apiSecret);

  // API path (preferred when keys + a feedId are present).
  if (hasKeys && input.feedId !== undefined) {
    const fetchImpl = deps.fetchImpl;
    if (!fetchImpl) {
      return { ok: false, reason: 'fetch_error', message: 'network not enabled (inject deps.fetchImpl)' };
    }
    const unixSeconds = Math.floor(Date.parse(deps.now) / 1000);
    const authToken = await sha1Hex(`${deps.apiKey}${deps.apiSecret}${unixSeconds}`);
    if (!authToken) {
      return { ok: false, reason: 'provider_not_configured', message: 'WebCrypto SHA-1 unavailable for Podcast Index signing' };
    }
    const url = `${API_BASE}/podcasts/byfeedid?id=${encodeURIComponent(String(input.feedId))}`;
    const timeoutMs = deps.timeoutMs ?? 12000;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
    try {
      const res = await fetchImpl(url, {
        headers: {
          'user-agent': deps.userAgent ?? 'HumanSignalIndexBot/0.1',
          'X-Auth-Key': deps.apiKey as string,
          'X-Auth-Date': String(unixSeconds),
          Authorization: authToken,
        },
        signal: controller?.signal,
      });
      if (!res.ok) return { ok: false, reason: 'fetch_error', message: `http ${res.status}` };
      const json = (await res.json()) as PodcastIndexFeedResponse;
      const feed = json.feed;
      if (!feed?.title) return { ok: false, reason: 'parse_error', message: 'no public feed returned' };
      const bodyText = [feed.title, feed.description].filter(Boolean).join('\n');
      const item: CapturedItem = {
        title: feed.title,
        url: feed.link ?? feed.url,
        canonicalUrl: feed.url,
        publishedAt: feed.newestItemPublishTime
          ? new Date(feed.newestItemPublishTime * 1000).toISOString()
          : undefined,
        summary: feed.description ? snippet(feed.description, 280) : undefined,
        bodyText,
        contentHash: await sha256Hex(bodyText),
      };
      return { ok: true, method: METHOD, data: item };
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        return { ok: false, reason: 'timeout', message: `request timed out after ${timeoutMs}ms` };
      }
      return { ok: false, reason: 'fetch_error', message: e instanceof Error ? e.message : String(e) };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // RSS fallback when a PUBLIC feed URL is supplied (no keys required).
  if (input.feedUrl) {
    const rss = await captureRss(input.feedUrl, deps);
    if (!rss.ok) return rss;
    const first = rss.data[0];
    if (!first) return { ok: false, reason: 'parse_error', message: 'public feed had no items' };
    return { ok: true, method: rss.method, data: first };
  }

  return {
    ok: false,
    reason: 'provider_not_configured',
    message: 'Podcast Index keys (apiKey + apiSecret) or a public feedUrl required.',
  };
}
