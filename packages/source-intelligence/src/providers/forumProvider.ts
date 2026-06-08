// =============================================================================
// @hsi/source-intelligence — Forum PROVIDER (Phase 9; interface-first, SAFE).
//
// ┌───────────────────────────────────────────────────────────────────────────┐
// │ NO PRIVATE SCRAPING — EVER.                                                 │
// │ Forums are a high-risk surface for privacy/ethics violations. This provider │
// │ ONLY consumes PUBLIC, machine-readable endpoints that the platform itself   │
// │ offers (an RSS/Atom feed, or a documented public JSON endpoint). It will    │
// │ NEVER: log in, hold a session/cookie, solve a challenge, read private/      │
// │ members-only boards, DMs, or any authenticated surface, nor scrape rendered │
// │ HTML behind a wall. With no PUBLIC feed it declines: provider_not_configured.│
// └───────────────────────────────────────────────────────────────────────────┘
//
// When a public feed URL is supplied it delegates to the RSS provider. method 'rss'.
// =============================================================================

import type { CapturedItem, ProviderDeps, ProviderResult } from './types';
import { captureRss } from './rssProvider';

/** Input for a forum capture: a PUBLIC feed URL only (no auth, ever). */
export interface ForumInput {
  /** A PUBLIC RSS/Atom feed URL exposed by the forum. */
  feedUrl?: string;
}

/**
 * Capture PUBLIC forum activity via a PUBLIC feed. Declines with
 * 'provider_not_configured' unless a public feedUrl is supplied (then delegates
 * to captureRss). NEVER scrapes private/authenticated forum content. Never throws.
 */
export async function captureForum(
  input: ForumInput,
  deps: ProviderDeps,
): Promise<ProviderResult<CapturedItem[]>> {
  if (!input.feedUrl) {
    return {
      ok: false,
      reason: 'provider_not_configured',
      message:
        'Forum capture requires a PUBLIC feed URL. We never log in or scrape ' +
        'private/members-only forum content (NO PRIVATE SCRAPING — EVER).',
    };
  }
  return captureRss(input.feedUrl, deps);
}
