import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildJsonFeed, buildRssFeed, buildWebhookPayload, onlyPublished } from '../src/feeds';
import { generateDailyDigest, generateTopicDigest, generateWeeklyDigest, digestHasContent } from '../src/digest';
import { DEMO_DIGEST_INPUT, DEMO_PUBLISHED, FIXTURE_NOW } from '../src/fixtures';
import type { PublishedItem } from '../src/types';

const NOW = FIXTURE_NOW;

function item(id: string, published: boolean, topics: string[] = []): PublishedItem {
  return { id, slug: id, title: `Title ${id}`, summary: 'sum', trustScore: 70, topics, publishedAt: NOW, published, sourceRef: `pub:${id}` };
}

// ---- feeds gate -------------------------------------------------------------

test('onlyPublished excludes all drafts', () => {
  const items = [item('a', true), item('b', false), item('c', true)];
  assert.deepEqual(onlyPublished(items).map((i) => i.id), ['a', 'c']);
});

test('RSS never leaks an unpublished item', () => {
  const feed = buildRssFeed([item('pub', true), item('draft', false)], { now: NOW });
  assert.ok(feed.body.includes('pub'));
  assert.ok(!feed.body.includes('>Title draft<'));
  assert.equal(feed.itemCount, 1);
});

test('JSON never leaks an unpublished item', () => {
  const feed = buildJsonFeed([item('pub', true), item('draft', false)], { now: NOW });
  const parsed = JSON.parse(feed.body);
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].id, 'pub');
});

test('RSS content type is rss+xml', () => {
  assert.match(buildRssFeed(DEMO_PUBLISHED, { now: NOW }).contentType, /rss\+xml/);
});

test('JSON content type is feed+json', () => {
  assert.match(buildJsonFeed(DEMO_PUBLISHED, { now: NOW }).contentType, /feed\+json/);
});

test('RSS includes categories per item', () => {
  const feed = buildRssFeed([item('a', true, ['history', 'genetics'])], { now: NOW });
  assert.ok(feed.body.includes('<category>history</category>'));
  assert.ok(feed.body.includes('<category>genetics</category>'));
});

test('RSS uses the provided baseUrl', () => {
  const feed = buildRssFeed([item('a', true)], { now: NOW, baseUrl: 'https://x.test/' });
  assert.ok(feed.body.includes('https://x.test/intelligence/a'));
});

test('JSON home_page_url respects baseUrl', () => {
  const feed = buildJsonFeed([item('a', true)], { now: NOW, baseUrl: 'https://x.test' });
  const parsed = JSON.parse(feed.body);
  assert.equal(parsed.home_page_url, 'https://x.test/intelligence');
});

test('JSON _hsi carries trust + sourceRef', () => {
  const feed = buildJsonFeed([item('a', true)], { now: NOW });
  const parsed = JSON.parse(feed.body);
  assert.equal(parsed.items[0]._hsi.trustScore, 70);
  assert.equal(parsed.items[0]._hsi.sourceRef, 'pub:a');
});

test('RSS escapes special characters', () => {
  const feed = buildRssFeed([{ ...item('a', true), title: 'A<b>&"c"' }], { now: NOW });
  assert.ok(feed.body.includes('A&lt;b&gt;&amp;'));
});

test('webhook payloads for each event type', () => {
  for (const e of ['publication.published', 'publication.retracted', 'digest.generated'] as const) {
    const p = buildWebhookPayload(e, { x: 1 }, { now: NOW });
    assert.equal(p.event, e);
    assert.deepEqual(p.data, { x: 1 });
  }
});

test('empty feeds are valid + zero count', () => {
  assert.equal(buildRssFeed([], { now: NOW }).itemCount, 0);
  assert.ok(buildRssFeed([], { now: NOW }).body.includes('<rss'));
  assert.equal(buildJsonFeed([], { now: NOW }).itemCount, 0);
});

test('deterministic feeds', () => {
  assert.deepEqual(buildRssFeed(DEMO_PUBLISHED, { now: NOW }), buildRssFeed(DEMO_PUBLISHED, { now: NOW }));
  assert.deepEqual(buildJsonFeed(DEMO_PUBLISHED, { now: NOW }), buildJsonFeed(DEMO_PUBLISHED, { now: NOW }));
});

// ---- digest gate ------------------------------------------------------------

test('digest never includes an unsourced entry', () => {
  const d = generateDailyDigest({ trustChanges: [{ slug: 'a', title: 'no source', detail: 'd' }] }, { now: NOW });
  assert.equal(d.items.length, 0);
  assert.equal(d.droppedNoSource, 1);
});

test('digest never includes an unpublished report', () => {
  const d = generateDailyDigest({ newReports: [item('a', false)] }, { now: NOW });
  assert.equal(d.items.length, 0);
});

test('weekly window differs from daily window', () => {
  const day = generateDailyDigest(DEMO_DIGEST_INPUT, { now: NOW });
  const week = generateWeeklyDigest(DEMO_DIGEST_INPUT, { now: NOW });
  assert.notEqual(day.periodStart, week.periodStart);
});

test('topic digest only carries topic reports', () => {
  const input = { newReports: [item('a', true, ['history']), item('b', true, ['genetics'])] };
  const d = generateTopicDigest('history', input, { now: NOW });
  const reportItems = d.items.filter((i) => i.kind === 'new_report');
  assert.equal(reportItems.length, 1);
  assert.equal(reportItems[0].slug, 'a');
});

test('digestHasContent reflects items', () => {
  assert.equal(digestHasContent(generateDailyDigest({}, { now: NOW })), false);
  assert.equal(digestHasContent(generateDailyDigest({ newReports: [item('a', true)] }, { now: NOW })), true);
});

test('every digest item carries a non-empty sourceRef', () => {
  const d = generateDailyDigest(DEMO_DIGEST_INPUT, { now: NOW });
  assert.ok(d.items.every((i) => i.sourceRef.length > 0));
});
