// =============================================================================
// HSI Phase 41B.3 — CMS SEO mapper (E) + publish validation (F) tests.
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cmsSeoToMetadata } from './seo';
import { validatePage } from '@hsi/cms-engine';
import type { CmsBlock } from '@hsi/cms-engine';

// ---- E: SEO mapper ---------------------------------------------------------

const FALLBACK = { title: 'About', description: 'Default about description.', path: '/about' };

test('cmsSeoToMetadata falls back to defaults when CMS SEO is absent', () => {
  const m = cmsSeoToMetadata(undefined, FALLBACK);
  assert.equal(m.title, 'About');
  assert.equal(m.description, 'Default about description.');
  assert.deepEqual(m.alternates, { canonical: '/about' });
  assert.equal(m.robots, undefined); // indexable by default
});

test('cmsSeoToMetadata: CMS values override, og + canonical + noindex applied', () => {
  const m = cmsSeoToMetadata(
    { title: 'Custom Title', description: 'Custom desc', canonical: '/custom', ogImage: 'https://x/og.png', noindex: true, keywords: ['a', 'b'] },
    FALLBACK,
  );
  assert.equal(m.title, 'Custom Title');
  assert.equal(m.description, 'Custom desc');
  assert.deepEqual(m.alternates, { canonical: '/custom' });
  assert.deepEqual(m.robots, { index: false, follow: false });
  assert.deepEqual(m.keywords, ['a', 'b']);
  const og = m.openGraph as { title?: string; images?: Array<{ url: string }> };
  assert.equal(og.title, 'Custom Title'); // ogTitle falls back to title
  assert.equal(og.images?.[0]?.url, 'https://x/og.png');
});

// ---- F: publish validation rejects malformed pages -------------------------

const validBlock: CmsBlock = { id: 'b1', type: 'rich_text', position: 0, content: { markdown: 'Hello world content.' } };

test('validatePage accepts a well-formed page', () => {
  const res = validatePage({ page: { id: 'p1', slug: 'about', pageType: 'content', title: 'About', status: 'draft' }, blocks: [validBlock] });
  assert.equal(res.ok, true);
});

test('validatePage rejects empty blocks, missing title, and bad slug', () => {
  assert.equal(validatePage({ page: { id: 'p', slug: 'about', pageType: 'content', title: 'About', status: 'draft' }, blocks: [] }).ok, false);
  assert.equal(validatePage({ page: { id: 'p', slug: 'about', pageType: 'content', title: '', status: 'draft' }, blocks: [validBlock] }).ok, false);
  assert.equal(validatePage({ page: { id: 'p', slug: 'Bad Slug!', pageType: 'content', title: 'About', status: 'draft' }, blocks: [validBlock] }).ok, false);
});

test('validatePage rejects duplicate block positions', () => {
  const dup: CmsBlock[] = [
    { id: 'a', type: 'rich_text', position: 0, content: { markdown: 'one' } },
    { id: 'b', type: 'rich_text', position: 0, content: { markdown: 'two' } },
  ];
  assert.equal(validatePage({ page: { id: 'p', slug: 'about', pageType: 'content', title: 'About', status: 'draft' }, blocks: dup }).ok, false);
});
