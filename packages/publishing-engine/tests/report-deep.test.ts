import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildIntelligenceReport, isFullySourced } from '../src/report';
import { FIXTURE_NOW } from '../src/fixtures';
import type { ReportInput } from '../src/types';

const NOW = FIXTURE_NOW;

const SECTION_KEYS = [
  'executive_summary', 'evidence', 'temporal', 'causal', 'counterfactual',
  'decision', 'outcome', 'calibration', 'trust', 'governance', 'limitations', 'provenance',
];

function full(): ReportInput {
  return {
    publicationId: 'p', title: 'Full report', summary: 'A complete report.',
    evidence: ['Stratigraphy', 'Radiocarbon'], temporal: 'Earlier by 120y', causal: 'Trade expansion',
    counterfactual: 'Prior chronology stands', decision: 'Update timeline', outcome: 'Past forecasts under-predicted',
    calibration: 'ECE 6%', trust: 'Trust 78', governance: 'Cleared',
    limitations: ['Small sample'], provenance: ['Derived from strat survey'], sourceRefs: ['ev:1', 'ev:2'],
  };
}

test('every section key present and in order', () => {
  const r = buildIntelligenceReport(full(), { now: NOW });
  assert.deepEqual(r.sections.map((s) => s.key), SECTION_KEYS);
});

test('each section has a title + body', () => {
  const r = buildIntelligenceReport(full(), { now: NOW });
  for (const s of r.sections) {
    assert.ok(s.title.length > 0);
    assert.ok(s.body.length > 0);
  }
});

test('fully-supplied + sourced report isFullySourced', () => {
  assert.equal(isFullySourced(buildIntelligenceReport(full(), { now: NOW })), true);
});

test('evidence section preserves items', () => {
  const r = buildIntelligenceReport(full(), { now: NOW });
  assert.deepEqual(r.sections.find((s) => s.key === 'evidence')!.items, ['Stratigraphy', 'Radiocarbon']);
});

test('limitations always present even when omitted', () => {
  const r = buildIntelligenceReport({ publicationId: 'p', title: 't' }, { now: NOW });
  const lim = r.sections.find((s) => s.key === 'limitations')!;
  assert.ok(lim.items && lim.items.length >= 1);
  assert.equal(lim.sourced, true);
});

test('provenance always present even when omitted', () => {
  const r = buildIntelligenceReport({ publicationId: 'p', title: 't' }, { now: NOW });
  const prov = r.sections.find((s) => s.key === 'provenance')!;
  assert.ok(prov.items && prov.items.length >= 1);
});

test('provenance derived from sourceRefs when not given', () => {
  const r = buildIntelligenceReport({ publicationId: 'p', title: 't', sourceRefs: ['src:a', 'src:b'] }, { now: NOW });
  const prov = r.sections.find((s) => s.key === 'provenance')!;
  assert.ok(prov.items!.some((i) => /src:a/.test(i)));
});

test('unsourced sections flagged sourced=false', () => {
  const r = buildIntelligenceReport({ publicationId: 'p', title: 't', summary: 's' }, { now: NOW });
  const exec = r.sections.find((s) => s.key === 'executive_summary')!;
  assert.equal(exec.sourced, false);
});

test('missing optional section becomes a caveat', () => {
  const r = buildIntelligenceReport({ publicationId: 'p', title: 't', sourceRefs: ['x'] }, { now: NOW });
  for (const key of ['temporal', 'causal', 'counterfactual', 'decision', 'outcome', 'calibration']) {
    const sec = r.sections.find((s) => s.key === key)!;
    assert.match(sec.body, /Not available/);
  }
});

test('sourceRefs echoed', () => {
  const r = buildIntelligenceReport(full(), { now: NOW });
  assert.deepEqual(r.sourceRefs, ['ev:1', 'ev:2']);
});

test('generatedAt uses injected now', () => {
  const r = buildIntelligenceReport(full(), { now: '2031-01-01T00:00:00.000Z' });
  assert.equal(r.generatedAt, '2031-01-01T00:00:00.000Z');
});

test('publicationId + title carried', () => {
  const r = buildIntelligenceReport(full(), { now: NOW });
  assert.equal(r.publicationId, 'p');
  assert.equal(r.title, 'Full report');
});

test('twelve sections exactly', () => {
  assert.equal(buildIntelligenceReport(full(), { now: NOW }).sections.length, 12);
});

test('deterministic deep report', () => {
  assert.deepEqual(buildIntelligenceReport(full(), { now: NOW }), buildIntelligenceReport(full(), { now: NOW }));
});

test('inputs not mutated', () => {
  const input = full();
  const before = JSON.stringify(input);
  buildIntelligenceReport(input, { now: NOW });
  assert.equal(JSON.stringify(input), before);
});

test('trust section defaults to a trust note when omitted but sourced', () => {
  const r = buildIntelligenceReport({ publicationId: 'p', title: 't', trust: 'Trust 80', sourceRefs: ['x'] }, { now: NOW });
  const trust = r.sections.find((s) => s.key === 'trust')!;
  assert.match(trust.body, /Trust 80/);
});
