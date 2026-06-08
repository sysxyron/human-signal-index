import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRssFeed } from '../src/capture/rssProvider';
import { DEMO_RSS_XML } from '../src/fixtures';

test('parseRssFeed: parses RSS 2.0 items', () => {
  const items = parseRssFeed(DEMO_RSS_XML);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'Why societal collapse is now inevitable');
  assert.equal(items[0].id, 'cw-inevitable');
  assert.ok(items[0].link?.includes('collapse-watch.example.org'));
  assert.ok(items[0].contentHash.startsWith('fnv1a-'));
});

test('parseRssFeed: parses Atom entries with href links + CDATA', () => {
  const atom = `<feed xmlns="http://www.w3.org/2005/Atom">
    <entry>
      <title><![CDATA[Atom Title]]></title>
      <link href="https://example.org/atom-1"/>
      <summary>summary text</summary>
      <id>atom-1</id>
      <updated>2025-01-01T00:00:00Z</updated>
    </entry>
  </feed>`;
  const items = parseRssFeed(atom);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Atom Title');
  assert.equal(items[0].link, 'https://example.org/atom-1');
  assert.equal(items[0].id, 'atom-1');
});

test('parseRssFeed: empty feed => []', () => {
  assert.deepEqual(parseRssFeed('<rss><channel></channel></rss>'), []);
});

test('parseRssFeed: stable hashes are deterministic', () => {
  const a = parseRssFeed(DEMO_RSS_XML);
  const b = parseRssFeed(DEMO_RSS_XML);
  assert.deepEqual(a.map((i) => i.contentHash), b.map((i) => i.contentHash));
});
