import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SCENARIO_TRANSITIONS,
  advanceScenario,
  buildScenarioTree,
  compareScenarios,
  computeScenarioLikelihood,
  createScenario,
  mostLikelyPath,
  rankScenarios,
  updateScenario,
  validateScenarioTransition,
} from '../src/scenario';
import { DEMO_SCENARIOS, FIXTURE_NOW } from '../src/fixtures';
import type { Scenario, ScenarioState } from '../src/types';

const NOW = FIXTURE_NOW;

function scn(state: ScenarioState = 'EMERGING'): Scenario {
  return { ...createScenario({ id: 's', title: 't', description: 'd', drivers: [{ label: 'x', weight: 0.5, presence: 0.6 }] }, { now: NOW }), state };
}

test('computeScenarioLikelihood is weighted', () => {
  const l = computeScenarioLikelihood([{ label: 'a', weight: 0.8, presence: 0.9 }, { label: 'b', weight: 0.2, presence: 0.1 }]);
  assert.ok(l > 0.5 && l <= 1);
});

test('likelihood neutral with no drivers', () => {
  assert.equal(computeScenarioLikelihood([]), 0.5);
});

test('createScenario starts EMERGING with a genesis event', () => {
  const s = createScenario({ id: 's', title: 't', description: 'd' }, { now: NOW });
  assert.equal(s.state, 'EMERGING');
  assert.equal(s.events.length, 1);
});

test('createScenario computes likelihood from drivers', () => {
  const s = createScenario({ id: 's', title: 't', description: 'd', drivers: [{ label: 'a', weight: 1, presence: 0.9 }] }, { now: NOW });
  assert.ok(Math.abs(s.likelihood - 0.9) < 1e-9);
});

test('valid transitions', () => {
  assert.equal(validateScenarioTransition('EMERGING', 'ACTIVE').valid, true);
  assert.equal(validateScenarioTransition('ACTIVE', 'CONFIRMED').valid, true);
  assert.equal(validateScenarioTransition('MONITORING', 'INVALIDATED').valid, true);
});

test('invalid transitions rejected', () => {
  assert.equal(validateScenarioTransition('EMERGING', 'CONFIRMED').valid, false);
  assert.equal(validateScenarioTransition('ACTIVE', 'ACTIVE').valid, false);
});

test('INVALIDATED can only archive', () => {
  assert.deepEqual(SCENARIO_TRANSITIONS.INVALIDATED, ['ARCHIVED']);
});

test('advance appends an audited event', () => {
  const res = advanceScenario(scn('EMERGING'), 'ACTIVE', { now: NOW, actor: 'ana', reason: 'go' });
  assert.ok(res.ok);
  if (res.ok) {
    assert.equal(res.scenario.state, 'ACTIVE');
    assert.equal(res.event.actor, 'ana');
  }
});

test('advance invalid → ok:false', () => {
  const res = advanceScenario(scn('EMERGING'), 'CONFIRMED', { now: NOW });
  assert.equal(res.ok, false);
});

test('advance does not mutate input', () => {
  const s = scn('EMERGING');
  advanceScenario(s, 'ACTIVE', { now: NOW });
  assert.equal(s.state, 'EMERGING');
});

test('updateScenario re-scores likelihood', () => {
  const s = scn();
  const u = updateScenario(s, { drivers: [{ label: 'y', weight: 1, presence: 0.95 }] }, { now: NOW });
  assert.ok(Math.abs(u.likelihood - 0.95) < 1e-9);
});

test('rankScenarios orders by likelihood', () => {
  const scenarios = DEMO_SCENARIOS.map((s) => createScenario(s, { now: NOW }));
  const ranked = rankScenarios(scenarios);
  for (let i = 1; i < ranked.length; i++) assert.ok(ranked[i - 1].likelihood >= ranked[i].likelihood);
  assert.equal(ranked[0].rank, 1);
});

test('rank shares sum to ~1', () => {
  const scenarios = DEMO_SCENARIOS.map((s) => createScenario(s, { now: NOW }));
  const sum = rankScenarios(scenarios).reduce((a, r) => a + r.share, 0);
  assert.ok(Math.abs(sum - 1) < 0.02);
});

test('compareScenarios identifies the leader + divergence', () => {
  const scenarios = DEMO_SCENARIOS.map((s) => createScenario(s, { now: NOW }));
  const cmp = compareScenarios(scenarios, { now: NOW });
  assert.equal(cmp.leading, 'sc-resurge');
  assert.ok(cmp.divergence >= 0 && cmp.divergence <= 1);
  assert.ok(cmp.limitations.length > 0);
});

test('compare always carries a hypothesis limitation', () => {
  const cmp = compareScenarios([scn()], { now: NOW });
  assert.ok(cmp.limitations.some((l) => /hypotheses|not.*probabilities of truth/i.test(l)));
});

test('near-tied scenarios flagged', () => {
  const a = createScenario({ id: 'a', title: 'A', description: 'd', drivers: [{ label: 'x', weight: 1, presence: 0.5 }] }, { now: NOW });
  const b = createScenario({ id: 'b', title: 'B', description: 'd', drivers: [{ label: 'x', weight: 1, presence: 0.51 }] }, { now: NOW });
  const cmp = compareScenarios([a, b], { now: NOW });
  assert.ok(cmp.limitations.some((l) => /nearly tied/i.test(l)));
});

test('buildScenarioTree clamps probabilities', () => {
  const tree = buildScenarioTree({ id: 'r', label: 'root', probability: 1.5, children: [{ id: 'a', label: 'A', probability: -0.2 }] });
  assert.equal(tree.probability, 1);
  assert.equal(tree.children[0].probability, 0);
});

test('mostLikelyPath finds the highest joint probability path', () => {
  const tree = buildScenarioTree({ id: 'r', label: 'root', probability: 1, children: [
    { id: 'a', label: 'A', probability: 0.7, children: [{ id: 'a1', label: 'A1', probability: 0.8 }] },
    { id: 'b', label: 'B', probability: 0.3 },
  ] });
  const path = mostLikelyPath(tree);
  assert.deepEqual(path.path, ['root', 'A', 'A1']);
  assert.ok(Math.abs(path.probability - 0.56) < 1e-9);
});

test('deterministic ranking', () => {
  const scenarios = DEMO_SCENARIOS.map((s) => createScenario(s, { now: NOW }));
  assert.deepEqual(rankScenarios(scenarios), rankScenarios(scenarios));
});
