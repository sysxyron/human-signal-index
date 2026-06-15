import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SITE_BLOCK_DEFS, SITE_BLOCK_TYPES, isSiteBlockType, defaultSiteBlockContent, validateSiteBlock } from '../src/blocks';
import { validateBlocks, serializeBlocks, deserializeBlocks, normalizeBlocks } from '../src/serialize';
import { demoSiteBlocks } from '../src/fixtures';
import type { SiteBlock } from '../src/types';

test('10 block types defined with fields', () => {
  assert.equal(SITE_BLOCK_DEFS.length, 10);
  assert.equal(SITE_BLOCK_TYPES.length, 10);
  assert.ok(isSiteBlockType('report_feed'));
  assert.ok(!isSiteBlockType('nope'));
  for (const d of SITE_BLOCK_DEFS) assert.ok(d.fields.length >= 1, d.type);
});

test('defaultSiteBlockContent gives an editable shape per type', () => {
  for (const t of SITE_BLOCK_TYPES) assert.equal(typeof defaultSiteBlockContent(t), 'object');
  assert.deepEqual(Object.keys(defaultSiteBlockContent('cta')).sort(), ['href', 'label']);
});

// ---- validation ------------------------------------------------------------
test('hero needs headline; CTA label needs link', () => {
  assert.ok(validateSiteBlock({ id: 'h', type: 'hero', position: 0, content: {} }).length > 0);
  assert.ok(validateSiteBlock({ id: 'h', type: 'hero', position: 0, content: { headline: 'x', ctaLabel: 'Go' } }).some((i) => i.field === 'ctaHref'));
  assert.equal(validateSiteBlock({ id: 'h', type: 'hero', position: 0, content: { headline: 'x' } }).length, 0);
});

test('image needs valid url + alt; cta needs valid href', () => {
  assert.ok(validateSiteBlock({ id: 'i', type: 'image', position: 0, content: { url: 'not-a-url', alt: '' } }).length >= 2);
  assert.equal(validateSiteBlock({ id: 'i', type: 'image', position: 0, content: { url: '/logo.png', alt: 'Logo' } }).length, 0);
  assert.ok(validateSiteBlock({ id: 'c', type: 'cta', position: 0, content: { label: 'Go', href: 'javascript:1' } }).some((x) => x.field === 'href'));
});

test('statistic/testimonial/report_feed validation', () => {
  assert.ok(validateSiteBlock({ id: 's', type: 'statistic', position: 0, content: {} }).length >= 2);
  assert.equal(validateSiteBlock({ id: 's', type: 'statistic', position: 0, content: { value: '96%', label: 'Trace' } }).length, 0);
  assert.ok(validateSiteBlock({ id: 'r', type: 'report_feed', position: 0, content: { limit: 0 } }).length > 0);
  assert.ok(validateSiteBlock({ id: 'r', type: 'report_feed', position: 0, content: { limit: 100 } }).length > 0);
  assert.equal(validateSiteBlock({ id: 'r', type: 'report_feed', position: 0, content: { limit: 5 } }).length, 0);
});

test('validateBlocks: demo set is valid; duplicate positions flagged', () => {
  assert.equal(validateBlocks(demoSiteBlocks).ok, true);
  const dup: SiteBlock[] = [
    { id: 'a', type: 'cta', position: 0, content: { label: 'x', href: '/a' } },
    { id: 'b', type: 'cta', position: 0, content: { label: 'y', href: '/b' } },
  ];
  assert.ok(validateBlocks(dup).issues.some((i) => i.message.includes('Duplicate block position')));
});

// ---- serialization ---------------------------------------------------------
test('serialize → deserialize round-trips + sorts by position', () => {
  const json = serializeBlocks(demoSiteBlocks);
  const back = deserializeBlocks(json);
  assert.equal(back.length, demoSiteBlocks.length);
  assert.deepEqual(back.map((b) => b.position), [0, 1, 2, 3, 4]);
  assert.equal(back[0].type, 'hero');
});

test('deserialize drops unknown types + bad json', () => {
  assert.deepEqual(deserializeBlocks('not json'), []);
  const mixed = JSON.stringify([{ id: 'x', type: 'bogus', position: 0, content: {} }, { id: 'y', type: 'cta', position: 1, content: { label: 'a', href: '/a' } }]);
  const out = deserializeBlocks(mixed);
  assert.equal(out.length, 1);
  assert.equal(out[0].type, 'cta');
  assert.equal(out[0].position, 0); // renumbered
});

test('normalizeBlocks renumbers to 0..n-1', () => {
  const out = normalizeBlocks([{ id: 'a', type: 'cta', position: 9, content: {} }, { id: 'b', type: 'cta', position: 3, content: {} }]);
  assert.deepEqual(out.map((b) => b.position), [0, 1]);
  assert.deepEqual(out.map((b) => b.id), ['b', 'a']);
});
