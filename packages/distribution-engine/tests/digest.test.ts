import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  digestHasContent,
  generateDailyDigest,
  generateTopicDigest,
  generateWeeklyDigest,
} from '../src/digest';
import { DEMO_DIGEST_INPUT, FIXTURE_NOW } from '../src/fixtures';
import type { DigestInput } from '../src/types';

const NOW = FIXTURE_NOW;

test('daily digest surfaces sourced items', () => {
  const d = generateDailyDigest(DEMO_DIGEST_INPUT, { now: NOW });
  assert.equal(d.kind, 'daily');
  assert.ok(d.items.length > 0);
  assert.ok(d.items.every((i) => i.sourceRef.length > 0));
});

test('digest drops + counts unsourced entries', () => {
  const d = generateDailyDigest(DEMO_DIGEST_INPUT, { now: NOW });
  // one unsourced trust change in the fixture.
  assert.ok(d.droppedNoSource >= 1);
});

test('unpublished reports are never included', () => {
  const d = generateDailyDigest(DEMO_DIGEST_INPUT, { now: NOW });
  assert.ok(d.items.every((i) => i.slug !== 'unpublished-draft'));
});

test('digest covers every change kind', () => {
  const kinds = new Set(generateDailyDigest(DEMO_DIGEST_INPUT, { now: NOW }).items.map((i) => i.kind));
  assert.ok(kinds.has('new_report'));
  assert.ok(kinds.has('trust_change'));
  assert.ok(kinds.has('governance_action'));
  assert.ok(kinds.has('research_opportunity'));
});

test('weekly digest has a 7-day window', () => {
  const d = generateWeeklyDigest(DEMO_DIGEST_INPUT, { now: NOW });
  assert.equal(d.kind, 'weekly');
  const span = Date.parse(d.periodEnd) - Date.parse(d.periodStart);
  assert.equal(span, 7 * 86_400_000);
});

test('daily digest has a 24h window', () => {
  const d = generateDailyDigest(DEMO_DIGEST_INPUT, { now: NOW });
  const span = Date.parse(d.periodEnd) - Date.parse(d.periodStart);
  assert.equal(span, 86_400_000);
});

test('topic digest filters reports to the topic', () => {
  const d = generateTopicDigest('genetics', DEMO_DIGEST_INPUT, { now: NOW });
  assert.equal(d.kind, 'topic');
  assert.equal(d.topic, 'genetics');
  const reports = d.items.filter((i) => i.kind === 'new_report');
  assert.ok(reports.every((i) => i.slug === 'genetics-migration'));
});

test('empty input -> empty digest', () => {
  const d = generateDailyDigest({}, { now: NOW });
  assert.equal(d.items.length, 0);
  assert.equal(digestHasContent(d), false);
});

test('digestHasContent true when items present', () => {
  assert.equal(digestHasContent(generateDailyDigest(DEMO_DIGEST_INPUT, { now: NOW })), true);
});

test('generatedAt uses injected now', () => {
  const d = generateDailyDigest({}, { now: '2030-01-01T00:00:00.000Z' });
  assert.equal(d.generatedAt, '2030-01-01T00:00:00.000Z');
});

test('all items reference a source (never content without source)', () => {
  const input: DigestInput = {
    trustChanges: [
      { slug: 'a', title: 'sourced', detail: 'd', sourceRef: 'ref:1' },
      { slug: 'b', title: 'unsourced', detail: 'd' },
    ],
  };
  const d = generateDailyDigest(input, { now: NOW });
  assert.equal(d.items.length, 1);
  assert.equal(d.droppedNoSource, 1);
});

test('deterministic digest', () => {
  assert.deepEqual(generateDailyDigest(DEMO_DIGEST_INPUT, { now: NOW }), generateDailyDigest(DEMO_DIGEST_INPUT, { now: NOW }));
});
