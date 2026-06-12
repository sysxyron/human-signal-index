import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildDailyIntelligenceReport, buildExecutiveSnapshot, generateExecutiveReport, rankStrategicPriorities } from '../src/snapshot';
import { buildUnifiedSystemState } from '../src/unified';
import { DEMO_INPUTS, FIXTURE_NOW } from '../src/fixtures';

const NOW = FIXTURE_NOW;
const STATE = buildUnifiedSystemState(DEMO_INPUTS, { now: NOW });

test('rankStrategicPriorities derives from all sources', () => {
  const p = rankStrategicPriorities(STATE);
  const kinds = new Set(p.map((x) => x.kind));
  assert.ok(kinds.has('warning'));
  assert.ok(kinds.has('consensus'));
  assert.ok(kinds.has('forecast'));
  assert.ok(kinds.has('trust'));
  assert.ok(kinds.has('governance'));
  assert.ok(kinds.has('opportunity'));
});

test('priorities ranked high→low with sequential ranks', () => {
  const p = rankStrategicPriorities(STATE);
  for (let i = 0; i < p.length; i++) assert.equal(p[i].rank, i + 1);
  for (let i = 1; i < p.length; i++) assert.ok(p[i - 1].score >= p[i].score);
});

test('contentious investigation surfaces as priority', () => {
  const p = rankStrategicPriorities(STATE);
  assert.ok(p.some((x) => x.kind === 'investigation'));
});

test('snapshot assembles all sections', () => {
  const s = buildExecutiveSnapshot(STATE, { now: NOW });
  assert.ok(s.strategicPriorities.length > 0);
  assert.ok(s.operationalRisks.length > 0);
  assert.ok(s.opportunities.length > 0);
  assert.ok(s.attention.index >= 0);
  assert.equal(s.governanceQueue.length, 3);
  assert.equal(s.generatedAt, NOW);
});

test('snapshot forecast counts', () => {
  const s = buildExecutiveSnapshot(STATE, { now: NOW });
  assert.equal(s.forecasts.active, 2);
  assert.equal(s.forecasts.failing, 1);
  assert.ok(s.forecasts.avgConfidence > 0);
});

test('snapshot warnings counts', () => {
  const s = buildExecutiveSnapshot(STATE, { now: NOW });
  assert.equal(s.warnings.critical, 1);
  assert.equal(s.warnings.total, 3);
});

test('snapshot carries advisory limitations', () => {
  const s = buildExecutiveSnapshot(STATE, { now: NOW });
  assert.ok(s.limitations.some((l) => /advisory|human governance/i.test(l)));
  assert.ok(s.limitations.some((l) => /no new intelligence|creates no new/i.test(l)));
});

test('snapshot executive summary is non-empty', () => {
  const s = buildExecutiveSnapshot(STATE, { now: NOW });
  assert.ok(s.executiveSummary.length > 20);
});

test('daily report wraps snapshot + brief + tops', () => {
  const r = buildDailyIntelligenceReport(STATE, { now: NOW });
  assert.equal(r.title, 'Daily Intelligence Report');
  assert.equal(r.date, NOW.slice(0, 10));
  assert.ok(r.snapshot.strategicPriorities.length > 0);
  assert.equal(r.brief.kind, 'daily');
  assert.ok(r.topRisks.length <= 5);
  assert.ok(r.topOpportunities.length <= 5);
});

test('generateExecutiveReport aliases daily report', () => {
  assert.deepEqual(generateExecutiveReport(STATE, { now: NOW }), buildDailyIntelligenceReport(STATE, { now: NOW }));
});

test('empty state → empty but valid snapshot', () => {
  const s = buildExecutiveSnapshot(buildUnifiedSystemState({}, { now: NOW }), { now: NOW });
  assert.deepEqual(s.strategicPriorities, []);
  assert.deepEqual(s.operationalRisks, []);
  assert.equal(s.attention.level, 'routine');
});

test('deterministic snapshot', () => {
  assert.deepEqual(buildExecutiveSnapshot(STATE, { now: NOW }), buildExecutiveSnapshot(STATE, { now: NOW }));
});
