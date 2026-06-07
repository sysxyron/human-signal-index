// =============================================================================
// @hsi/simulation-engine — Chronid demo
// The flagship showcase. Chronid Prime: subjective day ≈ 1000 Earth years, so
// cognitiveRateHz ≈ 1 thought / ~1000 yr ≈ 3.17e-11 Hz. A frozen, high-gravity
// super-earth with crystal genetics and mineral neural networks, hosting a
// billion-year civilization. Demonstrates the temporal-niche twist: glacial
// cognition is severely under-adapted to fast environments but balanced to the
// geological/glacial regime it actually lives in.
// =============================================================================

import { createChronidPrime, getUniverse, type WorldState } from '@hsi/world-models';

// Re-export the pure world factory + constant (now sourced from world-models) so
// they remain importable from the counterfactuals package.
export { createChronidPrime, CHRONID_COGNITIVE_RATE_HZ } from '@hsi/world-models';
import {
  buildDependencyGraph,
  resolveAll,
  indexGraph,
  evaluateWorld,
  computeTemporalAdaptation,
  adaptationAcrossEnvironments,
  ENVIRONMENT_RATES,
  type SimulationGraph,
  type WorldEvaluation,
  type TemporalAdaptation,
} from '@hsi/simulation-engine';
import { generateTimeline, type TimelineEvent } from '@hsi/timeline-engine';
import { applyCounterfactual, EXAMPLE_COUNTERFACTUALS, type CounterfactualResult } from '../counterfactual';

/** End-to-end demo bundle for UI / docs. */
export interface ChronidDemo {
  state: WorldState;
  graph: SimulationGraph;
  /** Billion-year stellar + civilization timelines. */
  timeline: {
    stellar: TimelineEvent[];
    civilization: TimelineEvent[];
    evolution: TimelineEvent[];
  };
  counterfactuals: CounterfactualResult[];
  evaluation: WorldEvaluation;
  /** Temporal adaptation against the climatic regime AND across all regimes. */
  temporalAdaptation: TemporalAdaptation;
  temporalAcrossEnvironments: ReturnType<typeof adaptationAcrossEnvironments>;
}

/** Run the full Chronid showcase. */
export function chronidDemo(): ChronidDemo {
  const state = createChronidPrime();
  const universe = getUniverse(state.universeType);
  const graph = buildDependencyGraph(state, universe);
  resolveAll(graph, indexGraph(graph));

  const GYR = 1e9;
  const timeline = {
    stellar: generateTimeline(state, 'stellar', 100 * GYR), // tens of billions of yr
    civilization: generateTimeline(state, 'civilization', 1 * GYR), // billion-yr civ
    evolution: generateTimeline(state, 'evolution', 8 * GYR),
  };

  // Run 3 of the ready-made counterfactuals against Chronid Prime.
  const counterfactuals = [
    applyCounterfactual(state, EXAMPLE_COUNTERFACTUALS[0]), // 3x mass (gravity)
    applyCounterfactual(state, EXAMPLE_COUNTERFACTUALS[2]), // star -> red giant
    applyCounterfactual(state, EXAMPLE_COUNTERFACTUALS[3]), // one thought / century
  ];

  const evaluation = evaluateWorld(state);

  const temporalAdaptation = computeTemporalAdaptation({
    cognitiveRateHz: state.intelligence.cognitiveRateHz,
    environmentalChangeRate: ENVIRONMENT_RATES.geological, // its actual niche
  });
  const temporalAcrossEnvironments = adaptationAcrossEnvironments(
    state.intelligence.cognitiveRateHz,
  );

  return {
    state,
    graph,
    timeline,
    counterfactuals,
    evaluation,
    temporalAdaptation,
    temporalAcrossEnvironments,
  };
}
