import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeSourceUrl, getPlatformIdentity, getSourceIdentityKey, detectDuplicate } from './duplicates';
import { validateRow } from './csv';
import { normalizeSourceType, isSourceType, SOURCE_TYPES, blocksApproval, requiresConfirmation, type CandidateInput, type ExistingSource } from './types';

function cand(over: Partial<CandidateInput> = {}): CandidateInput {
  return { sourceName: 'X', sourceType: null, category: null, primaryUrl: null, feedOrApiUrl: null, platform: null, captureIntervalMinutes: null, baselineRisk: null, contentSelector: null, priority: null, ingestionMode: null, tags: [], description: null, corroborationRule: null, notes: null, ...over };
}

// ---- normalization ---------------------------------------------------------

test('normalizeSourceUrl: https, strip www, trailing slash, tracking params', () => {
  assert.equal(normalizeSourceUrl('http://www.Example.com/'), 'https://example.com/');
  assert.equal(normalizeSourceUrl('https://example.com/path/'), 'https://example.com/path');
  assert.equal(normalizeSourceUrl('https://example.com/p?utm_source=x&q=1'), 'https://example.com/p?q=1');
  assert.equal(normalizeSourceUrl('reuters.com'), 'https://reuters.com/');
});

// ---- platform identity -----------------------------------------------------

test('getPlatformIdentity: youtube handle / channel / reddit / tiktok / github', () => {
  assert.equal(getPlatformIdentity('https://youtube.com/@Reuters').identityKey, 'youtube:@reuters');
  assert.equal(getPlatformIdentity('https://youtube.com/channel/UCabc').identityKey, 'youtube:channel:ucabc');
  assert.equal(getPlatformIdentity('https://www.reddit.com/r/worldnews').identityKey, 'reddit:r/worldnews');
  assert.equal(getPlatformIdentity('https://tiktok.com/@news').identityKey, 'tiktok:@news');
  assert.equal(getPlatformIdentity('https://github.com/org/repo').identityKey, 'github:org/repo');
  assert.equal(getPlatformIdentity('https://reuters.com').identityKey, null);
  assert.equal(getPlatformIdentity('https://youtube.com').platform, 'youtube'); // domain-only platform
});

test('getSourceIdentityKey: platform / feed / domain strategies', () => {
  assert.equal(getSourceIdentityKey({ sourceType: 'youtube', primaryUrl: 'https://youtube.com/@BBCNews' }).identityStrategy, 'platform_identity');
  assert.equal(getSourceIdentityKey({ sourceType: 'rss', feedOrApiUrl: 'https://cisa.gov/advisories.xml' }).identityStrategy, 'feed_url');
  assert.equal(getSourceIdentityKey({ sourceType: 'website', primaryUrl: 'https://reuters.com' }).identityKey, 'website:reuters.com');
});

// ---- platform-aware duplicate detection (the core fix) ---------------------

const yt = (handle: string): ExistingSource => ({ id: handle, name: handle, homepageUrl: `https://youtube.com/${handle}`, rssUrl: null, sourceType: 'youtube' });

test('same YouTube channel (different path) → platform_identity_duplicate (blocked)', () => {
  const r = detectDuplicate(cand({ sourceType: 'youtube', primaryUrl: 'https://youtube.com/@Reuters/videos' }), [yt('@Reuters')]);
  assert.equal(r.duplicateStatus, 'platform_identity_duplicate');
  assert.ok(blocksApproval('platform_identity_duplicate'));
});
test('identical YouTube channel URL → exact_duplicate (also blocked)', () => {
  assert.equal(detectDuplicate(cand({ sourceType: 'youtube', primaryUrl: 'https://youtube.com/@Reuters' }), [yt('@Reuters')]).duplicateStatus, 'exact_duplicate');
});

test('different YouTube channels → NOT duplicate (Reuters vs BBC)', () => {
  const r = detectDuplicate(cand({ sourceType: 'youtube', primaryUrl: 'https://youtube.com/@BBCNews' }), [yt('@Reuters')]);
  assert.equal(r.duplicateStatus, 'platform_domain_only_not_duplicate');
  assert.ok(!blocksApproval('platform_domain_only_not_duplicate'));
  assert.ok(!requiresConfirmation('platform_domain_only_not_duplicate'));
});

test('different subreddits → NOT duplicate', () => {
  const existing: ExistingSource[] = [{ id: 's', name: 'worldnews', homepageUrl: 'https://reddit.com/r/worldnews', rssUrl: null, sourceType: 'social' }];
  const r = detectDuplicate(cand({ sourceType: 'social', primaryUrl: 'https://reddit.com/r/geopolitics' }), existing);
  assert.equal(r.duplicateStatus, 'platform_domain_only_not_duplicate');
});

test('same subreddit (different path) → platform_identity_duplicate', () => {
  const existing: ExistingSource[] = [{ id: 's', name: 'worldnews', homepageUrl: 'https://reddit.com/r/worldnews', rssUrl: null, sourceType: 'social' }];
  assert.equal(detectDuplicate(cand({ sourceType: 'social', primaryUrl: 'https://www.reddit.com/r/worldnews/top' }), existing).duplicateStatus, 'platform_identity_duplicate');
});

test('same podcast feed → feed_duplicate; different feed → none', () => {
  const existing: ExistingSource[] = [{ id: 'p', name: 'Show', homepageUrl: 'https://spotify.com/show/abc', rssUrl: 'https://feeds.megaphone.fm/show', sourceType: 'podcast' }];
  assert.equal(detectDuplicate(cand({ sourceType: 'podcast', feedOrApiUrl: 'https://feeds.megaphone.fm/show' }), existing).duplicateStatus, 'feed_duplicate');
  assert.equal(detectDuplicate(cand({ sourceType: 'podcast', feedOrApiUrl: 'https://feeds.other.fm/x' }), existing).duplicateStatus, 'none');
});

test('plain websites still domain-duplicate', () => {
  const existing: ExistingSource[] = [{ id: 'w', name: 'Example', homepageUrl: 'https://example.com', rssUrl: null, sourceType: 'website' }];
  assert.equal(detectDuplicate(cand({ sourceType: 'website', primaryUrl: 'https://example.com/news' }), existing).duplicateStatus, 'domain_duplicate');
});

// ---- Phase 70.3.2: source-type registry normalization ----------------------

test('normalizeSourceType: canonical types pass through', () => {
  for (const t of SOURCE_TYPES) assert.equal(normalizeSourceType(t), t);
});

test('normalizeSourceType: human labels + legacy aliases map to canonical', () => {
  const cases: [string, string][] = [
    ['Document', 'document'],
    ['Reddit', 'reddit'],
    ['Research (RSS)', 'research_rss'],
    ['RSS / Atom feed', 'rss_feed'],
    ['API (foundation)', 'api_foundation'],
    ['Watchlist (no RSS)', 'watchlist'],
    ['Public policy organizations', 'public_policy_org'],
    ['News (RSS)', 'news_rss'],
    ['  PODCAST  ', 'podcast_rss'],
    ['newswire', 'news_source'],
    ['social', 'social_page'],
    ['court', 'court_opinions'],
  ];
  for (const [raw, expected] of cases) {
    assert.equal(normalizeSourceType(raw), expected, `${raw} → ${expected}`);
    assert.ok(isSourceType(raw), `${raw} should be a recognized type`);
  }
});

test('normalizeSourceType: unmappable → null (still invalid)', () => {
  assert.equal(normalizeSourceType('News Channel'), null);
  assert.equal(normalizeSourceType('blog'), null);
  assert.equal(normalizeSourceType(''), null);
  assert.equal(normalizeSourceType(null), null);
});

test('seed CSV types are no longer rejected by validateRow', () => {
  for (const t of ['RSS / Atom feed', 'API (foundation)', 'Public policy organizations', 'Watchlist (no RSS)', 'Document', 'Research (RSS)']) {
    const v = validateRow({ source_name: 'X', primary_url: 'https://x.com', source_type: t });
    assert.ok(v.valid, `type "${t}" should validate; got ${JSON.stringify(v.errors)}`);
  }
});

// ---- Phase 70.3.2: identity-based platform dedupe (success criteria) --------

const ytExisting = (handle: string): ExistingSource[] => [{ id: handle, name: handle, homepageUrl: `https://youtube.com/${handle}`, rssUrl: null, sourceType: 'youtube' }];

test('Reuters YouTube vs BBC YouTube → NOT duplicate', () => {
  const r = detectDuplicate(cand({ sourceType: 'youtube', primaryUrl: 'https://youtube.com/@BBCNews' }), ytExisting('@Reuters'));
  assert.equal(r.duplicateStatus, 'platform_domain_only_not_duplicate');
});

test('NPR vs NPR YouTube (same channel) → platform_identity_duplicate', () => {
  const r = detectDuplicate(cand({ sourceType: 'youtube', primaryUrl: 'https://www.youtube.com/@NPR/videos' }), ytExisting('@npr'));
  assert.equal(r.duplicateStatus, 'platform_identity_duplicate');
});

test('r/antinatalism vs r/collapse → NOT duplicate; vs r/antinatalism → duplicate', () => {
  const existing: ExistingSource[] = [{ id: 's', name: 'antinatalism', homepageUrl: 'https://reddit.com/r/antinatalism', rssUrl: null, sourceType: 'reddit' }];
  assert.equal(detectDuplicate(cand({ sourceType: 'reddit', primaryUrl: 'https://reddit.com/r/collapse' }), existing).duplicateStatus, 'platform_domain_only_not_duplicate');
  assert.equal(detectDuplicate(cand({ sourceType: 'reddit', primaryUrl: 'https://www.reddit.com/r/antinatalism/top' }), existing).duplicateStatus, 'platform_identity_duplicate');
});

test('same RSS feed → feed_duplicate; different feed same domain → allowed (none)', () => {
  const existing: ExistingSource[] = [{ id: 'f', name: 'CISA', homepageUrl: null, rssUrl: 'https://cisa.gov/advisories.xml', sourceType: 'rss_feed' }];
  assert.equal(detectDuplicate(cand({ sourceType: 'rss_feed', feedOrApiUrl: 'https://cisa.gov/advisories.xml' }), existing).duplicateStatus, 'feed_duplicate');
  assert.equal(detectDuplicate(cand({ sourceType: 'rss_feed', feedOrApiUrl: 'https://cisa.gov/alerts.xml' }), existing).duplicateStatus, 'none');
});

test('same website URL → exact_duplicate; platform domain-only never blocks', () => {
  const existing: ExistingSource[] = [{ id: 'w', name: 'Example', homepageUrl: 'https://example.com', rssUrl: null, sourceType: 'website' }];
  assert.equal(detectDuplicate(cand({ sourceType: 'website', primaryUrl: 'https://www.example.com/' }), existing).duplicateStatus, 'exact_duplicate');
  assert.ok(!blocksApproval('platform_domain_only_not_duplicate'));
});

test('duplicate reason shows existing vs candidate identity comparison', () => {
  const r = detectDuplicate(cand({ sourceType: 'youtube', primaryUrl: 'https://youtube.com/@BBCNews' }), ytExisting('@Reuters'));
  assert.match(r.duplicateReason ?? '', /Existing identity .* candidate identity .* →/);
  assert.ok(r.duplicateReason?.includes('youtube:@bbcnews'));
  assert.ok(r.duplicateReason?.includes('youtube:@reuters'));
});

// ---- import diagnostics (coded errors) -------------------------------------

test('validateRow emits coded error strings', () => {
  const missing = validateRow({ primary_url: 'https://x.com' });
  assert.ok(missing.errors.some((e) => e.startsWith('MISSING_REQUIRED_FIELD')));
  const badUrl = validateRow({ source_name: 'X', primary_url: 'ftp://x' });
  assert.ok(badUrl.errors.some((e) => e.startsWith('INVALID_URL')));
  const badType = validateRow({ source_name: 'X', primary_url: 'https://x.com', source_type: 'News Channel' });
  assert.ok(badType.errors.some((e) => e.startsWith('UNSUPPORTED_SOURCE_TYPE') && e.includes('Suggested')));
  const badRisk = validateRow({ source_name: 'X', primary_url: 'https://x.com', baseline_risk_1_5: '9' });
  assert.ok(badRisk.errors.some((e) => e.startsWith('BAD_RISK_SCORE')));
  const badInt = validateRow({ source_name: 'X', primary_url: 'https://x.com', capture_interval_minutes: '-3' });
  assert.ok(badInt.errors.some((e) => e.startsWith('BAD_INTERVAL')));
});
