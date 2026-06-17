// =============================================================================
// HSI Phase 41B.3A — bespoke page guard tests. PURE.
//
// Proves that for the platform-owned pages (Home, About) the template ALWAYS
// renders across the full CMS lifecycle — publish, edit, rollback — and that
// only approved slots are taken from CMS. Generic/malformed blocks can never
// replace the layout (usesTemplate stays true; no raw blocks leak).
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isBespokePage, extractBespokeSlots, resolveBespokeContent, type BlockLike } from './bespoke';

// Lifecycle fixtures: each is the "published page" a render would receive.
const published = {
  blocks: [
    { type: 'hero', content: { heading: 'Published heading', subheading: 'Published subheading' } },
    { type: 'rich_text', content: { markdown: 'extra body that must never replace the layout' } },
    { type: 'card_grid', content: { cards: [{ title: 'x', body: 'y' }] } },
  ] as BlockLike[],
};
const edited = {
  blocks: [
    { type: 'hero', content: { heading: 'Edited heading', subheading: 'Edited subheading' } },
    { type: 'cta', content: { label: 'Go', href: '/x' } },
  ] as BlockLike[],
};
const rolledBack = published; // rollback restores an earlier snapshot
const malformed = {
  blocks: [
    { type: 'rich_text', content: 'not-an-object' },
    { type: 'unknown_block' },
    null as unknown as BlockLike,
    { content: { heading: 'no type here' } },
  ] as BlockLike[],
};

test('isBespokePage flags only platform-owned slugs', () => {
  assert.equal(isBespokePage('home'), true);
  assert.equal(isBespokePage('about'), true);
  assert.equal(isBespokePage('trust'), false);
  assert.equal(isBespokePage('faq'), false);
});

test('extractBespokeSlots reads only the hero slots; ignores extra blocks', () => {
  const slots = extractBespokeSlots(published.blocks);
  assert.deepEqual(slots, { heroHeading: 'Published heading', heroSubheading: 'Published subheading' });
  // No leakage of rich_text / card_grid content into slots.
  assert.equal(Object.keys(slots).length, 2);
});

test('extractBespokeSlots never throws on malformed / empty input', () => {
  assert.deepEqual(extractBespokeSlots(malformed.blocks), {}); // hero with no usable strings
  assert.deepEqual(extractBespokeSlots([]), {});
  assert.deepEqual(extractBespokeSlots(null), {});
  assert.deepEqual(extractBespokeSlots(undefined), {});
});

// ---- About lifecycle: template always renders --------------------------------

for (const [stage, page] of [
  ['draft / unpublished (null)', null],
  ['publish', published],
  ['edit', edited],
  ['rollback', rolledBack],
  ['malformed publish', malformed],
] as const) {
  test(`About survives ${stage} without layout corruption`, () => {
    const r = resolveBespokeContent('about', page);
    assert.equal(r.usesTemplate, true); // hardcoded About template always wins
    // Only approved slot keys are ever present.
    for (const k of Object.keys(r.slots)) assert.ok(k === 'heroHeading' || k === 'heroSubheading', k);
  });

  test(`Home survives ${stage} without layout corruption`, () => {
    const r = resolveBespokeContent('home', page);
    assert.equal(r.usesTemplate, true); // flagship Home template always wins
    for (const k of Object.keys(r.slots)) assert.ok(k === 'heroHeading' || k === 'heroSubheading', k);
  });
}

test('publish then edit then rollback keeps the template every step', () => {
  const sequence = [published, edited, rolledBack];
  for (const page of sequence) {
    assert.equal(resolveBespokeContent('about', page).usesTemplate, true);
    assert.equal(resolveBespokeContent('home', page).usesTemplate, true);
  }
  // Rollback restores the published hero slots exactly.
  assert.deepEqual(resolveBespokeContent('about', rolledBack).slots, { heroHeading: 'Published heading', heroSubheading: 'Published subheading' });
});

test('non-bespoke slugs do not force the template (CMS may render blocks)', () => {
  const r = resolveBespokeContent('faq', published);
  assert.equal(r.usesTemplate, false);
});
