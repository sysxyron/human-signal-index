import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  advanceScenario,
  buildScenarioTree,
  compareScenarios,
  createScenario,
  mostLikelyPath,
  rankScenarios,
  updateScenario,
} from '../src/scenario';
import {
  detectForecastRisk,
  detectTrustCollapse,
  orderWarnings,
} from '../src/warning';
import {
  buildForecastExplanation,
  generateForecast,
} from '@hsi/forecast-engine';
import { FIXTURE_NOW } from '../src/fixtures';
import type { EarlyWarning, Scenario } from '../src/types';

const NOW = FIXTURE_NOW;

// End-to-end: a forecast informs a scenario, the scenario is ranked + advanced,
// and the early-warning layer flags the forecast at risk.

test('forecast → scenario → warning chain', () => {
  const forecast = generateForecast({
    id: 'fc', prediction: 'Resurgence',
    signals: [
      { id: 's1', label: 'velocity', strength: 0.95, direction: 1 },
      { id: 's2', label: 'sources', strength: 0.9, direction: 1 },
      { id: 's3', label: 'spillover', strength: 0.85, direction: 1 },
      { id: 's4', label: 'amplification', strength: 0.8, direction: 1 },
    ],
    historicalAccuracy: 0.4, historicalSampleCount: 12,
  }, { now: NOW });
  // The forecast informs a scenario driver.
  const scn = createScenario({
    id: 'sc', title: 'Resurgence likely', description: 'd',
    drivers: [{ label: 'forecast confidence', weight: 0.6, presence: forecast.confidence }, { label: 'evidence', weight: 0.4, presence: 0.7 }],
    forecastIds: ['fc'],
  }, { now: NOW });
  assert.ok(scn.likelihood > 0.5);

  // The forecast is at risk (high confidence, mediocre reliability).
  const warning = detectForecastRisk({ id: 'fc', confidence: forecast.confidence, reliability: forecast.reliability }, { now: NOW });
  assert.ok(warning);
  assert.equal(warning?.kind, 'forecast_risk');
});

test('competing scenarios ranked + compared deterministically', () => {
  const scenarios: Scenario[] = [
    createScenario({ id: 'a', title: 'A', description: 'd', drivers: [{ label: 'x', weight: 1, presence: 0.8 }] }, { now: NOW }),
    createScenario({ id: 'b', title: 'B', description: 'd', drivers: [{ label: 'x', weight: 1, presence: 0.5 }] }, { now: NOW }),
    createScenario({ id: 'c', title: 'C', description: 'd', drivers: [{ label: 'x', weight: 1, presence: 0.3 }] }, { now: NOW }),
  ];
  const cmp = compareScenarios(scenarios, { now: NOW });
  assert.equal(cmp.leading, 'a');
  assert.equal(cmp.ranked[0].rank, 1);
  assert.ok(cmp.ranked[0].likelihood > cmp.ranked[2].likelihood);
});

test('scenario advances through its lifecycle', () => {
  let scn = createScenario({ id: 's', title: 't', description: 'd' }, { now: NOW });
  for (const to of ['ACTIVE', 'MONITORING', 'CONFIRMED', 'ARCHIVED'] as const) {
    const res = advanceScenario(scn, to, { now: NOW });
    assert.ok(res.ok, `failed at ${to}`);
    if (res.ok) scn = res.scenario;
  }
  assert.equal(scn.state, 'ARCHIVED');
  assert.equal(scn.events.length, 5);
});

test('updateScenario re-scores likelihood live', () => {
  const scn = createScenario({ id: 's', title: 't', description: 'd', drivers: [{ label: 'x', weight: 1, presence: 0.3 }] }, { now: NOW });
  const updated = updateScenario(scn, { drivers: [{ label: 'x', weight: 1, presence: 0.9 }] }, { now: NOW });
  assert.ok(updated.likelihood > scn.likelihood);
});

test('scenario tree most-likely path joint probability', () => {
  const tree = buildScenarioTree({ id: 'r', label: 'Root', probability: 1, children: [
    { id: 'a', label: 'A', probability: 0.6, children: [{ id: 'a1', label: 'A1', probability: 0.9 }, { id: 'a2', label: 'A2', probability: 0.1 }] },
    { id: 'b', label: 'B', probability: 0.4 },
  ] });
  const path = mostLikelyPath(tree);
  assert.deepEqual(path.path, ['Root', 'A', 'A1']);
  assert.ok(Math.abs(path.probability - 0.54) < 1e-9);
});

test('warnings ordered with forecast explanation available', () => {
  const forecast = generateForecast({ id: 'fc', prediction: 'p', signals: [{ id: 's', label: 'a', strength: 0.8, direction: 1 }] }, { now: NOW });
  const exp = buildForecastExplanation(forecast, { now: NOW });
  assert.ok(exp.factors.length > 0);
  const warnings: EarlyWarning[] = [
    detectTrustCollapse({ id: 'w1', trustSeries: [80, 30] }, { now: NOW }),
    detectForecastRisk({ id: 'w2', confidence: 0.9, reliability: 0.4 }, { now: NOW }),
  ].filter((w): w is EarlyWarning => w !== null);
  const ordered = orderWarnings(warnings);
  const rank = { CRITICAL: 0, WARNING: 1, WATCH: 2, INFO: 3 } as const;
  for (let i = 1; i < ordered.length; i++) assert.ok(rank[ordered[i - 1].level] <= rank[ordered[i].level]);
});

test('deterministic forecast→scenario chain', () => {
  const build = () => {
    const f = generateForecast({ id: 'fc', prediction: 'p', signals: [{ id: 's', label: 'a', strength: 0.8, direction: 1 }] }, { now: NOW });
    return createScenario({ id: 'sc', title: 't', description: 'd', drivers: [{ label: 'x', weight: 1, presence: f.confidence }] }, { now: NOW });
  };
  assert.deepEqual(build(), build());
});

test('rankScenarios shares sum to ~1 across many', () => {
  const scenarios = Array.from({ length: 5 }, (_, i) => createScenario({ id: `s${i}`, title: `S${i}`, description: 'd', drivers: [{ label: 'x', weight: 1, presence: (i + 1) / 6 }] }, { now: NOW }));
  const sum = rankScenarios(scenarios).reduce((a, r) => a + r.share, 0);
  assert.ok(Math.abs(sum - 1) < 0.02);
});
