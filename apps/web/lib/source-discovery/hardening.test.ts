import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeSourceUrl, getPlatformIdentity, getSourceIdentityKey, detectDuplicate } from './duplicates';
import { validateRow } from './csv';
import { blocksApproval, requiresConfirmation, type CandidateInput, type ExistingSource } from './types';

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
