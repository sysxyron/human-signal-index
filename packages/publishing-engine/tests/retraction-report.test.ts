import { test } from 'node:test';
import assert from 'node:assert/strict';

import { RetractionError, retractPublication, retractionReasonLabel } from '../src/retraction';
import { buildIntelligenceReport, isFullySourced } from '../src/report';
import { transitionPublication } from '../src/states';
import { FIXTURE_NOW, seedPublication } from '../src/fixtures';
import type { Publication, RetractionReason } from '../src/types';

const NOW = FIXTURE_NOW;

function published(): Publication {
  let p = seedPublication();
  for (const to of ['UNDER_REVIEW', 'APPROVED', 'PUBLISHED'] as const) {
    const res = transitionPublication(p, to, { now: NOW });
    if (res.ok) p = res.publication;
  }
  return p;
}

// ---- retraction -------------------------------------------------------------

test('retract a published publication', () => {
  const { publication, retraction } = retractPublication(
    published(),
    { reason: 'evidence_error', detail: 'A source was misread.', retractedBy: 'alice' },
    { now: NOW },
  );
  assert.equal(publication.state, 'RETRACTED');
  assert.equal(retraction.reason, 'evidence_error');
  assert.equal(retraction.previousState, 'PUBLISHED');
});

test('retraction preserves history (visible, never deleted)', () => {
  const { publication } = retractPublication(
    published(),
    { reason: 'trust_collapse', detail: 'Trust fell.', retractedBy: 'alice' },
    { now: NOW },
  );
  // The full event trail is preserved + a retraction event appended.
  assert.ok(publication.events.length >= 5);
  assert.equal(publication.events[publication.events.length - 1].to, 'RETRACTED');
});

test('retraction requires an actor', () => {
  assert.throws(
    () => retractPublication(published(), { reason: 'evidence_error', detail: 'x', retractedBy: '' }, { now: NOW }),
    RetractionError,
  );
});

test('retraction requires a detail', () => {
  assert.throws(
    () => retractPublication(published(), { reason: 'evidence_error', detail: '  ', retractedBy: 'a' }, { now: NOW }),
    RetractionError,
  );
});

test('cannot retract a DRAFT', () => {
  assert.throws(
    () => retractPublication(seedPublication(), { reason: 'evidence_error', detail: 'x', retractedBy: 'a' }, { now: NOW }),
    RetractionError,
  );
});

test('all retraction reasons have labels', () => {
  const reasons: RetractionReason[] = ['evidence_error', 'trust_collapse', 'governance_decision', 'data_quality_issue', 'methodology_issue'];
  for (const r of reasons) assert.ok(retractionReasonLabel(r).length > 0);
});

test('retraction reason appears in the event', () => {
  const { publication } = retractPublication(
    published(),
    { reason: 'methodology_issue', detail: 'Flawed method.', retractedBy: 'a' },
    { now: NOW },
  );
  assert.match(publication.events[publication.events.length - 1].reason, /Methodology issue/);
});

// ---- report builder ---------------------------------------------------------

test('report has all 12 sections', () => {
  const r = buildIntelligenceReport({ publicationId: 'p', title: 't' }, { now: NOW });
  assert.equal(r.sections.length, 12);
  const keys = r.sections.map((s) => s.key);
  for (const k of ['executive_summary', 'evidence', 'temporal', 'causal', 'counterfactual', 'decision', 'outcome', 'calibration', 'trust', 'governance', 'limitations', 'provenance']) {
    assert.ok(keys.includes(k), `missing ${k}`);
  }
});

test('limitations + provenance always populated', () => {
  const r = buildIntelligenceReport({ publicationId: 'p', title: 't' }, { now: NOW });
  const lim = r.sections.find((s) => s.key === 'limitations')!;
  const prov = r.sections.find((s) => s.key === 'provenance')!;
  assert.ok(lim.items && lim.items.length > 0);
  assert.ok(prov.items && prov.items.length > 0);
});

test('missing sections become explicit caveats', () => {
  const r = buildIntelligenceReport({ publicationId: 'p', title: 't' }, { now: NOW });
  const causal = r.sections.find((s) => s.key === 'causal')!;
  assert.match(causal.body, /Not available/);
});

test('sourced sections flagged when sources present', () => {
  const r = buildIntelligenceReport(
    { publicationId: 'p', title: 't', summary: 's', sourceRefs: ['ev:1'] },
    { now: NOW },
  );
  const exec = r.sections.find((s) => s.key === 'executive_summary')!;
  assert.equal(exec.sourced, true);
});

test('unsourced report flags provenance gap', () => {
  const r = buildIntelligenceReport({ publicationId: 'p', title: 't', summary: 's' }, { now: NOW });
  const prov = r.sections.find((s) => s.key === 'provenance')!;
  assert.match(prov.items!.join(' '), /not supplied|cannot be fully traced/i);
});

test('evidence items carried through', () => {
  const r = buildIntelligenceReport(
    { publicationId: 'p', title: 't', evidence: ['a', 'b'], sourceRefs: ['ev:1'] },
    { now: NOW },
  );
  const ev = r.sections.find((s) => s.key === 'evidence')!;
  assert.deepEqual(ev.items, ['a', 'b']);
});

test('isFullySourced true when sourced', () => {
  const r = buildIntelligenceReport(
    { publicationId: 'p', title: 't', summary: 's', evidence: ['a'], temporal: 'x', causal: 'x', counterfactual: 'x', decision: 'x', outcome: 'x', calibration: 'x', trust: 'x', governance: 'x', sourceRefs: ['ev:1'] },
    { now: NOW },
  );
  assert.equal(isFullySourced(r), true);
});

test('deterministic report', () => {
  assert.deepEqual(
    buildIntelligenceReport({ publicationId: 'p', title: 't', summary: 's', sourceRefs: ['x'] }, { now: NOW }),
    buildIntelligenceReport({ publicationId: 'p', title: 't', summary: 's', sourceRefs: ['x'] }, { now: NOW }),
  );
});
