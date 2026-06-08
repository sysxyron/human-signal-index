import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifySignal } from '../src/classify';

const NOW = '2026-01-01T00:00:00.000Z';

test('classifySignal: maps extinctionism text to extinction', () => {
  const c = classifySignal(
    {
      title: 'Extinctionism and voluntary human extinction',
      bodyText: 'The movement embraces efilism, antinatalism and promortalism.',
      sourceType: 'website',
    },
    NOW,
  );
  assert.equal(c.signalCategory, 'extinction');
  assert.equal(c.signalType, 'article');
  assert.ok(c.confidence > 0.5, `confidence ${c.confidence}`);
  assert.ok(c.rationale.length > 0);
});

test('classifySignal: preserves uncertainty => other low confidence', () => {
  const c = classifySignal(
    { title: 'My weekend baking recipes', bodyText: 'flour sugar butter eggs whisk', sourceType: 'website' },
    NOW,
  );
  assert.equal(c.signalCategory, 'other');
  assert.ok(c.confidence <= 0.2, `confidence ${c.confidence}`);
  assert.deepEqual(c.alternativeCategories, []);
});

test('classifySignal: infers signalType from sourceType', () => {
  assert.equal(classifySignal({ title: 'x', sourceType: 'youtube' }, NOW).signalType, 'video');
  assert.equal(classifySignal({ title: 'x', sourceType: 'rss' }, NOW).signalType, 'rss_item');
  assert.equal(classifySignal({ title: 'x', sourceType: 'forum' }, NOW).signalType, 'forum_post');
});

test('classifySignal: supports unlimited custom categories', () => {
  const c = classifySignal(
    {
      title: 'A discussion of fluxweaving among practitioners',
      bodyText: 'fluxweaving is everywhere fluxweaving',
      sourceType: 'website',
      extraCategories: ['fluxweaving'],
    },
    NOW,
  );
  assert.equal(c.signalCategory, 'fluxweaving');
});

test('classifySignal: provides alternativeCategories when multiple match', () => {
  const c = classifySignal(
    {
      title: 'Population reduction and societal collapse',
      bodyText: 'depopulation, overpopulation, civilizational collapse, doomer',
      sourceType: 'website',
    },
    NOW,
  );
  assert.ok(c.alternativeCategories.length >= 1);
});
