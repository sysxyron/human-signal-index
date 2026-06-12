import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FIXTURE_NOW, distributionDemo } from '../src/fixtures';

test('distributionDemo runs the full chain', () => {
  const out = distributionDemo();
  assert.equal(out.now, FIXTURE_NOW);
  assert.ok(out.daily.items.length > 0);
  assert.equal(out.rss.itemCount, 2);
  assert.equal(out.json.itemCount, 2);
  assert.equal(out.webhook.event, 'digest.generated');
  assert.ok(out.distribution.length >= 1);
});

test('demo topic digest is for genetics', () => {
  const out = distributionDemo();
  assert.equal(out.topic.topic, 'genetics');
});

test('demo distribution only targets active subscribers', () => {
  const out = distributionDemo();
  assert.ok(out.distribution.every((e) => e.subscriberId !== 'sub-3'));
});

test('distributionDemo is deterministic', () => {
  assert.deepEqual(distributionDemo(), distributionDemo());
});
