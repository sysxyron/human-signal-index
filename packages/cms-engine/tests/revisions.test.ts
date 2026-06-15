import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRevision, rollbackRevision, summariseChange } from '../src/revisions';
import { searchContent } from '../src/search';
import { demoDraft } from '../src/fixtures';
import type { PageDraft, SearchableItem } from '../src/types';

test('createRevision snapshots immutably (later edits do not mutate it)', () => {
  const rev = createRevision(demoDraft, { id: 'r1', author: 'admin', changeSummary: 'init', at: '2026-06-14T00:00:00Z' });
  // mutate the original draft's block content
  demoDraft.blocks[0].content.heading = 'MUTATED';
  assert.notEqual(rev.snapshot.blocks[0].content.heading, 'MUTATED');
  // restore for other tests
  demoDraft.blocks[0].content.heading = 'Signal over noise';
});

test('rollbackRevision returns a fresh DRAFT (never auto-published)', () => {
  const published: PageDraft = { page: { ...demoDraft.page, status: 'published' }, blocks: demoDraft.blocks };
  const rev = createRevision(published, { id: 'r2', author: 'admin', changeSummary: 'snap', at: 't' });
  const restored = rollbackRevision(rev);
  assert.equal(restored.page.status, 'draft');
  assert.equal(restored.blocks.length, published.blocks.length);
});

test('rollback is independent of the revision snapshot (deep copy)', () => {
  const rev = createRevision(demoDraft, { id: 'r3', author: 'admin', changeSummary: 's', at: 't' });
  const restored = rollbackRevision(rev);
  restored.blocks[0].content.heading = 'CHANGED';
  assert.notEqual(rev.snapshot.blocks[0].content.heading, 'CHANGED');
});

test('summariseChange describes diffs', () => {
  assert.equal(summariseChange(null, demoDraft), 'Created page.');
  const prev: PageDraft = { page: { ...demoDraft.page, status: 'draft' }, blocks: demoDraft.blocks };
  const next: PageDraft = { page: { ...demoDraft.page, status: 'published' }, blocks: [...demoDraft.blocks, { id: 'z', type: 'divider', position: 9, content: {} }] };
  const s = summariseChange(prev, next);
  assert.ok(s.includes('status→published'));
  assert.ok(s.includes('+1 block'));
});

test('searchContent matches title + text, filters by kind', () => {
  const items: SearchableItem[] = [
    { kind: 'page', id: 'p1', title: 'Home', text: 'signal intelligence' },
    { kind: 'media', id: 'm1', title: 'logo.png', text: 'brand asset' },
    { kind: 'block', id: 'b1', title: 'Hero', text: 'signal over noise' },
  ];
  assert.equal(searchContent(items, 'signal').length, 2);
  assert.equal(searchContent(items, 'signal', ['page']).length, 1);
  assert.equal(searchContent(items, '').length, 3);
  assert.equal(searchContent(items, 'brand', ['page']).length, 0);
});
