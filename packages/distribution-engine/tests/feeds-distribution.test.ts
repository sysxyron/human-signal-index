import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildJsonFeed, buildRssFeed, buildWebhookPayload, onlyPublished } from '../src/feeds';
import { distributionByChannel, planDistribution } from '../src/distribution';
import { generateDailyDigest, generateWeeklyDigest } from '../src/digest';
import {
  DEMO_DIGEST_INPUT,
  DEMO_PUBLISHED,
  DEMO_SUBSCRIBERS,
  FIXTURE_NOW,
} from '../src/fixtures';

const NOW = FIXTURE_NOW;

// ---- feeds ------------------------------------------------------------------

test('onlyPublished filters drafts', () => {
  const pub = onlyPublished(DEMO_PUBLISHED);
  assert.ok(pub.every((i) => i.published));
  assert.equal(pub.length, 2);
});

test('RSS feed excludes unpublished items', () => {
  const feed = buildRssFeed(DEMO_PUBLISHED, { now: NOW });
  assert.equal(feed.format, 'rss');
  assert.equal(feed.itemCount, 2);
  assert.ok(!feed.body.includes('unpublished-draft'));
  assert.ok(feed.body.includes('<rss'));
});

test('RSS escapes XML', () => {
  const feed = buildRssFeed(
    [{ id: 'x', slug: 's', title: 'A & B <c>', summary: 'd', topics: [], publishedAt: NOW, published: true, sourceRef: 'r' }],
    { now: NOW },
  );
  assert.ok(feed.body.includes('A &amp; B &lt;c&gt;'));
});

test('RSS includes trust score', () => {
  const feed = buildRssFeed(DEMO_PUBLISHED, { now: NOW });
  assert.ok(/trust \d+\/100/.test(feed.body));
});

test('JSON feed excludes unpublished items', () => {
  const feed = buildJsonFeed(DEMO_PUBLISHED, { now: NOW });
  assert.equal(feed.format, 'json');
  assert.equal(feed.itemCount, 2);
  const parsed = JSON.parse(feed.body);
  assert.equal(parsed.items.length, 2);
  assert.ok(parsed.items.every((i: { id: string }) => i.id !== 'pub-draft'));
});

test('JSON feed carries trust + source in _hsi', () => {
  const feed = buildJsonFeed(DEMO_PUBLISHED, { now: NOW });
  const parsed = JSON.parse(feed.body);
  assert.ok(parsed.items[0]._hsi.sourceRef);
});

test('webhook payload shape', () => {
  const p = buildWebhookPayload('publication.published', { id: 'pub-1' }, { now: NOW });
  assert.equal(p.event, 'publication.published');
  assert.equal(p.at, NOW);
  assert.deepEqual(p.data, { id: 'pub-1' });
});

test('empty publish set -> empty feed', () => {
  assert.equal(buildRssFeed([], { now: NOW }).itemCount, 0);
  assert.equal(buildJsonFeed([], { now: NOW }).itemCount, 0);
});

// ---- distribution -----------------------------------------------------------

test('plan distributes a daily digest to daily subscribers only', () => {
  const daily = generateDailyDigest(DEMO_DIGEST_INPUT, { now: NOW });
  const events = planDistribution(daily, DEMO_SUBSCRIBERS, { now: NOW });
  // sub-1 (daily, email) gets it; sub-2 is weekly; sub-3 inactive.
  assert.ok(events.every((e) => e.subscriberId === 'sub-1'));
  assert.ok(events.length >= 1);
});

test('inactive subscribers are never distributed to', () => {
  const daily = generateDailyDigest(DEMO_DIGEST_INPUT, { now: NOW });
  const events = planDistribution(daily, DEMO_SUBSCRIBERS, { now: NOW });
  assert.ok(events.every((e) => e.subscriberId !== 'sub-3'));
});

test('weekly digest reaches weekly subscribers', () => {
  const weekly = generateWeeklyDigest(DEMO_DIGEST_INPUT, { now: NOW });
  const events = planDistribution(weekly, DEMO_SUBSCRIBERS, { now: NOW });
  // sub-2 weekly with email + webhook channels.
  assert.ok(events.some((e) => e.subscriberId === 'sub-2' && e.channel === 'webhook'));
});

test('empty digest -> no distribution', () => {
  const empty = generateDailyDigest({}, { now: NOW });
  assert.deepEqual(planDistribution(empty, DEMO_SUBSCRIBERS, { now: NOW }), []);
});

test('distribution events are planned (worker performs send)', () => {
  const daily = generateDailyDigest(DEMO_DIGEST_INPUT, { now: NOW });
  const events = planDistribution(daily, DEMO_SUBSCRIBERS, { now: NOW });
  assert.ok(events.every((e) => e.status === 'planned'));
});

test('distributionByChannel counts', () => {
  const weekly = generateWeeklyDigest(DEMO_DIGEST_INPUT, { now: NOW });
  const events = planDistribution(weekly, DEMO_SUBSCRIBERS, { now: NOW });
  const counts = distributionByChannel(events);
  assert.ok((counts.email ?? 0) >= 1);
});

test('deterministic distribution', () => {
  const daily = generateDailyDigest(DEMO_DIGEST_INPUT, { now: NOW });
  assert.deepEqual(planDistribution(daily, DEMO_SUBSCRIBERS, { now: NOW }), planDistribution(daily, DEMO_SUBSCRIBERS, { now: NOW }));
});
