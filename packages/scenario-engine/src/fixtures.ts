// =============================================================================
// @hsi/scenario-engine — deterministic offline fixtures + end-to-end demo.
// =============================================================================

import {
  advanceScenario,
  buildScenarioTree,
  compareScenarios,
  createScenario,
} from './scenario';
import {
  detectConsensusInstability,
  detectEmergingPatterns,
  detectForecastRisk,
  detectNarrativeShift,
  detectSignalAcceleration,
  detectTrustCollapse,
  orderWarnings,
} from './warning';
import type { EarlyWarning, Scenario, ScenarioInput } from './types';

export const FIXTURE_NOW = '2026-06-09T12:00:00.000Z';

/** Three competing demo scenarios. */
export const DEMO_SCENARIOS: ScenarioInput[] = [
  { id: 'sc-resurge', title: 'Narrative resurges', description: 'The narrative regains momentum.', drivers: [{ label: 'Rising velocity', weight: 0.4, presence: 0.85 }, { label: 'Source reactivation', weight: 0.35, presence: 0.8 }, { label: 'Spillover', weight: 0.25, presence: 0.6 }], forecastIds: ['fc-1'] },
  { id: 'sc-fade', title: 'Narrative fades', description: 'The narrative loses momentum.', drivers: [{ label: 'Counter-messaging', weight: 0.5, presence: 0.5 }, { label: 'Platform action', weight: 0.5, presence: 0.3 }] },
  { id: 'sc-mutate', title: 'Narrative mutates', description: 'The narrative transforms into a variant.', drivers: [{ label: 'New framing', weight: 0.6, presence: 0.45 }, { label: 'Audience drift', weight: 0.4, presence: 0.4 }] },
];

/** Run the full scenario + warning chain offline for a UI/demo. Deterministic. */
export function scenarioDemo() {
  const now = FIXTURE_NOW;
  const scenarios: Scenario[] = DEMO_SCENARIOS.map((s) => createScenario(s, { now, actor: 'analyst' }));
  // Advance the leader to ACTIVE.
  const adv = advanceScenario(scenarios[0], 'ACTIVE', { now, actor: 'analyst' });
  if (adv.ok) scenarios[0] = adv.scenario;

  const comparison = compareScenarios(scenarios, { now });
  const tree = buildScenarioTree({
    id: 'root', label: 'Narrative outlook', probability: 1,
    children: [
      { id: 'resurge', label: 'Resurges', probability: 0.55, children: [{ id: 'resurge-fast', label: 'Fast', probability: 0.6 }, { id: 'resurge-slow', label: 'Slow', probability: 0.4 }] },
      { id: 'fade', label: 'Fades', probability: 0.3 },
      { id: 'mutate', label: 'Mutates', probability: 0.15 },
    ],
  });

  const warnings: EarlyWarning[] = [
    detectEmergingPatterns({ id: 'w-emerge', signals: [{ label: 'velocity', strength: 0.8, rising: true }, { label: 'sources', strength: 0.7, rising: true }] }, { now }),
    detectSignalAcceleration({ id: 'w-accel', label: 'mention velocity', series: [10, 12, 16, 24, 40] }, { now }),
    detectTrustCollapse({ id: 'w-trust', trustSeries: [80, 75, 60, 40] }, { now }),
    detectNarrativeShift({ id: 'w-shift', before: [0.6, 0.3, 0.1], after: [0.2, 0.3, 0.5] }, { now }),
    detectConsensusInstability({ id: 'w-consensus', agreementSeries: [0.7, 0.4, 0.75, 0.45, 0.8] }, { now }),
    detectForecastRisk({ id: 'w-forecast', confidence: 0.85, reliability: 0.5, signalWeakening: true }, { now }),
  ].filter((w): w is EarlyWarning => w !== null);

  return { now, scenarios, comparison, tree, warnings: orderWarnings(warnings) };
}
