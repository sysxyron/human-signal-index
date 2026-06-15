import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SOURCE_TYPES, isSourceType, SOURCE_HEALTH_STATES } from '../src/types';
import { validateSource, normalizeSourceInput } from '../src/validate';
import { connectorForSourceType, supportsAutomatedCapture, isFoundationType, signalTypeForSource } from '../src/routing';
import { isSpotifyUrl, isRedditUrl, isRedditRssUrl, extractSubreddit, redditFeedUrl, looksLikeRssUrl, looksLikeRssXml } from '../src/detectors';
import { extractReadableText, normalizeContent, snapshotFromContent, diffSnapshots } from '../src/watchlist';
import { captureRss, captureReddit, captureWatchlistSource, captureForType, createSignalFromCapture } from '../src/capture';
import { deriveHealth, healthMessage } from '../src/health';
import { RECOMMENDED_SOURCES } from '../src/seeds';
import type { FetchText } from '@hsi/source-connectors';

const AT = '2026-06-15T00:00:00.000Z';
const fetchOf = (body: string): FetchText => async () => body;

// ---- source-type catalog ----------------------------------------------------

test('catalog includes existing + Phase-40 types', () => {
  for (const t of ['website', 'rss', 'youtube', 'podcast', 'document', 'manual']) assert.ok(isSourceType(t));
  for (const t of ['news', 'research', 'reddit', 'social', 'government', 'watchlist', 'email', 'api', 'webhook', 'archive', 'intelligence_feed']) assert.ok(isSourceType(t));
  assert.ok(!isSourceType('telepathy'));
  assert.equal(SOURCE_TYPES.length, 19);
  assert.equal(SOURCE_HEALTH_STATES.length, 6);
});

// ---- detectors --------------------------------------------------------------

test('detectors recognize spotify / reddit / rss', () => {
  assert.ok(isSpotifyUrl('https://open.spotify.com/show/abc'));
  assert.ok(isRedditUrl('https://www.reddit.com/r/antinatalism/'));
  assert.ok(!isRedditRssUrl('https://www.reddit.com/r/antinatalism/'));
  assert.ok(isRedditRssUrl('https://www.reddit.com/r/antinatalism/.rss'));
  assert.equal(extractSubreddit('https://www.reddit.com/r/antinatalism/'), 'antinatalism');
  assert.equal(extractSubreddit('r/Futurology'), 'Futurology');
  assert.equal(extractSubreddit('antinatalism'), 'antinatalism');
  assert.equal(redditFeedUrl('antinatalism'), 'https://www.reddit.com/r/antinatalism/.rss');
  assert.ok(looksLikeRssUrl('https://example.org/feed'));
  assert.ok(looksLikeRssUrl('https://export.arxiv.org/rss/cs.AI'));
  assert.ok(!looksLikeRssUrl('https://example.org/about'));
  assert.ok(looksLikeRssXml('<?xml version="1.0"?><rss version="2.0"><channel><item></item></channel></rss>'));
});

// ---- routing ----------------------------------------------------------------

test('routing maps types to connectors + signal types', () => {
  assert.equal(connectorForSourceType('news'), 'rss');
  assert.equal(connectorForSourceType('reddit'), 'rss');
  assert.equal(connectorForSourceType('watchlist'), 'public_page');
  assert.equal(connectorForSourceType('website'), 'public_page');
  assert.equal(connectorForSourceType('api'), null);
  assert.equal(connectorForSourceType('webhook'), null);
  assert.ok(supportsAutomatedCapture('news'));
  assert.ok(!supportsAutomatedCapture('manual'));
  assert.ok(isFoundationType('api'));
  assert.equal(signalTypeForSource('reddit'), 'forum_post');
  assert.equal(signalTypeForSource('news'), 'article');
  assert.equal(signalTypeForSource('podcast'), 'podcast_episode');
});

// ---- validation: RSS / spotify / reddit -------------------------------------

test('validateSource: valid RSS feed normalizes', () => {
  const r = validateSource({ sourceType: 'rss', rssUrl: 'https://example.org/feed.xml' });
  assert.ok(r.ok);
  assert.equal(r.normalized?.connector, 'rss');
  assert.equal(r.normalized?.captureUrl, 'https://example.org/feed.xml');
});

test('validateSource: non-RSS reddit page rejected with .rss suggestion', () => {
  const r = validateSource({ sourceType: 'rss', rssUrl: 'https://www.reddit.com/r/antinatalism/' });
  assert.equal(r.ok, false);
  assert.match(r.issues[0].message, /Reddit page, not an RSS feed/);
  assert.match(r.issues[0].suggestion ?? '', /\.rss/);
});

test('validateSource: plain non-feed URL rejected', () => {
  const r = validateSource({ sourceType: 'rss', rssUrl: 'https://example.org/about' });
  assert.equal(r.ok, false);
  assert.match(r.issues[0].message, /does not look like an RSS\/Atom feed/);
});

test('validateSource: podcast rejects Spotify with the exact guidance', () => {
  const r = validateSource({ sourceType: 'podcast', rssUrl: 'https://open.spotify.com/show/xyz' });
  assert.equal(r.ok, false);
  assert.match(r.issues[0].message, /Spotify pages are not podcast RSS feeds\. Add the podcast RSS feed or use manual monitoring\./);
});

test('validateSource: reddit type normalizes subreddit → .rss', () => {
  const r = validateSource({ sourceType: 'reddit', subreddit: 'r/antinatalism' });
  assert.ok(r.ok);
  assert.equal(r.normalized?.captureUrl, 'https://www.reddit.com/r/antinatalism/.rss');
  assert.equal(r.normalized?.config.subreddit, 'antinatalism');
});

test('validateSource: watchlist requires URL + carries interval/selector', () => {
  assert.equal(validateSource({ sourceType: 'watchlist' }).ok, false);
  const r = validateSource({ sourceType: 'watchlist', url: 'https://proextinction.com', captureIntervalMinutes: 720, contentSelector: 'main' });
  assert.ok(r.ok);
  assert.equal(r.normalized?.connector, 'public_page');
  assert.equal(r.normalized?.config.captureIntervalMinutes, 720);
  assert.equal(r.normalized?.config.contentSelector, 'main');
});

test('validateSource: government accepts feed OR page; api foundation-only', () => {
  assert.equal(validateSource({ sourceType: 'government', rssUrl: 'https://agency.gov/feed.xml' }).normalized?.connector, 'rss');
  assert.equal(validateSource({ sourceType: 'government', homepageUrl: 'https://agency.gov/news' }).normalized?.connector, 'public_page');
  const api = validateSource({ sourceType: 'api', url: 'https://api.example.org/v1/items', apiMethod: 'get' });
  assert.ok(api.ok);
  assert.equal(api.normalized?.connector, null);
  assert.equal(api.normalized?.config.apiMethod, 'GET');
});

test('validateSource: unknown type rejected; normalizeSourceInput returns null on invalid', () => {
  assert.equal(validateSource({ sourceType: 'nope' }).ok, false);
  assert.equal(normalizeSourceInput({ sourceType: 'rss', rssUrl: 'not-a-url' }), null);
});

// ---- watchlist hashing + diffing --------------------------------------------

test('extractReadableText strips tags + scripts; normalizeContent stabilizes', () => {
  const html = '<html><head><style>x{}</style><script>evil()</script></head><body><h1>Manifesto</h1><p>We&amp;believe</p></body></html>';
  const text = normalizeContent(extractReadableText(html));
  assert.match(text, /Manifesto/);
  assert.match(text, /We&believe/);
  assert.ok(!/evil\(\)/.test(text));
});

test('snapshot + diff: unchanged vs changed content', async () => {
  const a = await snapshotFromContent('https://x.test', '<p>hello world</p>', AT);
  const b = await snapshotFromContent('https://x.test', '<p>hello world</p>', AT);
  const c = await snapshotFromContent('https://x.test', '<p>hello world and more</p>', AT);
  assert.equal(a.contentHash, b.contentHash);
  assert.notEqual(a.contentHash, c.contentHash);
  const first = diffSnapshots(null, a);
  assert.equal(first.changed, true); // no previous → changed
  const same = diffSnapshots({ contentHash: a.contentHash, length: a.text.length }, b);
  assert.equal(same.changed, false);
  const changed = diffSnapshots({ contentHash: a.contentHash, length: a.text.length }, c);
  assert.equal(changed.changed, true);
  assert.ok(changed.addedChars > 0);
});

// ---- capture engines (offline via injected fetch) ---------------------------

const RSS_XML = `<?xml version="1.0"?><rss version="2.0"><channel>
  <item><title>AI breakthrough</title><link>https://news.test/a</link><description>Big news</description><pubDate>2026-06-14</pubDate></item>
  <item><title>Population study</title><link>https://news.test/b</link><description>Findings</description></item>
</channel></rss>`;

const REDDIT_ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
  <entry><title>Why I think X</title><link href="https://www.reddit.com/r/antinatalism/comments/1/"/><author><name>/u/someone</name></author><updated>2026-06-14T10:00:00Z</updated><content>post body</content></entry>
</feed>`;

test('captureRss parses items + hashes content', async () => {
  const cap = await captureRss('https://news.test/feed.xml', { capturedAt: AT, fetchText: fetchOf(RSS_XML) });
  assert.equal(cap.connector, 'rss');
  assert.equal(cap.items.length, 2);
  assert.equal(cap.items[0].title, 'AI breakthrough');
  assert.ok(cap.hashDigest.length > 0);
  assert.equal(cap.capturedAt, AT);
});

test('captureReddit extracts author/title/url/timestamp', async () => {
  const cap = await captureReddit('https://www.reddit.com/r/antinatalism/.rss', { capturedAt: AT, fetchText: fetchOf(REDDIT_ATOM) });
  assert.equal(cap.sourceType, 'reddit');
  assert.equal(cap.items.length, 1);
  assert.equal(cap.items[0].title, 'Why I think X');
  assert.equal(cap.items[0].author, '/u/someone');
  assert.match(cap.items[0].url ?? '', /reddit\.com\/r\/antinatalism/);
  assert.equal(cap.items[0].publishedAt, '2026-06-14T10:00:00Z');
});

test('captureForType routes; watchlist captures page text; foundation throws', async () => {
  const news = await captureForType('news', 'https://news.test/feed.xml', { capturedAt: AT, fetchText: fetchOf(RSS_XML) });
  assert.equal(news.items.length, 2);
  const wl = await captureForType('watchlist', 'https://proextinction.com', { capturedAt: AT, fetchText: fetchOf('<body><p>Extinction is good</p></body>') });
  assert.equal(wl.connector, 'public_page');
  assert.match(wl.content, /Extinction is good/);
  await assert.rejects(() => captureForType('manual', 'https://x', { capturedAt: AT, fetchText: fetchOf('') }), /does not support automated capture/);
});

test('createSignalFromCapture maps to a draft signal (status new)', async () => {
  const cap = await captureRss('https://news.test/feed.xml', { capturedAt: AT, fetchText: fetchOf(RSS_XML) });
  const draft = createSignalFromCapture('src-1', cap);
  assert.equal(draft.source_id, 'src-1');
  assert.equal(draft.status, 'new');
  assert.equal(draft.signal_type, 'article');
  assert.equal(draft.title, 'AI breakthrough');
  assert.equal(draft.content_hash, cap.hashDigest);
});

// ---- health messages --------------------------------------------------------

test('deriveHealth: clear reasons per state', () => {
  assert.equal(deriveHealth({ sourceType: 'rss', disabled: true }).state, 'disabled');
  assert.equal(deriveHealth({ sourceType: 'api' }).state, 'unsupported');
  assert.equal(deriveHealth({ sourceType: 'rss', configured: false }).state, 'needs_configuration');
  assert.equal(deriveHealth({ sourceType: 'rss', configured: true, blocked: true }).state, 'failing');
  assert.equal(deriveHealth({ sourceType: 'rss', configured: true, fetchOk: false, consecutiveFailures: 1 }).state, 'warning');
  assert.equal(deriveHealth({ sourceType: 'rss', configured: true, fetchOk: false, consecutiveFailures: 5 }).state, 'failing');
  const ok = deriveHealth({ sourceType: 'rss', configured: true, fetchOk: true, contentChanged: false });
  assert.equal(ok.state, 'healthy');
  assert.match(ok.reason, /no content change/i);
  assert.ok(healthMessage('failing').length > 0);
});

// ---- seeds ------------------------------------------------------------------

test('recommended seeds are public + disabled by default', () => {
  assert.equal(RECOMMENDED_SOURCES.length, 5);
  assert.ok(RECOMMENDED_SOURCES.every((s) => !s.enabledByDefault));
  assert.ok(RECOMMENDED_SOURCES.every((s) => /^https:\/\//.test(s.url)));
  assert.ok(RECOMMENDED_SOURCES.some((s) => s.sourceType === 'watchlist'));
  assert.ok(RECOMMENDED_SOURCES.some((s) => s.sourceType === 'reddit'));
});
