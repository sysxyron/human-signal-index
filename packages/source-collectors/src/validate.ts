// =============================================================================
// Source validation + normalization — PURE. Per-type rules with actionable error
// messages (Spotify-as-podcast, non-RSS reddit, missing feeds, …). Produces a
// NormalizedSource the DAL persists. No network — only shape/URL reasoning.
// =============================================================================

import type { ConnectorKind } from '@hsi/source-connectors';
import {
  isHttpUrl, isSpotifyUrl, isRedditUrl, isRedditRssUrl, extractSubreddit, redditFeedUrl, looksLikeRssUrl,
} from './detectors';
import { connectorForSourceType } from './routing';
import { isSourceType, type CollectorSourceType, type NormalizedSource, type SourceConfig, type SourceDraft, type SourceValidation, type ValidationIssue } from './types';

const issue = (field: string, message: string, suggestion?: string): ValidationIssue => ({ field, message, suggestion });

/** First non-empty URL among the draft's URL-ish fields. */
function anyUrl(d: SourceDraft): string {
  return (d.url || d.rssUrl || d.homepageUrl || '').trim();
}

/**
 * Validate + normalize a source draft. Returns ok:false with actionable issues
 * when invalid, or ok:true with a NormalizedSource ready to persist. PURE.
 */
export function validateSource(draft: SourceDraft): SourceValidation {
  const issues: ValidationIssue[] = [];
  const typeRaw = (draft.sourceType || '').trim();
  if (!isSourceType(typeRaw)) {
    return { ok: false, issues: [issue('sourceType', `Unknown source type "${typeRaw}".`)] };
  }
  const sourceType = typeRaw as CollectorSourceType;
  const rss = (draft.rssUrl || '').trim();
  const home = (draft.homepageUrl || '').trim();
  const url = (draft.url || '').trim();

  let captureUrl: string | null = null;
  let connector: ConnectorKind | null = connectorForSourceType(sourceType);
  const config: SourceConfig = {};

  switch (sourceType) {
    case 'rss':
    case 'news':
    case 'research':
    case 'intelligence_feed': {
      const feed = rss || url;
      if (!feed) { issues.push(issue('rssUrl', 'An RSS/Atom feed URL is required for this source type.')); break; }
      if (!isHttpUrl(feed)) { issues.push(issue('rssUrl', 'Enter a valid http(s) feed URL.')); break; }
      if (isSpotifyUrl(feed)) { issues.push(issue('rssUrl', 'Spotify pages are not RSS feeds. Provide the publisher RSS/Atom feed URL.')); break; }
      if (isRedditUrl(feed) && !isRedditRssUrl(feed)) {
        issues.push(issue('rssUrl', 'That looks like a Reddit page, not an RSS feed.', `${feed.replace(/\/?$/, '')}/.rss — or choose the "reddit" source type.`));
        break;
      }
      if (!looksLikeRssUrl(feed) && !isRedditRssUrl(feed)) {
        issues.push(issue('rssUrl', 'This does not look like an RSS/Atom feed. Find the site’s feed URL (often /feed, /rss, or .xml).'));
        break;
      }
      captureUrl = feed;
      break;
    }
    case 'reddit': {
      const sub = extractSubreddit(draft.subreddit || url || rss || home || '');
      if (!sub) { issues.push(issue('subreddit', 'Enter a subreddit (e.g. r/antinatalism) or its URL.')); break; }
      captureUrl = isRedditRssUrl(url) ? url : redditFeedUrl(sub);
      connector = 'rss';
      config.subreddit = sub;
      break;
    }
    case 'podcast': {
      const feed = rss || url;
      if (!feed) { issues.push(issue('rssUrl', 'A podcast RSS feed URL is required.')); break; }
      if (isSpotifyUrl(feed)) {
        issues.push(issue('rssUrl', 'Spotify pages are not podcast RSS feeds. Add the podcast RSS feed or use manual monitoring.'));
        break;
      }
      if (!isHttpUrl(feed)) { issues.push(issue('rssUrl', 'Enter a valid podcast RSS feed URL.')); break; }
      captureUrl = feed;
      break;
    }
    case 'watchlist': {
      const target = url || home;
      if (!target) { issues.push(issue('url', 'A page URL is required to watch for changes.')); break; }
      if (!isHttpUrl(target)) { issues.push(issue('url', 'Enter a valid http(s) URL.')); break; }
      captureUrl = target;
      connector = 'public_page';
      if (draft.captureIntervalMinutes && draft.captureIntervalMinutes > 0) config.captureIntervalMinutes = Math.floor(draft.captureIntervalMinutes);
      if (draft.contentSelector?.trim()) config.contentSelector = draft.contentSelector.trim();
      break;
    }
    case 'website':
    case 'forum':
    case 'social':
    case 'archive': {
      const target = home || url;
      if (!target) { issues.push(issue('homepageUrl', 'A homepage / page URL is required.')); break; }
      if (!isHttpUrl(target)) { issues.push(issue('homepageUrl', 'Enter a valid http(s) URL.')); break; }
      captureUrl = target;
      connector = 'public_page';
      break;
    }
    case 'government': {
      // RSS when a feed is given, otherwise watchlist behavior over the page.
      const feed = rss.trim();
      const page = (home || url).trim();
      if (feed) {
        if (!isHttpUrl(feed)) { issues.push(issue('rssUrl', 'Enter a valid government feed URL.')); break; }
        captureUrl = feed; connector = 'rss';
      } else if (page) {
        if (!isHttpUrl(page)) { issues.push(issue('homepageUrl', 'Enter a valid government page URL.')); break; }
        captureUrl = page; connector = 'public_page';
      } else {
        issues.push(issue('rssUrl', 'Provide an RSS feed URL or a page URL to monitor.'));
      }
      break;
    }
    case 'youtube':
    case 'tiktok': {
      const target = url || home;
      if (!target) { issues.push(issue('url', `A ${sourceType} channel/page URL is required.`)); break; }
      if (!isHttpUrl(target)) { issues.push(issue('url', 'Enter a valid http(s) URL.')); break; }
      captureUrl = target;
      break;
    }
    case 'api': {
      const endpoint = url || home;
      if (!endpoint) { issues.push(issue('url', 'An API endpoint URL is required.')); break; }
      if (!isHttpUrl(endpoint)) { issues.push(issue('url', 'Enter a valid http(s) endpoint URL.')); break; }
      captureUrl = null; // foundation only — no automated polling yet
      connector = null;
      config.captureUrl = endpoint;
      config.apiMethod = (draft.apiMethod || 'GET').toUpperCase();
      break;
    }
    case 'webhook': {
      // Inbound: external systems push to a signed endpoint. No URL to fetch.
      captureUrl = null; connector = null;
      break;
    }
    case 'document':
    case 'manual':
    case 'email': {
      // Foundation / manual — an optional reference URL may be attached.
      const ref = anyUrl(draft);
      if (ref && !isHttpUrl(ref)) issues.push(issue('url', 'If provided, the reference URL must be valid http(s).'));
      captureUrl = null; connector = null;
      break;
    }
    default:
      issues.push(issue('sourceType', `Unsupported source type "${sourceType}".`));
  }

  if (issues.length > 0) return { ok: false, issues };

  if (captureUrl) config.captureUrl = captureUrl;
  if (connector) config.connector = connector;

  const normalized: NormalizedSource = {
    sourceType,
    captureUrl,
    connector,
    rssUrl: connector === 'rss' ? captureUrl : (rss || null),
    homepageUrl: connector === 'public_page' ? captureUrl : (home || null),
    config,
  };
  return { ok: true, issues: [], normalized };
}

/** Normalize a draft, throwing away validation detail (returns the NormalizedSource or null). PURE. */
export function normalizeSourceInput(draft: SourceDraft): NormalizedSource | null {
  const res = validateSource(draft);
  return res.ok && res.normalized ? res.normalized : null;
}
