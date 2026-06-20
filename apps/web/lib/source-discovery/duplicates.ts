// =============================================================================
// HSI Phase 70.3.1 — Platform-aware duplicate detection (PURE, deterministic).
//
// Uniqueness is by CANONICAL IDENTITY, not root domain. Platform sources
// (YouTube channels, subreddits, podcast feeds, TikTok/GitHub paths) are
// distinguished by their handle/path/feed — multiple YouTube channels are NOT
// duplicates just because both use youtube.com.
// =============================================================================

import type { CandidateInput, ExistingSource, DuplicateResult, IdentityStrategy } from './types';

/** Platform domains where the root domain alone is NOT a uniqueness key. */
const PLATFORM_DOMAINS = new Set([
  'youtube.com', 'youtu.be', 'reddit.com', 'tiktok.com', 'github.com', 'twitter.com', 'x.com',
  'facebook.com', 'instagram.com', 'spotify.com', 'podcasts.apple.com', 'apple.com', 'mastodon.social', 't.me', 'telegram.me',
]);
/** Types whose identity is the feed/endpoint URL, not the homepage. */
const FEED_TYPES = new Set(['rss', 'podcast', 'threat_feed', 'api', 'archive', 'newswire']);
const TRACKING_PARAM = /^(utm_|mc_|_hs|fbclid|gclid|igshid|ref$|ref_src|spm|yclid|cmpid)/i;

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
  const type = (input.sourceType ?? '').toLowerCase();
  if (FEED_TYPES.has(type) && input.feedOrApiUrl) {
    const canon = normalizeSourceUrl(input.feedOrApiUrl);
    return { canonicalUrl: canon, identityKey: `${type}:${canon}`, identityStrategy: 'feed_url', platform: null };
  }
  const plat = getPlatformIdentity(input.primaryUrl);
  if (plat.identityKey) {
    return { canonicalUrl: normalizeSourceUrl(input.primaryUrl), identityKey: plat.identityKey, identityStrategy: 'platform_identity', platform: plat.platform };
  }
  const url = input.primaryUrl || input.feedOrApiUrl;
  return { canonicalUrl: normalizeSourceUrl(url), identityKey: `website:${domainOf(url)}`, identityStrategy: 'domain', platform: plat.platform };
}

function ident(e: ExistingSource): SourceIdentity {
  return getSourceIdentityKey({ sourceType: e.sourceType, primaryUrl: e.homepageUrl, feedOrApiUrl: e.rssUrl });
}
function result(status: DuplicateResult['duplicateStatus'], e: ExistingSource, reason: string): DuplicateResult {
  return { duplicateStatus: status, existingSourceId: e.id, existingSourceName: e.name, duplicateReason: reason };
}

// ---- individual detectors (kept; now platform-aware) -----------------------

export function detectExactDuplicate(candidate: CandidateInput, existing: ExistingSource[]): DuplicateResult | null {
  // Exact = identical HOMEPAGE URL (feed/platform identity handle their own cases).
  const cPrimary = normalizeSourceUrl(candidate.primaryUrl);
  if (!cPrimary) return null;
  for (const e of existing) if (e.homepageUrl && normalizeSourceUrl(e.homepageUrl) === cPrimary) return result('exact_duplicate', e, 'Identical homepage URL already in the registry.');
  return null;
}
export function detectPlatformIdentityDuplicate(candidate: CandidateInput, existing: ExistingSource[]): DuplicateResult | null {
  const c = getSourceIdentityKey(candidate);
  if (c.identityStrategy !== 'platform_identity') return null;
  for (const e of existing) { const ei = ident(e); if (ei.identityStrategy === 'platform_identity' && ei.identityKey === c.identityKey) return result('platform_identity_duplicate', e, `Same platform identity "${c.identityKey}".`); }
  return null;
}
export function detectFeedDuplicate(candidate: CandidateInput, existing: ExistingSource[]): DuplicateResult | null {
  const c = getSourceIdentityKey(candidate);
  if (c.identityStrategy !== 'feed_url') return null;
  for (const e of existing) { const ei = ident(e); if (ei.identityStrategy === 'feed_url' && ei.identityKey === c.identityKey) return result('feed_duplicate', e, 'Same feed/endpoint URL.'); }
  return null;
}
export function detectDomainDuplicate(candidate: CandidateInput, existing: ExistingSource[]): DuplicateResult | null {
  const c = getSourceIdentityKey(candidate);
  if (c.identityStrategy !== 'domain' || c.platform) return null; // platform domains are not domain-duplicates
  for (const e of existing) { const ei = ident(e); if (ei.identityStrategy === 'domain' && !ei.platform && ei.identityKey === c.identityKey) return result('domain_duplicate', e, `Domain "${domainOf(candidate.primaryUrl || candidate.feedOrApiUrl)}" already covered.`); }
  return null;
}
export function detectRelatedSource(candidate: CandidateInput, existing: ExistingSource[]): DuplicateResult | null {
  const root = (d: string) => d.split('.').slice(-2).join('.');
  const cDomain = domainOf(candidate.primaryUrl) || domainOf(candidate.feedOrApiUrl);
  if (!cDomain || PLATFORM_DOMAINS.has(cDomain)) return null;
  for (const e of existing) { const ed = domainOf(e.homepageUrl) || domainOf(e.rssUrl); if (ed && ed !== cDomain && root(ed) === root(cDomain)) return result('related_source', e, `Shares root domain "${root(cDomain)}".`); }
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
    if (share) return result('platform_domain_only_not_duplicate', share, `Same platform (${cDomain}) but a different channel/path — not a duplicate.`);
  }
  return { duplicateStatus: 'none', existingSourceId: null, existingSourceName: null, duplicateReason: null };
}
