// =============================================================================
// @hsi/counterfactuals — public API (TOP layer)
// What-if counterfactual cascades, named scenario presets, and the flagship
// Chronid demo. Depends on @hsi/world-models + @hsi/simulation-engine +
// @hsi/timeline-engine.
// =============================================================================

// ---- counterfactual engine -------------------------------------------------
export {
  applyCounterfactual,
  EXAMPLE_COUNTERFACTUALS,
  type Counterfactual,
  type CounterfactualOp,
  type CounterfactualResult,
} from './counterfactual';

// ---- scenario engine -------------------------------------------------------
export {
  applyScenario,
  getScenario,
  SCENARIO_PRESETS,
  TUNABLE_PARAMETERS,
  type Scenario,
  type ScenarioResult,
  type TunableParameter,
} from './scenario';

// ---- chronid demo ----------------------------------------------------------
export {
  chronidDemo,
  createChronidPrime,
  CHRONID_COGNITIVE_RATE_HZ,
  type ChronidDemo,
} from './demos/chronid';
