import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  approveExecutiveDecision,
  buildDailyIntelligenceReport,
  buildExecutiveSnapshot,
  buildUnifiedSystemState,
  computeExecutiveAttention,
  computeOperationalRisk,
  computeStrategicOpportunity,
  queueExecutiveReview,
  rankStrategicPriorities,
  summarizeSystemState,
} from '../src/index';
import { DEMO_INPUTS, FIXTURE_NOW } from '../src/fixtures';

const NOW = FIXTURE_NOW;

test('public entry point re-exports the full surface', () => {
  for (const fn of [
    buildUnifiedSystemState, summarizeSystemState, rankStrategicPriorities,
    computeOperationalRisk, computeStrategicOpportunity, computeExecutiveAttention,
    buildExecutiveSnapshot, buildDailyIntelligenceReport, queueExecutiveReview, approveExecutiveDecision,
  ]) {
    assert.equal(typeof fn, 'function');
  }
});

test('end-to-end: state → snapshot → review → decision', () => {
  const state = buildUnifiedSystemState(DEMO_INPUTS, { now: NOW });
  const snapshot = buildExecutiveSnapshot(state, { now: NOW });
  assert.ok(snapshot.strategicPriorities.length > 0);

  const top = snapshot.strategicPriorities[0];
  const review = queueExecutiveReview(top, { now: NOW, id: 'rev-x' });
  const decision = approveExecutiveDecision(review, { reviewer: 'exec', reason: 'verified' }, { now: NOW });

  assert.equal(decision.priorityId, top.id);
  assert.equal(decision.reversible, true);
});

test('attention level matches snapshot attention', () => {
  const state = buildUnifiedSystemState(DEMO_INPUTS, { now: NOW });
  const snapshot = buildExecutiveSnapshot(state, { now: NOW });
  const attention = computeExecutiveAttention(state);
  assert.equal(snapshot.attention.index, attention.index);
  assert.equal(snapshot.attention.level, attention.level);
});

test('daily report tops are slices of snapshot', () => {
  const state = buildUnifiedSystemState(DEMO_INPUTS, { now: NOW });
  const report = buildDailyIntelligenceReport(state, { now: NOW });
  assert.deepEqual(report.topRisks, report.snapshot.operationalRisks.slice(0, 5));
  assert.deepEqual(report.topOpportunities, report.snapshot.opportunities.slice(0, 5));
});

test('a calmer system lowers attention and priority count', () => {
  const calm = buildUnifiedSystemState({
    investigations: [{ id: 'i', title: 'Routine', state: 'ACTIVE', contributorCount: 3, contentiousness: 0.1 }],
    operations: { overallHealth: 'HEALTHY', activeRuns: 1, queueDepth: 1, openEscalations: 0 },
  }, { now: NOW });
  const busy = buildUnifiedSystemState(DEMO_INPUTS, { now: NOW });
  assert.ok(computeExecutiveAttention(calm).index < computeExecutiveAttention(busy).index);
  assert.ok(rankStrategicPriorities(calm).length < rankStrategicPriorities(busy).length);
});

test('whole chain is deterministic and offline', () => {
  const run = () => {
    const state = buildUnifiedSystemState(DEMO_INPUTS, { now: NOW });
    return {
      summary: summarizeSystemState(state),
      snapshot: buildExecutiveSnapshot(state, { now: NOW }),
      report: buildDailyIntelligenceReport(state, { now: NOW }),
    };
  };
  assert.deepEqual(run(), run());
});

test('no recommendation auto-acts (all advisory)', () => {
  const state = buildUnifiedSystemState(DEMO_INPUTS, { now: NOW });
  const snapshot = buildExecutiveSnapshot(state, { now: NOW });
  for (const r of snapshot.operationalRisks) assert.match(r.recommendation, /advisory/);
  for (const o of snapshot.opportunities) assert.match(o.recommendation, /advisory/);
  for (const p of snapshot.strategicPriorities) assert.ok(p.limitations.some((l) => /advisory|Human/i.test(l)));
});
