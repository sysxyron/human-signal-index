import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeExecutiveAttention, computeOperationalRisk, computeStrategicOpportunity } from '../src/analysis';
import { buildUnifiedSystemState } from '../src/unified';
import { DEMO_INPUTS, FIXTURE_NOW } from '../src/fixtures';

const NOW = FIXTURE_NOW;
const STATE = buildUnifiedSystemState(DEMO_INPUTS, { now: NOW });

// ---- risk -------------------------------------------------------------------

test('risks sorted high→low by score', () => {
  const risks = computeOperationalRisk(STATE);
  for (let i = 1; i < risks.length; i++) assert.ok(risks[i - 1].score >= risks[i].score);
});

test('critical warning produces a CRITICAL risk', () => {
  const risks = computeOperationalRisk(STATE);
  assert.ok(risks.some((r) => r.severity === 'CRITICAL' && /Trust collapse/.test(r.title)));
});

test('failed forecast produces a forecast risk', () => {
  const risks = computeOperationalRisk(STATE);
  assert.ok(risks.some((r) => r.source === 'forecast'));
});

test('disputed consensus produces a consensus risk', () => {
  const risks = computeOperationalRisk(STATE);
  assert.ok(risks.some((r) => r.source === 'consensus'));
});

test('low trust produces a trust risk', () => {
  const risks = computeOperationalRisk(STATE);
  assert.ok(risks.some((r) => r.source === 'trust'));
});

test('open escalations produce an operations risk', () => {
  const risks = computeOperationalRisk(STATE);
  assert.ok(risks.some((r) => r.id === 'risk-escalations'));
});

test('every risk has score in [0,100], explanation, recommendation', () => {
  for (const r of computeOperationalRisk(STATE)) {
    assert.ok(r.score >= 0 && r.score <= 100);
    assert.ok(r.explanation.length > 0);
    assert.match(r.recommendation, /advisory/);
  }
});

test('empty state → no risks', () => {
  assert.deepEqual(computeOperationalRisk(buildUnifiedSystemState({}, { now: NOW })), []);
});

test('WATCH/INFO warnings do not create risks', () => {
  const s = buildUnifiedSystemState({ warnings: [{ id: 'w', kind: 'k', level: 'WATCH', title: 't' }] }, { now: NOW });
  assert.equal(computeOperationalRisk(s).length, 0);
});

// ---- opportunity ------------------------------------------------------------

test('opportunities sorted high→low', () => {
  const opps = computeStrategicOpportunity(STATE);
  for (let i = 1; i < opps.length; i++) assert.ok(opps[i - 1].score >= opps[i].score);
});

test('research opportunities surface', () => {
  const opps = computeStrategicOpportunity(STATE);
  assert.ok(opps.some((o) => o.source === 'research'));
});

test('reliable active forecast surfaces as opportunity', () => {
  const s = buildUnifiedSystemState({ forecasts: [{ id: 'f', prediction: 'p', confidence: 0.8, reliability: 0.7, status: 'active' }] }, { now: NOW });
  const opps = computeStrategicOpportunity(s);
  assert.ok(opps.some((o) => o.source === 'forecast'));
});

test('strong undisputed consensus surfaces as opportunity', () => {
  const opps = computeStrategicOpportunity(STATE);
  assert.ok(opps.some((o) => o.source === 'consensus'));
});

test('every opportunity has score in [0,100] + recommendation', () => {
  for (const o of computeStrategicOpportunity(STATE)) {
    assert.ok(o.score >= 0 && o.score <= 100);
    assert.match(o.recommendation, /advisory/);
  }
});

test('disputed consensus is NOT an opportunity', () => {
  const opps = computeStrategicOpportunity(STATE);
  assert.ok(!opps.some((o) => o.source === 'consensus' && /Northern/.test(o.title)));
});

test('empty state → no opportunities', () => {
  assert.deepEqual(computeStrategicOpportunity(buildUnifiedSystemState({}, { now: NOW })), []);
});

// ---- attention --------------------------------------------------------------

test('attention index in [0,100]', () => {
  const a = computeExecutiveAttention(STATE);
  assert.ok(a.index >= 0 && a.index <= 100);
});

test('attention surfaces critical warning as urgent', () => {
  const a = computeExecutiveAttention(STATE);
  assert.ok(a.items.some((i) => i.level === 'urgent' && i.reason === 'CRITICAL early warning'));
});

test('attention rises with system degradation', () => {
  const healthy = computeExecutiveAttention(buildUnifiedSystemState({ ...DEMO_INPUTS, operations: { ...DEMO_INPUTS.operations, overallHealth: 'HEALTHY' } }, { now: NOW }));
  const down = computeExecutiveAttention(buildUnifiedSystemState({ ...DEMO_INPUTS, operations: { ...DEMO_INPUTS.operations, overallHealth: 'DOWN' } }, { now: NOW }));
  assert.ok(down.index > healthy.index);
});

test('attention is advisory in explanation', () => {
  const a = computeExecutiveAttention(STATE);
  assert.ok(a.explanation.some((l) => /advisory/i.test(l)));
});

test('empty state → routine attention', () => {
  const a = computeExecutiveAttention(buildUnifiedSystemState({}, { now: NOW }));
  assert.equal(a.index, 0);
  assert.equal(a.level, 'routine');
});

test('attention items capped at 20', () => {
  const many = Array.from({ length: 40 }, (_, i) => ({ id: `w${i}`, kind: 'k', level: 'CRITICAL' as const, title: `t${i}` }));
  const a = computeExecutiveAttention(buildUnifiedSystemState({ warnings: many }, { now: NOW }));
  assert.ok(a.items.length <= 20);
});

test('deterministic analysis', () => {
  assert.deepEqual(computeOperationalRisk(STATE), computeOperationalRisk(STATE));
  assert.deepEqual(computeStrategicOpportunity(STATE), computeStrategicOpportunity(STATE));
  assert.deepEqual(computeExecutiveAttention(STATE), computeExecutiveAttention(STATE));
});
