import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FIXTURE_NOW, publishedFixture, publishingDemo, seedPublication } from '../src/fixtures';

test('seedPublication is a DRAFT', () => {
  assert.equal(seedPublication().state, 'DRAFT');
});

test('publishedFixture reaches PUBLISHED', () => {
  assert.equal(publishedFixture().state, 'PUBLISHED');
});

test('publishingDemo runs the full chain', () => {
  const out = publishingDemo();
  assert.equal(out.now, FIXTURE_NOW);
  assert.equal(out.published.state, 'PUBLISHED');
  assert.equal(out.gate.canPublish, true);
  assert.equal(out.review.decision, 'approved');
  assert.equal(out.report.sections.length, 12);
  assert.equal(out.retracted.state, 'RETRACTED');
});

test('demo retraction is a trust collapse', () => {
  const out = publishingDemo();
  assert.equal(out.retraction.reason, 'trust_collapse');
});

test('demo report is fully sourced', () => {
  const out = publishingDemo();
  assert.ok(out.report.sourceRefs.length > 0);
});

test('publishingDemo is deterministic', () => {
  assert.deepEqual(publishingDemo(), publishingDemo());
});
