// =============================================================================
// HSI Phase 70.3.3 — Source family grouping (PURE, deterministic).
// Groups related source assets (Reuters Website + Reuters RSS + Reuters YouTube)
// under one parent identity for situational awareness. This is a GROUPING for
// display — it never merges records and never changes any stored row. No I/O.
// =============================================================================

import { normalizeSourceType } from '../source-discovery/types';
import { domainOf } from '../source-discovery/duplicates';
import type { FamilyInput, SourceFamily } from './types';

const PLATFORM_HOSTS = new Set(['youtube.com', 'youtu.be', 'reddit.com', 'tiktok.com', 'github.com', 'twitter.com', 'x.com', 'facebook.com', 'instagram.com', 'spotify.com', 'podcasts.apple.com', 'apple.com', 'mastodon.social', 't.me', 'telegram.me']);
const NAME_NOISE = /\b(the|official|news|media|channel|rss|feed|podcast|tv|live|daily|wire|press|inc|llc|ltd|group|network|org)\b/gi;

/** Registrable root label, e.g. reuters.com → "reuters", news.bbc.co.uk → "bbc". */
function domainRootLabel(url: string | null): string {
  const d = domainOf(url);
  if (!d) return '';
  const parts = d.split('.');
  if (parts.length <= 2) return parts[0];
  // crude eTLD handling: drop known 2-part suffixes (co.uk, com.au, gov.uk…)
  const TWO = new Set(['co', 'com', 'org', 'gov', 'net', 'ac', 'edu']);
  if (parts.length >= 3 && TWO.has(parts[parts.length - 2])) return parts[parts.length - 3];
  return parts[parts.length - 2];
}

/** Org token from a platform identity key (youtube:@reuters → "reuters"). */
function identityOrgLabel(identityKey: string | null): string {
  if (!identityKey) return '';
  const m = /^([a-z]+):(?:@|r\/|channel:|c:)?([a-z0-9_-]+)/i.exec(identityKey);
  if (!m) return '';
  const token = m[2].toLowerCase();
  return token === 'channel' || token === 'c' ? '' : token;
}

/** Normalize a source name into a comparable org slug. */
function nameSlug(name: string | null): string {
  if (!name) return '';
  return name.toLowerCase().replace(NAME_NOISE, ' ').replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).slice(0, 2).join('-');
}

/** Deterministic family key precedence: explicit org → domain root → platform
 *  identity org → name slug. Returns '' only when nothing is derivable. */
export function familyKey(input: FamilyInput): string {
  const org = input.organization ? nameSlug(input.organization) : '';
  if (org) return org;
  // explicit org: tag (e.g. "org:reuters")
  const orgTag = input.tags.map((t) => /^org:(.+)$/i.exec(t.trim())).find(Boolean);
  if (orgTag) return nameSlug(orgTag[1]);

  const host = domainOf(input.homepageUrl || input.feedUrl);
  if (host && !PLATFORM_HOSTS.has(host)) return domainRootLabel(input.homepageUrl || input.feedUrl);

  const idOrg = identityOrgLabel(input.identityKey);
  if (idOrg) return idOrg;

  const fromDomain = domainRootLabel(input.homepageUrl || input.feedUrl);
  if (fromDomain) return fromDomain;

  return nameSlug(input.name);
}

/** The asset role a source plays within its family. */
export function assetRole(input: FamilyInput): string {
  const type = normalizeSourceType(input.sourceType) ?? (input.sourceType ?? 'source');
  const map: Record<string, string> = {
    youtube: 'YouTube', reddit: 'Reddit', tiktok: 'TikTok', social_page: 'Social',
    rss_feed: 'RSS', news_rss: 'News RSS', research_rss: 'Research RSS', podcast_rss: 'Podcast',
    api_foundation: 'API', webhook: 'Webhook', website: 'Website', government: 'Gov',
    court_opinions: 'Court', news_source: 'Newswire', threat_feed: 'Threat feed',
    watchlist: 'Watchlist', document: 'Document', archive: 'Archive', forum: 'Forum',
    intelligence_feed: 'Intel feed', public_policy_org: 'Policy', email: 'Email', manual: 'Manual',
  };
  return map[type] ?? type;
}

/** Group sources into families. Families are presentation-only; nothing merges. */
export function groupSourceFamilies(sources: FamilyInput[]): SourceFamily[] {
  const buckets = new Map<string, FamilyInput[]>();
  for (const s of sources) {
    const key = familyKey(s) || `id-${s.id}`;
    const arr = buckets.get(key) ?? [];
    arr.push(s);
    buckets.set(key, arr);
  }
  const families: SourceFamily[] = [];
  for (const [familyKeyStr, members] of buckets) {
    // Display name = most descriptive existing member name, else the key.
    const display = members.map((m) => m.name).filter((n): n is string => !!n).sort((a, b) => a.length - b.length)[0] ?? familyKeyStr;
    families.push({
      familyKey: familyKeyStr,
      displayName: display,
      memberIds: members.map((m) => m.id),
      members: members.map((m) => ({ id: m.id, name: m.name ?? 'Source', role: assetRole(m) })),
      size: members.length,
    });
  }
  // Multi-member families first, then alphabetical.
  return families.sort((a, b) => b.size - a.size || a.displayName.localeCompare(b.displayName));
}
