// =============================================================================
// @hsi/simulation-engine — Scenario Engine
// Named presets that bundle several parameter changes (the sandbox knobs), plus
// TUNABLE_PARAMETERS metadata so a UI can render sliders directly.
// =============================================================================

import { SimulationEngine } from '@hsi/simulation-engine';
import { getUniverse, type UniverseType, type WorldState } from '@hsi/world-models';

/** A single tunable knob with metadata for slider rendering. */
export interface TunableParameter {
  key: string; // dotted state path the slider writes to
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  /** Optional: log scale recommended for the UI (huge dynamic range). */
  logScale?: boolean;
  description: string;
}

/** The sandbox knobs the UI exposes. */
export const TUNABLE_PARAMETERS: TunableParameter[] = [
  { key: 'planet.gravityG', label: 'Gravity', min: 0.1, max: 5, step: 0.1, unit: 'g', description: 'Surface gravity relative to Earth.' },
  { key: 'planet.temperatureK', label: 'Temperature', min: 50, max: 1500, step: 5, unit: 'K', description: 'Mean surface temperature.' },
  { key: 'planet.atmospherePressureAtm', label: 'Atmosphere', min: 0, max: 100, step: 0.5, unit: 'atm', description: 'Outgassed atmospheric pressure.' },
  { key: 'planet.orbitAU', label: 'Orbit', min: 0.1, max: 10, step: 0.05, unit: 'AU', description: 'Orbital distance from the star.' },
  { key: 'star.massSolar', label: 'Star Mass', min: 0.1, max: 30, step: 0.1, unit: 'M☉', description: 'Stellar mass (drives luminosity & lifetime).' },
  { key: 'chemistry.stabilityIndex', label: 'Chemistry Stability', min: 0, max: 1, step: 0.01, unit: '0..1', description: 'Thermodynamic stability of the biochemistry.' },
  { key: 'intelligence.cognitiveRateHz', label: 'Cognition Speed', min: 1e-10, max: 1000, step: 1e-10, unit: 'Hz', logScale: true, description: 'Thoughts per second (down to one per century+).' },
  { key: 'biology.evolutionRate', label: 'Evolution Rate', min: 0, max: 1, step: 0.01, unit: '0..1', description: 'Relative pace of evolution.' },
  { key: 'planet.ageGyr', label: 'Planetary Age', min: 0.1, max: 13, step: 0.1, unit: 'Gyr', description: 'Time available for life to complexify.' },
];

/** A scenario: a named bundle of parameter changes (+ optional universe). */
export interface Scenario {
  id: string;
  name: string;
  description: string;
  universe?: UniverseType;
  /** Dotted state path -> absolute value to set. */
  changes: { path: string; value: number }[];
}

/** Built-in scenario presets. */
export const SCENARIO_PRESETS: Scenario[] = [
  {
    id: 'baseline',
    name: 'Earth Baseline',
    description: 'The reference world, unmodified.',
    changes: [],
  },
  {
    id: 'high-gravity-super-earth',
    name: 'High-Gravity Super-Earth',
    description: 'A 3x-mass world: crushing gravity, thicker retained atmosphere, squat life.',
    changes: [
      { path: 'planet.massEarth', value: 3 },
      { path: 'planet.radiusEarth', value: 1.4 },
    ],
  },
  {
    id: 'frozen-world',
    name: 'Frozen World',
    description: 'Pushed far from the star — solvent freezes, habitability collapses.',
    changes: [{ path: 'planet.orbitAU', value: 3.5 }],
  },
  {
    id: 'red-giant-end-times',
    name: 'Red Giant End-Times',
    description: 'A massive, short-lived, luminous star bakes the inner system.',
    universe: 'standard-physics',
    changes: [
      { path: 'star.massSolar', value: 8 },
      { path: 'star.temperatureK', value: 4000 },
    ],
  },
  {
    id: 'slow-cognition',
    name: 'Glacial Cognition',
    description: 'One thought per century — explore temporal niche mismatch.',
    changes: [{ path: 'intelligence.cognitiveRateHz', value: 3.17e-10 }],
  },
  {
    id: 'low-entropy-universe',
    name: 'Low-Entropy Universe',
    description: 'Order persists — stars and civilizations last far longer.',
    universe: 'low-entropy',
    changes: [],
  },
];

/** Look up a scenario by id. */
export function getScenario(id: string): Scenario | undefined {
  return SCENARIO_PRESETS.find((s) => s.id === id);
}

export interface ScenarioResult {
  scenario: Scenario;
  newState: WorldState;
  /** The engine after applying the scenario (graph already recomputed). */
  engine: SimulationEngine;
}

/** Apply a scenario to a state, returning the recomputed world. */
export function applyScenario(state: WorldState, scenarioId: string): ScenarioResult {
  const scenario = getScenario(scenarioId);
  if (!scenario) throw new Error(`Unknown scenario: ${scenarioId}`);
  const universe = scenario.universe ? getUniverse(scenario.universe) : getUniverse(state.universeType);
  const engine = new SimulationEngine(state, universe);
  if (scenario.universe) engine.setUniverse(universe);
  for (const change of scenario.changes) {
    engine.set(change.path, change.value);
  }
  return { scenario, newState: engine.getState(), engine };
}
