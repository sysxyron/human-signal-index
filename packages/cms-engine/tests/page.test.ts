import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildPage, validatePage, canTransition, canPublish, normalizePositions, PAGE_TRANSITIONS } from '../src/page';
import { BLOCK_TYPES, defaultBlockContent, validateBlock, isBlockType } from '../src/blocks';
import { demoDraft } from '../src/fixtures';
import type { CmsBlock, PageDraft } from '../src/types';

test('8 block types; defaults + type guard', () => {
  assert.equal(BLOCK_TYPES.length, 8);
  assert.ok(isBlockType('hero'));
  assert.ok(!isBlockType('nope'));
  assert.deepEqual(Object.keys(defaultBlockContent('cta')).sort(), ['href', 'label']);
});

test('buildPage orders blocks by position + fills SEO from title', () => {
  const draft: PageDraft = { page: { ...demoDraft.page, seo: {} }, blocks: [
    { id: 'x', type: 'divider', position: 2, content: {} },
    { id: 'y', type: 'divider', position: 0, content: {} },
  ] };
  const built = buildPage(draft);
  assert.deepEqual(built.blocks.map((b) => b.id), ['y', 'x']);
  assert.equal(built.seo.title, draft.page.title);
  assert.ok(built.seo.description.length > 0);
});

test('state machine: draft→review→published→archived; archived→draft', () => {
  assert.ok(canTransition('draft', 'review'));
  assert.ok(canTransition('review', 'published'));
  assert.ok(canTransition('published', 'archived'));
  assert.ok(canTransition('archived', 'draft'));
  assert.ok(!canTransition('archived', 'published'));
  assert.ok(!canTransition('draft', 'draft'));
  for (const from of Object.keys(PAGE_TRANSITIONS)) assert.ok(!PAGE_TRANSITIONS[from as keyof typeof PAGE_TRANSITIONS].includes(from as never));
});

test('validatePage: complete demo draft is publish-ready', () => {
  const v = validatePage(demoDraft);
  assert.equal(v.ok, true);
  // canPublish needs a non-published status (published→published is not a transition)
  assert.ok(canPublish({ page: { ...demoDraft.page, status: 'draft' }, blocks: demoDraft.blocks }));
});

test('validatePage flags empty title, bad slug, no blocks', () => {
  const v = validatePage({ page: { ...demoDraft.page, title: '', slug: 'Bad Slug' }, blocks: [] });
  assert.equal(v.ok, false);
  assert.ok(v.issues.some((i) => i.field === 'title'));
  assert.ok(v.issues.some((i) => i.field === 'slug'));
  assert.ok(v.issues.some((i) => i.message.includes('at least one block')));
});

test('validatePage flags duplicate block positions', () => {
  const blocks: CmsBlock[] = [
    { id: 'a', type: 'rich_text', position: 0, content: { markdown: 'x' } },
    { id: 'b', type: 'rich_text', position: 0, content: { markdown: 'y' } },
  ];
  const v = validatePage({ page: demoDraft.page, blocks });
  assert.ok(v.issues.some((i) => i.message.includes('Duplicate block position')));
});

test('block validation: hero needs heading; image needs url+alt; cta needs label+href', () => {
  assert.ok(validateBlock({ id: 'h', type: 'hero', position: 0, content: {} }).length > 0);
  assert.ok(validateBlock({ id: 'i', type: 'image', position: 0, content: { url: '' } }).length >= 2);
  assert.equal(validateBlock({ id: 'c', type: 'cta', position: 0, content: { label: 'Go', href: '/x' } }).length, 0);
});

test('normalizePositions produces 0..n-1', () => {
  const out = normalizePositions([
    { id: 'a', type: 'divider', position: 5, content: {} },
    { id: 'b', type: 'divider', position: 2, content: {} },
  ]);
  assert.deepEqual(out.map((b) => b.position), [0, 1]);
  assert.deepEqual(out.map((b) => b.id), ['b', 'a']);
});

test('cannot publish an invalid page', () => {
  assert.equal(canPublish({ page: { ...demoDraft.page, status: 'draft' }, blocks: [] }), false);
});
