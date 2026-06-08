// =============================================================================
// @hsi/source-intelligence — YouTube PROVIDER (Phase 9; interface-first).
//
// captureYouTube fetches PUBLIC video/channel metadata via the documented
// YouTube Data API v3 (https://www.googleapis.com/youtube/v3) when an apiKey is
// supplied. With no key it returns 'provider_not_configured' — it NEVER scrapes
// the watch page (which lives behind consent walls / interstitials) and NEVER
// bypasses authentication. method 'youtube-data-v3'.
//
// We parse only minimal PUBLIC fields (title, description, publishedAt, channel)
// that the API returns for public resources. PUBLIC information only.
// =============================================================================

import { sha256Hex } from '../internal/hash';
import { snippet } from '../internal/text';
import type { CapturedItem, ProviderDeps, ProviderResult } from './types';

const METHOD = 'youtube-data-v3';
const API_BASE = 'https://www.googleapis.com/youtube/v3';

/** Input for a YouTube capture: a public video id or channel id. */
export interface YouTubeInput {
  /** A public video id (preferred). */
  videoId?: string;
  /** A public channel id (used when no videoId). */
  channelId?: string;
}

interface YouTubeListResponse {
  items?: {
    id?: string;
    snippet?: {
      title?: string;
      description?: string;
      publishedAt?: string;
      channelTitle?: string;
    };
  }[];
}

/**
 * Capture PUBLIC YouTube metadata via the Data API v3. Requires an apiKey;
 * without one returns 'provider_not_configured'. Never throws; never scrapes.
 */
export async function captureYouTube(
  input: YouTubeInput,
  deps: ProviderDeps & { apiKey?: string },
): Promise<ProviderResult<CapturedItem>> {
  if (!deps.apiKey) {
    return {
      ok: false,
      reason: 'provider_not_configured',
      message: 'YouTube Data API key not provided (set deps.apiKey). We never scrape the watch page.',
    };
  }
  const fetchImpl = deps.fetchImpl;
  if (!fetchImpl) {
    return { ok: false, reason: 'fetch_error', message: 'network not enabled (inject deps.fetchImpl)' };
  }
  if (!input.videoId && !input.channelId) {
    return { ok: false, reason: 'parse_error', message: 'provide a public videoId or channelId' };
  }

  const url = input.videoId
    ? `${API_BASE}/videos?part=snippet&id=${encodeURIComponent(input.videoId)}&key=${encodeURIComponent(deps.apiKey)}`
    : `${API_BASE}/channels?part=snippet&id=${encodeURIComponent(input.channelId ?? '')}&key=${encodeURIComponent(deps.apiKey)}`;

  const timeoutMs = deps.timeoutMs ?? 12000;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
  try {
    const res = await fetchImpl(url, {
      headers: { 'user-agent': deps.userAgent ?? 'HumanSignalIndexBot/0.1' },
      signal: controller?.signal,
    });
    if (!res.ok) return { ok: false, reason: 'fetch_error', message: `http ${res.status}` };
    const json = (await res.json()) as YouTubeListResponse;
    const first = json.items?.[0];
    if (!first?.snippet) {
      return { ok: false, reason: 'parse_error', message: 'no public item returned' };
    }
    const s = first.snippet;
    const title = s.title ?? input.videoId ?? input.channelId ?? 'youtube';
    const bodyText = [title, s.description].filter(Boolean).join('\n');
    const canonicalUrl = input.videoId
      ? `https://www.youtube.com/watch?v=${input.videoId}`
      : `https://www.youtube.com/channel/${input.channelId}`;
    const item: CapturedItem = {
      title,
      url: canonicalUrl,
      canonicalUrl,
      publishedAt: s.publishedAt,
      summary: s.description ? snippet(s.description, 280) : undefined,
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
