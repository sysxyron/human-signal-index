// =============================================================================
// URL/feed detectors — PURE. Recognize Spotify pages, Reddit subreddits, RSS-like
// URLs and feed XML so validation can give actionable, source-specific guidance.
// =============================================================================

/** Is this a parseable http(s) URL? PURE. */
export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** A Spotify page (show/episode/playlist) — NOT a podcast RSS feed. PURE. */
export function isSpotifyUrl(value: string): boolean {
  return /(^|\.)spotify\.com\//i.test(value.trim()) || /^spotify:/i.test(value.trim());
}

/** Any reddit.com URL. PURE. */
export function isRedditUrl(value: string): boolean {
  return /(^|\.)reddit\.com\//i.test(value.trim());
}

/** A reddit URL that already points at the `.rss` feed. PURE. */
export function isRedditRssUrl(value: string): boolean {
  return isRedditUrl(value) && /\.rss(\?|$)/i.test(value.trim());
}

/** Extract a subreddit name from a URL or raw input (e.g. 'r/antinatalism', 'antinatalism'). */
export function extractSubreddit(value: string): string | null {
  const v = value.trim();
  const m = v.match(/reddit\.com\/r\/([A-Za-z0-9_]+)/i) || v.match(/^\/?r\/([A-Za-z0-9_]+)/i) || v.match(/^([A-Za-z0-9_]{2,30})$/);
  return m ? m[1] : null;
}

/** Build the canonical Reddit RSS feed URL for a subreddit. PURE. */
export function redditFeedUrl(subreddit: string): string {
  return `https://www.reddit.com/r/${subreddit}/.rss`;
}

/** Heuristic: does this URL look like an RSS/Atom feed endpoint? PURE. */
export function looksLikeRssUrl(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!isHttpUrl(v)) return false;
  return /(\.rss|\.xml|\.atom|\/rss\b|\/feed\b|\/feeds\b|feed=|format=rss|output=rss|\/atom\b)/.test(v);
}

/** Heuristic: does this body look like RSS/Atom XML? PURE. */
export function looksLikeRssXml(xml: string): boolean {
  const head = xml.slice(0, 4000).toLowerCase();
  return /<rss[\s>]/.test(head) || /<feed[\s>]/.test(head) || /<rdf:rdf[\s>]/.test(head) || (/<channel[\s>]/.test(head) && /<item[\s>]/.test(head));
}
