import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  agreementBand,
  canCurate,
  canResearch,
  canReview,
  challengeDecor,
  decisionDecor,
  demoConsensusBoard,
  demoConsensusDetail,
  demoContributorsBoard,
  demoDebatesBoard,
  demoInvestigationDetail,
  demoInvestigationsBoard,
  demoCollectiveHighlights,
  formatPct,
  formatScore,
  readDissent,
  readPositions,
  readStringArray,
  stateDecor,
} from './view';

// ---- role gating ------------------------------------------------------------
test('role gates', () => {
  assert.equal(canResearch('researcher'), true);
  assert.equal(canResearch('viewer'), false);
  assert.equal(canReview('reviewer'), true);
  assert.equal(canReview('researcher'), false);
  assert.equal(canCurate('curator'), true);
});

// ---- decorators -------------------------------------------------------------
test('stateDecor labels', () => {
  assert.equal(stateDecor('CONSENSUS_FORMING').tone, 'purple');
  assert.equal(stateDecor('PUBLISHED').tone, 'green');
  assert.equal(stateDecor(null).label, 'Unknown');
});

test('challengeDecor labels', () => {
  assert.equal(challengeDecor('upheld').tone, 'red');
  assert.equal(challengeDecor('rejected').tone, 'green');
  assert.equal(challengeDecor('open').tone, 'orange');
});

test('decisionDecor labels', () => {
  assert.equal(decisionDecor('approved').tone, 'green');
  assert.equal(decisionDecor('rejected').tone, 'red');
  assert.equal(decisionDecor('escalated').tone, 'orange');
  assert.equal(decisionDecor(null).label, 'Pending');
});

test('agreementBand thresholds', () => {
  assert.equal(agreementBand(0.8).tone, 'green');
  assert.equal(agreementBand(0.55).tone, 'orange');
  assert.equal(agreementBand(0.3).tone, 'red');
  assert.equal(agreementBand(null).label, 'No data');
});

// ---- formatters -------------------------------------------------------------
test('formatPct', () => {
  assert.equal(formatPct(0.7), '70%');
  assert.equal(formatPct(null), '—');
});

test('formatScore', () => {
  assert.equal(formatScore(73.4), '73');
  assert.equal(formatScore(null), '—');
  assert.equal(formatScore(150), '100');
});

test('readStringArray', () => {
  assert.deepEqual(readStringArray({ items: ['a'] }), ['a']);
  assert.deepEqual(readStringArray(['b']), ['b']);
  assert.deepEqual(readStringArray(null), []);
});

// ---- snapshot readers -------------------------------------------------------
test('readDissent + readPositions from a demo snapshot', () => {
  const d = demoConsensusDetail();
  const dissent = readDissent(d.snapshot);
  const positions = readPositions(d.snapshot);
  assert.ok(positions.length >= 1);
  assert.ok(dissent.every((r) => r.position.length > 0));
});

test('readDissent handles missing snapshot', () => {
  assert.deepEqual(readDissent(undefined), []);
  assert.deepEqual(readPositions(undefined), []);
});

// ---- demo builders ----------------------------------------------------------
test('demoInvestigationsBoard has a row', () => {
  const d = demoInvestigationsBoard();
  assert.equal(d.rows.length, 1);
  assert.equal(d.rows[0].state, 'ACTIVE');
});

test('demoInvestigationDetail has findings + snapshot + metrics', () => {
  const d = demoInvestigationDetail();
  assert.ok(d.findings.length >= 3);
  assert.ok(d.snapshot);
  assert.ok(d.metrics.findingCount >= 3);
  assert.ok(d.progress >= 0 && d.progress <= 1);
});

test('demoConsensusBoard has snapshots + reviews', () => {
  const d = demoConsensusBoard();
  assert.ok(d.snapshots.length >= 1);
  assert.equal(d.reviews[0].decision, 'approved');
});

test('demoConsensusDetail has the consensus position', () => {
  const d = demoConsensusDetail();
  assert.equal(d.snapshot?.consensus_position, 'Earlier settlement');
});

test('demoContributorsBoard has explainable scores', () => {
  const d = demoContributorsBoard();
  assert.ok(d.scores.length >= 2);
  assert.ok(readStringArray(d.scores[0].explanation).length > 0);
});

test('demoDebatesBoard has claims + challenges', () => {
  const d = demoDebatesBoard();
  assert.ok(d.claims.length >= 1);
  assert.ok(d.challenges.length >= 1);
});

test('demoCollectiveHighlights shape', () => {
  const h = demoCollectiveHighlights();
  assert.ok((h.activeInvestigations ?? 0) >= 0);
  assert.ok((h.majorDisputes ?? 0) >= 0);
});

test('demo builders deterministic', () => {
  assert.deepEqual(demoInvestigationsBoard(), demoInvestigationsBoard());
  assert.deepEqual(demoConsensusDetail(), demoConsensusDetail());
  assert.deepEqual(demoContributorsBoard(), demoContributorsBoard());
});

test('demo investigation detail dissent is shown', () => {
  const d = demoInvestigationDetail();
  const dissent = readDissent(d.snapshot);
  assert.ok(dissent.length >= 1);
});

test('contributor demo overall in range', () => {
  const d = demoContributorsBoard();
  for (const s of d.scores) assert.ok((s.overall ?? 0) >= 0 && (s.overall ?? 0) <= 100);
});
