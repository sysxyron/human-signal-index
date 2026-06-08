import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectChange, diffRssFeeds } from '../src/monitor';
import { parseRssFeed } from '../src/capture/rssProvider';
import type { CapturedDoc, RssItem } from '../src/types';

const NOW = '2026-01-01T00:00:00.000Z';

function doc(bodyText: string, contentHash: string): CapturedDoc {
  return { bodyText, contentHash, capturedAt: NOW };
}

test('detectChange: first observation => new', () => {
  const r = detectChange(null, doc('hello world this is a body', 'h1'));
  assert.equal(r.changeType, 'new');
  assert.equal(r.changed, true);
});

test('detectChange: identical hash => none', () => {
  const before = doc('the quick brown fox jumps', 'same');
  const after = doc('the quick brown fox jumps', 'same');
  const r = detectChange(before, after);
  assert.equal(r.changeType, 'none');
  assert.equal(r.changed, false);
  assert.equal(r.similarity, 1);
});

test('detectChange: small edit => modified', () => {
  const before = doc(
    'the quick brown fox jumps over the lazy dog near the river bank today',
    'h-before',
  );
  const after = doc(
    'the quick brown fox jumps over the lazy dog near the river bank tomorrow',
    'h-after',
  );
  const r = detectChange(before, after);
  assert.equal(r.changeType, 'modified');
  assert.equal(r.changed, true);
  assert.ok(r.similarity >= 0.6 && r.similarity < 1, `similarity ${r.similarity}`);
});

test('detectChange: full rewrite => major', () => {
  const before = doc('alpha beta gamma delta epsilon zeta eta theta', 'h-before');
  const after = doc('completely different unrelated words about gardening tomatoes', 'h-after');
  const r = detectChange(before, after);
  assert.equal(r.changeType, 'major');
  assert.ok(r.similarity < 0.6, `similarity ${r.similarity}`);
});

test('diffRssFeeds: added / removed / changed', () => {
  const before: RssItem[] = parseRssFeed(`<rss><channel>
    <item><title>One</title><guid>a</guid><description>first</description></item>
    <item><title>Two</title><guid>b</guid><description>second</description></item>
  </channel></rss>`);
  const after: RssItem[] = parseRssFeed(`<rss><channel>
    <item><title>One changed</title><guid>a</guid><description>first edited</description></item>
    <item><title>Three</title><guid>c</guid><description>third</description></item>
  </channel></rss>`);
  const diff = diffRssFeeds(before, after);
  assert.deepEqual(diff.added.map((i) => i.id), ['c']);
  assert.deepEqual(diff.removed.map((i) => i.id), ['b']);
  assert.deepEqual(diff.changed.map((i) => i.id), ['a']);
});
