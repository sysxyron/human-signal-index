// =============================================================================
// @hsi/source-intelligence — PROVIDER namespace barrel + router (Phase 9).
//
// createProviders(deps) binds a deps-carrying provider set. captureViaProvider
// routes by sourceType to the right provider. makeProviderRunLog builds the
// observability record EVERY provider attempt should emit. All public-safe and
// interface-first; ethics are inherited from providers/types.ts (PUBLIC only).
// =============================================================================

import type {
  CapturedItem,
  ProviderDeps,
  ProviderFailureReason,
  ProviderResult,
  ProviderRunLog,
} from './types';
import { captureRss } from './rssProvider';
import { captureWebsite } from './websiteProvider';
import { captureYouTube, type YouTubeInput } from './youtubeProvider';
import { capturePodcast, type PodcastInput } from './podcastProvider';
import { captureForum, type ForumInput } from './forumProvider';

export * from './types';
export {
  fetchPublicText,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_BYTES,
  DEFAULT_USER_AGENT,
  type HttpText,
} from './http';
export { captureRss } from './rssProvider';
export { captureWebsite, isChallengePage } from './websiteProvider';
export { captureYouTube, type YouTubeInput } from './youtubeProvider';
export { capturePodcast, type PodcastInput } from './podcastProvider';
export { captureForum, type ForumInput } from './forumProvider';

/** Keys a host may pass for the keyed providers (youtube/podcast). */
export interface ProviderCredentials {
  youtubeApiKey?: string;
  podcastApiKey?: string;
  podcastApiSecret?: string;
}

/** A deps-bound provider set — convenient when capturing many sources. */
export interface BoundProviders {
  rss(url: string): Promise<ProviderResult<CapturedItem[]>>;
  website(url: string): Promise<ProviderResult<CapturedItem>>;
  youtube(input: YouTubeInput): Promise<ProviderResult<CapturedItem>>;
  podcast(input: PodcastInput): Promise<ProviderResult<CapturedItem>>;
  forum(input: ForumInput): Promise<ProviderResult<CapturedItem[]>>;
}

/**
 * Bind a provider set to shared deps (+ optional credentials). Each method just
 * forwards into the standalone capture function — the binding only saves the
 * caller from threading deps everywhere. Pure construction (no I/O at call time).
 */
export function createProviders(
  deps: ProviderDeps,
  creds: ProviderCredentials = {},
): BoundProviders {
  return {
    rss: (url) => captureRss(url, deps),
    website: (url) => captureWebsite(url, deps),
    youtube: (input) => captureYouTube(input, { ...deps, apiKey: creds.youtubeApiKey }),
    podcast: (input) =>
      capturePodcast(input, {
        ...deps,
        apiKey: creds.podcastApiKey,
        apiSecret: creds.podcastApiSecret,
      }),
    forum: (input) => captureForum(input, deps),
  };
}

/** Input accepted by {@link captureViaProvider}, keyed loosely for routing. */
export interface ProviderRouteInput {
  /** A url for rss/website (and the watch/feed url when relevant). */
  url?: string;
  /** Public feed URL for podcast/forum fallbacks. */
  feedUrl?: string;
  /** YouTube public ids. */
  videoId?: string;
  channelId?: string;
  /** Podcast Index feed id. */
  feedId?: number;
}

/**
 * Route a capture by `sourceType` to its provider. Returns a ProviderResult
 * whose `data` is `CapturedItem | CapturedItem[]` depending on the provider.
 * Unknown source types decline with 'provider_not_configured'. Never throws.
 */
export async function captureViaProvider(
  sourceType: string,
  input: ProviderRouteInput,
  deps: ProviderDeps,
  creds: ProviderCredentials = {},
): Promise<ProviderResult<CapturedItem | CapturedItem[]>> {
  const providers = createProviders(deps, creds);
  switch (sourceType) {
    case 'rss':
      return input.url
        ? providers.rss(input.url)
        : { ok: false, reason: 'provider_not_configured', message: 'rss requires a url' };
    case 'website':
      return input.url
        ? providers.website(input.url)
        : { ok: false, reason: 'provider_not_configured', message: 'website requires a url' };
    case 'youtube':
      return providers.youtube({ videoId: input.videoId, channelId: input.channelId });
    case 'podcast':
      return providers.podcast({ feedId: input.feedId, feedUrl: input.feedUrl ?? input.url });
    case 'forum':
      return providers.forum({ feedUrl: input.feedUrl ?? input.url });
    default:
      return {
        ok: false,
        reason: 'provider_not_configured',
        message: `no provider for sourceType "${sourceType}" (public-only routing)`,
      };
  }
}

/** Args for {@link makeProviderRunLog}. */
export interface MakeRunLogArgs {
  provider: string;
  sourceId?: string;
  startedAt: string;
  finishedAt: string;
  result: ProviderResult<unknown>;
  /** Bytes read (when known). */
  bytes?: number;
}

/**
 * Build a ProviderRunLog from a provider result + injected timestamps. Derives
 * itemCount when the payload is an array, and surfaces the failure reason/method
 * as the note. Pure & deterministic given its inputs.
 */
export function makeProviderRunLog(args: MakeRunLogArgs): ProviderRunLog {
  const { provider, sourceId, startedAt, finishedAt, result, bytes } = args;
  const ok = result.ok;
  let itemCount: number | undefined;
  let note: string | undefined;
  let reason: ProviderFailureReason | undefined;
  if (result.ok) {
    note = `method=${result.method}`;
    if (Array.isArray(result.data)) itemCount = result.data.length;
    else if (result.data !== undefined && result.data !== null) itemCount = 1;
  } else {
    reason = result.reason;
    note = result.message;
  }
  return {
    provider,
    sourceId,
    startedAt,
    finishedAt,
    ok,
    reason,
    itemCount,
    bytes,
    note,
  };
}
