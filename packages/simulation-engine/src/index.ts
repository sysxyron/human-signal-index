// =============================================================================
// @hsi/simulation-engine — public API (WorldForge Phase 2)
// "Input → World State → Simulation Graph → Dynamic Recalculation → Report".
// State is the single source of truth; reports are DERIVED, observable, and carry
// provenance + scientific confidence. Depends only on @hsi/world-models.
//
// -----------------------------------------------------------------------------
// __example__ — report is an output of state
// import { createEarthState, evaluateWorld } from '@hsi/simulation-engine';
// const report = evaluateWorld(createEarthState());
// report.overallScore;            // ~ high
// report.habitability.provenance; // why this number, what it depends on
// =============================================================================

// ---- world-models foundation (re-exported for one-import consumers) --------
export * from '@hsi/world-models';

// ---- graph -----------------------------------------------------------------
export { buildDependencyGraph, N } from './graph/builder';
export { indexGraph } from './graph/types';
export type {
  SimulationGraph,
  GraphNode,
  GraphEdge,
  GraphIndex,
  NodeCategory,
  ComputeFn,
  ComputeInputs,
} from './graph/types';
export {
  topologicalSort,
  detectCycles,
  getDownstream,
  getUpstream,
  getAncestryChain,
} from './graph/resolver';
export * as formulas from './graph/formulas';

// ---- propagation -----------------------------------------------------------
export {
  propagate,
  resolveAll,
  nodeValue,
  valueMap,
  type ImpactChain,
  type ImpactStep,
} from './engine/propagation';

// ---- state manager ---------------------------------------------------------
export { SimulationEngine, StateManager, type StatePath } from './engine/state-manager';

// ---- temporal niche engine -------------------------------------------------
export {
  computeTemporalAdaptation,
  adaptationAcrossEnvironments,
  ENVIRONMENT_RATES,
  type TemporalAdaptation,
  type TemporalInput,
  type TemporalLabel,
} from './engine/temporal-niche';

// ---- evaluator (report from state) -----------------------------------------
export {
  evaluateWorld,
  type WorldEvaluation,
  type ScoredMetric,
  type RankedRisk,
} from './engine/evaluator';

// ---- explanation walker ----------------------------------------------------
export { explainNode, type NodeExplanation } from './provenance/explain';

// ---- versioning + diff -----------------------------------------------------
export {
  createVersion,
  diffWorlds,
  flatten,
  type WorldVersion,
  type WorldDiff,
  type WorldChange,
} from './versioning/version';
