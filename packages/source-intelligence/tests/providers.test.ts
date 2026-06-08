import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  captureRss,
  captureWebsite,
  captureYouTube,
  capturePodcast,
  captureForum,
  captureViaProvider,
  createProviders,
  makeProviderRunLog,
  isChallengePage,
  type ProviderDeps,
} from '../src/providers';

const NOW = '2026-01-01T00:00:00.000Z';

/** Build a fixture fetch that returns the given body for any url. */
function fixtureFetch(body: string, ok = true, status = 200): typeof fetch {
  return (async () =>
    ({
      ok,
      status,
      // No streaming body → http wrapper falls back to text() + byte cap.
      text: async () => body,
      json: async () => JSON.parse(body),
    }) as unknown as Response) as unknown as typeof fetch;
}

const RSS_XML = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title>Alpha narrative emerges</title>
    <link>https://example.org/a</link>
    <description>First public item about a narrative.</description>
    <pubDate>Mon, 01 Jan 2026 00:00:00 GMT</pubDate>
    <guid>a</guid>
  </item>
  <item>
    <title>Beta follow-up</title>
    <link>https://example.org/b</link>
    <description>Second public item.</description>
    <guid>b</guid>
  </item>
  <item>
    <title>Alpha narrative emerges</title>
    <link>https://example.org/a</link>
    <description>Duplicate of the first (same canonical url).</description>
    <guid>a-dupe</guid>
  </item>
</channel></rss>`;

test('captureRss: parses + normalizes + dedupes by canonical url', async () => {
  const deps: ProviderDeps = { now: NOW, fetchImpl: fixtureFetch(RSS_XML) };
  const res = await captureRss('https://example.org/feed.xml', deps);
  assert.ok(res.ok, 'rss capture ok');
  if (!res.ok) return;
  assert.equal(res.method, 'rss');
  // Three items in, but two share canonical url https://example.org/a → 2 out.
  assert.equal(res.data.length, 2);
  assert.equal(res.data[0].title, 'Alpha narrative emerges');
  assert.equal(res.data[0].canonicalUrl, 'https://example.org/a');
  assert.ok(res.data[0].contentHash.length > 0);
});

test('captureWebsite: normal HTML → ok with extracted title/body', async () => {
  const html =
    '<html><head><title>Public Page</title>' +
    '<meta name="description" content="A public article."></head>' +
    '<body><p>Hello public world about narratives.</p></body></html>';
  const deps: ProviderDeps = { now: NOW, fetchImpl: fixtureFetch(html) };
  const res = await captureWebsite('https://example.org/page', deps);
  assert.ok(res.ok, 'website capture ok');
  if (!res.ok) return;
  assert.equal(res.method, 'website');
  assert.equal(res.data.title, 'Public Page');
  assert.equal(res.data.summary, 'A public article.');
  assert.match(res.data.bodyText ?? '', /Hello public world/);
});

test('captureWebsite: Cloudflare "Just a moment..." → reason blocked', async () => {
  const challenge =
    '<html><head><title>Just a moment...</title></head><body>' +
    '<div class="cf-browser-verification">Checking if the site connection is secure.' +
    ' Enable JavaScript and cookies to continue.</div></body></html>';
  const deps: ProviderDeps = { now: NOW, fetchImpl: fixtureFetch(challenge) };
  const res = await captureWebsite('https://example.org/protected', deps);
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.reason, 'blocked');
  assert.ok(isChallengePage(challenge));
});

test('captureWebsite: policy violation on login URL → policy_violation (no fetch)', async () => {
  let called = false;
  const f = (async () => {
    called = true;
    return { ok: true, status: 200, text: async () => '' } as unknown as Response;
  }) as unknown as typeof fetch;
  const res = await captureWebsite('https://example.org/login', { now: NOW, fetchImpl: f });
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.reason, 'policy_violation');
  assert.equal(called, false, 'must not touch network on a private URL');
});

test('captureYouTube: no apiKey → provider_not_configured', async () => {
  const res = await captureYouTube({ videoId: 'abc' }, { now: NOW });
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.reason, 'provider_not_configured');
});

test('capturePodcast: no keys + no feedUrl → provider_not_configured', async () => {
  const res = await capturePodcast({}, { now: NOW });
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.reason, 'provider_not_configured');
});

test('capturePodcast: public feedUrl fallback delegates to rss', async () => {
  const deps = { now: NOW, fetchImpl: fixtureFetch(RSS_XML) };
  const res = await capturePodcast({ feedUrl: 'https://example.org/feed.xml' }, deps);
  assert.ok(res.ok, 'podcast feed fallback ok');
  if (!res.ok) return;
  assert.equal(res.data.title, 'Alpha narrative emerges');
});

test('captureForum: no feedUrl → provider_not_configured (no private scraping)', async () => {
  const res = await captureForum({}, { now: NOW });
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.reason, 'provider_not_configured');
});

test('captureViaProvider: routes rss + records a run log', async () => {
  const deps: ProviderDeps = { now: NOW, fetchImpl: fixtureFetch(RSS_XML) };
  const result = await captureViaProvider('rss', { url: 'https://example.org/feed.xml' }, deps);
  const log = makeProviderRunLog({
    provider: 'rss',
    sourceId: 'src-1',
    startedAt: NOW,
    finishedAt: NOW,
    result,
  });
  assert.equal(log.ok, true);
  assert.equal(log.itemCount, 2);
  assert.match(log.note ?? '', /method=rss/);
});

test('createProviders: bound set forwards into providers', async () => {
  const providers = createProviders({ now: NOW, fetchImpl: fixtureFetch(RSS_XML) });
  const res = await providers.rss('https://example.org/feed.xml');
  assert.ok(res.ok);
});
