import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  distributionByChannel,
  planDistribution,
} from '../src/distribution';
import { generateDailyDigest, generateTopicDigest, generateWeeklyDigest } from '../src/digest';
import { DEMO_DIGEST_INPUT, FIXTURE_NOW } from '../src/fixtures';
import type { Subscriber, SubscriptionPreferences } from '../src/types';

const NOW = FIXTURE_NOW;

function sub(id: string, active = true): Subscriber {
  return { id, email: `${id}@x.com`, type: 'RESEARCHER', active, createdAt: NOW };
}
function prefs(id: string, overrides: Partial<SubscriptionPreferences> = {}): SubscriptionPreferences {
  return {
    subscriberId: id, digestFrequency: 'daily', topics: [], notifyTrustChanges: true, notifyRetractions: true, channels: ['email'],
    ...overrides,
  };
}

const daily = () => generateDailyDigest(DEMO_DIGEST_INPUT, { now: NOW });
const weekly = () => generateWeeklyDigest(DEMO_DIGEST_INPUT, { now: NOW });

test('daily digest reaches daily subscribers', () => {
  const events = planDistribution(daily(), [{ subscriber: sub('a'), prefs: prefs('a', { digestFrequency: 'daily' }) }], { now: NOW });
  assert.equal(events.length, 1);
  assert.equal(events[0].subscriberId, 'a');
});

test('daily digest skips weekly subscribers', () => {
  const events = planDistribution(daily(), [{ subscriber: sub('a'), prefs: prefs('a', { digestFrequency: 'weekly' }) }], { now: NOW });
  assert.equal(events.length, 0);
});

test('weekly digest skips daily subscribers', () => {
  const events = planDistribution(weekly(), [{ subscriber: sub('a'), prefs: prefs('a', { digestFrequency: 'daily' }) }], { now: NOW });
  assert.equal(events.length, 0);
});

test('none cadence receives nothing', () => {
  const events = planDistribution(daily(), [{ subscriber: sub('a'), prefs: prefs('a', { digestFrequency: 'none' }) }], { now: NOW });
  assert.equal(events.length, 0);
});

test('inactive subscriber receives nothing', () => {
  const events = planDistribution(daily(), [{ subscriber: sub('a', false), prefs: prefs('a', { digestFrequency: 'daily' }) }], { now: NOW });
  assert.equal(events.length, 0);
});

test('multiple channels fan out one event each', () => {
  const events = planDistribution(daily(), [{ subscriber: sub('a'), prefs: prefs('a', { channels: ['email', 'webhook', 'rss'] }) }], { now: NOW });
  assert.equal(events.length, 3);
  assert.deepEqual(events.map((e) => e.channel).sort(), ['email', 'rss', 'webhook']);
});

test('events are sorted by subscriber then channel', () => {
  const events = planDistribution(daily(), [
    { subscriber: sub('b'), prefs: prefs('b', { channels: ['webhook', 'email'] }) },
    { subscriber: sub('a'), prefs: prefs('a', { channels: ['email'] }) },
  ], { now: NOW });
  assert.deepEqual(events.map((e) => `${e.subscriberId}:${e.channel}`), ['a:email', 'b:email', 'b:webhook']);
});

test('topic digest reaches followers of the topic', () => {
  const t = generateTopicDigest('genetics', DEMO_DIGEST_INPUT, { now: NOW });
  const events = planDistribution(t, [{ subscriber: sub('a'), prefs: prefs('a', { digestFrequency: 'weekly', topics: ['genetics'] }) }], { now: NOW });
  assert.ok(events.length >= 1);
});

test('topic digest skips non-followers', () => {
  const t = generateTopicDigest('genetics', DEMO_DIGEST_INPUT, { now: NOW });
  const events = planDistribution(t, [{ subscriber: sub('a'), prefs: prefs('a', { digestFrequency: 'weekly', topics: ['history'] }) }], { now: NOW });
  assert.equal(events.length, 0);
});

test('empty digest yields no events regardless of subscribers', () => {
  const empty = generateDailyDigest({}, { now: NOW });
  const events = planDistribution(empty, [{ subscriber: sub('a'), prefs: prefs('a') }], { now: NOW });
  assert.equal(events.length, 0);
});

test('every event is planned (worker performs send)', () => {
  const events = planDistribution(daily(), [{ subscriber: sub('a'), prefs: prefs('a') }], { now: NOW });
  assert.ok(events.every((e) => e.status === 'planned'));
});

test('event carries the digest item count', () => {
  const d = daily();
  const events = planDistribution(d, [{ subscriber: sub('a'), prefs: prefs('a') }], { now: NOW });
  assert.equal(events[0].itemCount, d.items.length);
});

test('distributionByChannel counts per channel', () => {
  const events = planDistribution(daily(), [
    { subscriber: sub('a'), prefs: prefs('a', { channels: ['email'] }) },
    { subscriber: sub('b'), prefs: prefs('b', { channels: ['email', 'webhook'] }) },
  ], { now: NOW });
  const counts = distributionByChannel(events);
  assert.equal(counts.email, 2);
  assert.equal(counts.webhook, 1);
});

test('no subscribers -> no events', () => {
  assert.deepEqual(planDistribution(daily(), [], { now: NOW }), []);
});

test('inputs not mutated', () => {
  const subs = [{ subscriber: sub('a'), prefs: prefs('a') }];
  planDistribution(daily(), subs, { now: NOW });
  assert.equal(subs.length, 1);
  assert.equal(subs[0].subscriber.active, true);
});

test('deterministic distribution planning', () => {
  const subs = [{ subscriber: sub('a'), prefs: prefs('a') }];
  assert.deepEqual(planDistribution(daily(), subs, { now: NOW }), planDistribution(daily(), subs, { now: NOW }));
});
