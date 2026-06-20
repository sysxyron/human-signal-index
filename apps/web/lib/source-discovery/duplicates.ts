// =============================================================================
// HSI Phase 70.3.1 — Platform-aware duplicate detection (PURE, deterministic).
//
// Uniqueness is by CANONICAL IDENTITY, not root domain. Platform sources
// (YouTube channels, subreddits, podcast feeds, TikTok/GitHub paths) are
// distinguished by their handle/path/feed — multiple YouTube channels are NOT
// duplicates just because both use youtube.com.
// =============================================================================

import { normalizeSourceType, type CandidateInput, type ExistingSource, type DuplicateResult, type IdentityStrategy } from './types';

/** Platform domains where the root domain alone is NOT a uniqueness key. */
const PLATFORM_DOMAINS = new Set([
  'youtube.com', 'youtu.be', 'reddit.com', 'tiktok.com', 'github.com', 'twitter.com', 'x.com',
  'facebook.com', 'instagram.com', 'spotify.com', 'podcasts.apple.com', 'apple.com', 'mastodon.social', 't.me', 'telegram.me',
]);
/** Canonical feed-identity types → identity-key prefix (identity = feed/endpoint URL). */
const FEED_PREFIX: Record<string, string> = {
  rss_feed: 'rss', news_rss: 'rss', research_rss: 'rss', podcast_rss: 'podcast',
  api_foundation: 'api', webhook: 'api', threat_feed: 'threat', intelligence_feed: 'intel',
};
/** Types whose identity is the full canonical URL (path matters). */
const PATH_TYPES = new Set(['watchlist', 'document', 'archive']);
const TRACKING_PARAM = /^(utm_|mc_|_hs|fbclid|gclid|igshid|ref$|ref_src|spm|yclid|cmpid)/i;

/** Normalized pathname ('' for root) for website/government identity keys. */
function pathOf(url: string | null | undefined): string {
  if (!url) return '';
  try { const p = new URL(url.includes('://') ? url : `https://${url}`).pathname.replace(/\/+$/, ''); return p === '' ? '' : p.toLowerCase(); } catch { return ''; }
}

export function domainOf(url: string | null | undefined): string {
  if (!url) return '';
  try {
    const u = new URL(url.includes('://') ? url : `https://${url}`);
    return u.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    const m = /^(?:https?:\/\/)?(?:www\.)?([^/:\s]+)/i.exec(url.trim());
    return m ? m[1].toLowerCase() : '';
  }
}

/** Canonical URL: https, lowercase host, no www, no trailing slash, no tracking params. */
export function normalizeSourceUrl(url: string | null | undefined): string {
  if (!url) return '';
  let raw = url.trim();
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  try {
    const u = new URL(raw);
    u.protocol = 'https:';
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
    u.hash = '';
    const keep: [string, string][] = [];
    u.searchParams.forEach((v, k) => { if (!TRACKING_PARAM.test(k)) keep.push([k, v]); });
    u.search = '';
    keep.sort((a, b) => a[0].localeCompare(b[0])).forEach(([k, v]) => u.searchParams.append(k, v));
    let out = u.toString();
    out = out.replace(/\/$/, (m, off) => (out.indexOf('/', 8) === off ? '/' : '')); // strip trailing slash except root
    return out;
  } catch {
    return raw.toLowerCase().replace(/\/$/, '');
  }
}

export interface PlatformIdentity { platform: string | null; identityKey: string | null }

/** Extract a platform-scoped identity (channel/subreddit/etc.) or null. */
export function getPlatformIdentity(url: string | null | undefined): PlatformIdentity {
  if (!url) return { platform: null, identityKey: null };
  const host = domainOf(url);
  let path = '';
  try { path = new URL(url.includes('://') ? url : `https://${url}`).pathname.replace(/\/+$/, ''); } catch { path = ''; }
  const seg = path.split('/').filter(Boolean);

  if (host === 'youtube.com' || host === 'youtu.be') {
    if (seg[0]?.startsWith('@')) return { platform: 'youtube', identityKey: `youtube:${seg[0].toLowerCase()}` };
    if (seg[0] === 'channel' && seg[1]) return { platform: 'youtube', identityKey: `youtube:channel:${seg[1].toLowerCase()}` };
    if ((seg[0] === 'c' || seg[0] === 'user') && seg[1]) return { platform: 'youtube', identityKey: `youtube:c:${seg[1].toLowerCase()}` };
    return { platform: 'youtube', identityKey: null };
  }
  if (host === 'reddit.com') {
    if (seg[0] === 'r' && seg[1]) return { platform: 'reddit', identityKey: `reddit:r/${seg[1].toLowerCase()}` };
    return { platform: 'reddit', identityKey: null };
  }
  if (host === 'tiktok.com') {
    if (seg[0]?.startsWith('@')) return { platform: 'tiktok', identityKey: `tiktok:${seg[0].toLowerCase()}` };
    return { platform: 'tiktok', identityKey: null };
  }
  if (host === 'github.com') {
    if (seg[0] && seg[1]) return { platform: 'github', identityKey: `github:${seg[0].toLowerCase()}/${seg[1].toLowerCase()}` };
    if (seg[0]) return { platform: 'github', identityKey: `github:${seg[0].toLowerCase()}` };
    return { platform: 'github', identityKey: null };
  }
  if (host === 'twitter.com' || host === 'x.com') {
    if (seg[0]) return { platform: 'twitter', identityKey: `twitter:@${seg[0].toLowerCase()}` };
    return { platform: 'twitter', identityKey: null };
  }
  if (host === 'facebook.com' || host === 'instagram.com' || host === 'mastodon.social') {
    if (seg[0]) return { platform: 'social', identityKey: `social:${host}:${seg[0].toLowerCase()}` };
    return { platform: 'social', identityKey: null };
  }
  if (host === 'spotify.com' || host === 'podcasts.apple.com' || host === 'apple.com') {
    return { platform: 'podcast_platform', identityKey: null }; // identity = the RSS feed (type-driven)
  }
  return { platform: null, identityKey: null };
}

export interface SourceIdentity { canonicalUrl: string; identityKey: string; identityStrategy: IdentityStrategy; platform: string | null }

/** Compute a source's canonical identity (key + strategy) for de-duplication. */
export function getSourceIdentityKey(input: { sourceType?: string | null; primaryUrl?: string | null; feedOrApiUrl?: string | null }): SourceIdentity {
  const type = normalizeSourceType(input.sourceType) ?? '';
  // Feed-identity types: identity is the feed/endpoint URL.
  if (FEED_PREFIX[type] && input.feedOrApiUrl) {
    const canon = normalizeSourceUrl(input.feedOrApiUrl);
    return { canonicalUrl: canon, identityKey: `${FEED_PREFIX[type]}:${canon}`, identityStrategy: 'feed_url', platform: null };
  }
  // Platform-identity (channel/subreddit/handle/repo).
  const plat = getPlatformIdentity(input.primaryUrl);
  if (plat.identityKey) {
    return { canonicalUrl: normalizeSourceUrl(input.primaryUrl), identityKey: plat.identityKey, identityStrategy: 'platform_identity', platform: plat.platform };
  }
  // Path-identity types: identity is the full canonical URL.
  if (PATH_TYPES.has(type)) {
    const canon = normalizeSourceUrl(input.primaryUrl || input.feedOrApiUrl);
    return { canonicalUrl: canon, identityKey: `${type}:${canon}`, identityStrategy: 'domain', platform: null };
  }
  // Website/government/etc: identity is domain (+ meaningful path).
  const url = input.primaryUrl || input.feedOrApiUrl;
  return { canonicalUrl: normalizeSourceUrl(url), identityKey: `website:${domainOf(url)}${pathOf(url)}`, identityStrategy: 'domain', platform: plat.platform };
}

function ident(e: ExistingSource): SourceIdentity {
  return getSourceIdentityKey({ sourceType: e.sourceType, primaryUrl: e.homepageUrl, feedOrApiUrl: e.rssUrl });
}
/** "Existing identity X · candidate identity Y → result" — drives the UI explanation. */
function reasonFor(status: string, cId: SourceIdentity, eId: SourceIdentity): string {
  return `Existing identity ${eId.identityKey} · candidate identity ${cId.identityKey} → ${status}`;
}
function res(status: DuplicateResult['duplicateStatus'], e: ExistingSource, cId: SourceIdentity, eId: SourceIdentity): DuplicateResult {
  return { duplicateStatus: status, existingSourceId: e.id, existingSourceName: e.name, duplicateReason: reasonFor(status, cId, eId) };
}

// ---- individual detectors (platform-aware) ---------------------------------

export function detectExactDuplicate(candidate: CandidateInput, existing: ExistingSource[]): DuplicateResult | null {
  const c = getSourceIdentityKey(candidate);
  const cPrimary = normalizeSourceUrl(candidate.primaryUrl);
  if (!cPrimary) return null;
  for (const e of existing) if (e.homepageUrl && normalizeSourceUrl(e.homepageUrl) === cPrimary) return res('exact_duplicate', e, c, ident(e));
  return null;
}
export function detectPlatformIdentityDuplicate(candidate: CandidateInput, existing: ExistingSource[]): DuplicateResult | null {
  const c = getSourceIdentityKey(candidate);
  if (c.identityStrategy !== 'platform_identity') return null;
  for (const e of existing) { const ei = ident(e); if (ei.identityStrategy === 'platform_identity' && ei.identityKey === c.identityKey) return res('platform_identity_duplicate', e, c, ei); }
  return null;
}
export function detectFeedDuplicate(candidate: CandidateInput, existing: ExistingSource[]): DuplicateResult | null {
  const c = getSourceIdentityKey(candidate);
  if (c.identityStrategy !== 'feed_url') return null;
  for (const e of existing) { const ei = ident(e); if (ei.identityStrategy === 'feed_url' && ei.identityKey === c.identityKey) return res('feed_duplicate', e, c, ei); }
  return null;
}
/** Same root domain, different identity, generic (non-platform) WEBSITE → confirm.
 *  Only website-identity sources participate — feed/path/platform sources are keyed
 *  by feed-url / full-path / handle, so sharing a domain is not a duplicate. */
export function detectDomainDuplicate(candidate: CandidateInput, existing: ExistingSource[]): DuplicateResult | null {
  const c = getSourceIdentityKey(candidate);
  if (!c.identityKey.startsWith('website:')) return null;
  const cDomain = domainOf(candidate.primaryUrl) || domainOf(candidate.feedOrApiUrl);
  if (!cDomain || PLATFORM_DOMAINS.has(cDomain)) return null;
  for (const e of existing) {
    const eDomain = domainOf(e.homepageUrl) || domainOf(e.rssUrl);
    if (!eDomain || PLATFORM_DOMAINS.has(eDomain) || eDomain !== cDomain) continue;
    const ei = ident(e);
    if (ei.identityKey.startsWith('website:') && ei.canonicalUrl !== c.canonicalUrl) return res('domain_duplicate', e, c, ei); // different URL, same domain
  }
  return null;
}
export function detectRelatedSource(candidate: CandidateInput, existing: ExistingSource[]): DuplicateResult | null {
  const root = (d: string) => d.split('.').slice(-2).join('.');
  const cDomain = domainOf(candidate.primaryUrl) || domainOf(candidate.feedOrApiUrl);
  if (!cDomain || PLATFORM_DOMAINS.has(cDomain)) return null;
  const c = getSourceIdentityKey(candidate);
  for (const e of existing) { const ed = domainOf(e.homepageUrl) || domainOf(e.rssUrl); if (ed && ed !== cDomain && root(ed) === root(cDomain)) return res('related_source', e, c, ident(e)); }
  return null;
}

/** Strongest signal: exact > platform_identity > feed > domain > related >
 *  platform_domain_only (informational, allowed) > none. */
export function detectDuplicate(candidate: CandidateInput, existing: ExistingSource[]): DuplicateResult {
  const strong = detectExactDuplicate(candidate, existing)
    ?? detectPlatformIdentityDuplicate(candidate, existing)
    ?? detectFeedDuplicate(candidate, existing)
    ?? detectDomainDuplicate(candidate, existing)
    ?? detectRelatedSource(candidate, existing);
  if (strong) return strong;

  // Same platform domain but a different channel/path = NOT a duplicate (allowed).
  const cDomain = domainOf(candidate.primaryUrl) || domainOf(candidate.feedOrApiUrl);
  if (cDomain && PLATFORM_DOMAINS.has(cDomain)) {
    const share = existing.find((e) => domainOf(e.homepageUrl) === cDomain || domainOf(e.rssUrl) === cDomain);
    if (share) return res('platform_domain_only_not_duplicate', share, getSourceIdentityKey(candidate), ident(share));
  }
  return { duplicateStatus: 'none', existingSourceId: null, existingSourceName: null, duplicateReason: null };
}
