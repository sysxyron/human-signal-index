'use server';

// =============================================================================
// HSIN Phase 12 — Counterfactual Simulation Engine server actions.
// 'use server'.
//
// THIN wrappers over the Phase-12 DAL (lib/simulation/persistence.ts). They
// return DbResult and revalidate the relevant dashboards. They NEVER throw (the
// DAL already returns DbResult).
//
// THE EXPORTED ACTION SURFACE IS LOAD-BEARING: the Phase-12 UI (the simulation /
// counterfactual / backtesting / WorldForge-scenarios consoles + the operations
// rebuild control) is built against exactly these names — do not rename them.
//
// SERVER-ONLY: this module imports next/headers (transitively via the DAL) and
// must never be imported by a client component — it is reachable only via these
// actions.
// =============================================================================

import { revalidatePath } from 'next/cache';
import {
  demoSimulation,
  generateWorldforgeScenario,
  getBacktesting,
  getCounterfactualRun,
  getCounterfactualRuns,
  getSimulationHighlights,
  getSimulationOverview,
  getWorldforgeScenarios,
  rebuildSimulation,
  runCounterfactual,
  type CounterfactualRunFilters,
  type DbResult,
  type RebuildSimulationSummary,
  type RunCounterfactualParams,
  type RunCounterfactualResult,
} from './persistence';
import type { CounterfactualScenarioType } from '@hsi/shared-types';

// -----------------------------------------------------------------------------
// Routes revalidated after a write/rebuild (best-effort; safe if absent).
// -----------------------------------------------------------------------------
const SIMULATION_ROUTE = '/simulation';
const COUNTERFACTUAL_ROUTE = '/simulation/counterfactual';
const BACKTESTING_ROUTE = '/simulation/backtesting';
const SCENARIOS_ROUTE = '/simulation/scenarios';
const WORLDFORGE_ROUTE = '/worldforge';
const WORLDFORGE_SCENARIOS_ROUTE = '/worldforge/scenarios';
const OPERATIONS_ROUTE = '/operations';

function revalidate(...paths: string[]): void {
  for (const p of paths) {
    try {
      revalidatePath(p);
    } catch {
      // revalidatePath throws outside a request scope — ignore (best-effort).
    }
  }
}

// =============================================================================
// READS
// =============================================================================

/** Simulation overview (recent + top runs, accuracy, scenarios, aggregates). */
export async function getSimulationOverviewAction() {
  return getSimulationOverview();
}

/** Counterfactual runs, optionally filtered by narrative + scenario type. */
export async function getCounterfactualRunsAction(
  filters?: CounterfactualRunFilters,
) {
  return getCounterfactualRuns(filters);
}

/** A single counterfactual run + its events + results + the source narrative. */
export async function getCounterfactualRunAction(id: string) {
  return getCounterfactualRun(id);
}

/** Backtesting view (accuracy + results + narratives + confidence drift). */
export async function getBacktestingAction() {
  return getBacktesting();
}

/** WorldForge scenarios view (scenarios joined to runs + source narratives). */
export async function getWorldforgeScenariosAction() {
  return getWorldforgeScenarios();
}

/** Headline simulation callouts for the dashboard. */
export async function getSimulationHighlightsAction() {
  return getSimulationHighlights();
}

/** Labeled, non-persisted demo view-models for the empty-env / showcase path. */
export async function demoSimulationAction() {
  return demoSimulation();
}

// =============================================================================
// WRITES (researcher+)
// =============================================================================

/**
 * Run ONE counterfactual over a narrative (researcher+). Loads the input from the
 * temporal/causal tables, runs the deterministic engine, and persists the run +
 * its per-change events. Revalidates the simulation + WorldForge routes. NEVER
 * throws.
 */
export async function runCounterfactualAction(
  narrativeId: string,
  scenarioType: CounterfactualScenarioType,
  params?: RunCounterfactualParams,
): Promise<DbResult<RunCounterfactualResult>> {
  const result = await runCounterfactual(narrativeId, scenarioType, params);
  if (result.ok) {
    revalidate(
      SIMULATION_ROUTE,
      COUNTERFACTUAL_ROUTE,
      WORLDFORGE_ROUTE,
      OPERATIONS_ROUTE,
    );
  }
  return result;
}

/**
 * Materialize a WorldForge scenario from an existing counterfactual run
 * (researcher+). Revalidates the scenarios + WorldForge routes. NEVER throws.
 */
export async function generateWorldforgeScenarioAction(
  counterfactualRunId: string,
): Promise<DbResult<{ scenarioId: string }>> {
  const result = await generateWorldforgeScenario(counterfactualRunId);
  if (result.ok) {
    revalidate(
      SIMULATION_ROUTE,
      SCENARIOS_ROUTE,
      WORLDFORGE_ROUTE,
      WORLDFORGE_SCENARIOS_ROUTE,
      OPERATIONS_ROUTE,
    );
  }
  return result;
}

// =============================================================================
// REBUILD (researcher+)
// =============================================================================

/**
 * Rebuild the entire counterfactual + backtesting layer (researcher+). Passes a
 * SERVER timestamp into the deterministic engine (the engine never calls
 * Date.now()), runs the end-to-end counterfactuals → backtest → accuracy →
 * results → scenarios pipeline, and persists the results. Revalidates the
 * simulation + WorldForge + operations routes. NEVER throws.
 */
export async function rebuildSimulationAction(): Promise<
  DbResult<RebuildSimulationSummary>
> {
  const now = new Date().toISOString();
  const result = await rebuildSimulation(now);
  if (result.ok) {
    revalidate(
      SIMULATION_ROUTE,
      COUNTERFACTUAL_ROUTE,
      BACKTESTING_ROUTE,
      SCENARIOS_ROUTE,
      WORLDFORGE_ROUTE,
      WORLDFORGE_SCENARIOS_ROUTE,
      OPERATIONS_ROUTE,
    );
  }
  return result;
}

// =============================================================================
// RE-EXPORTS for the UI — DbResult + Phase-12 view-model / record types.
// (Type re-exports are erased at compile time; safe in a 'use server' module.)
// =============================================================================
export type { DbResult, DbResultCode } from './persistence';
export type {
  CounterfactualRunFilters,
  RunCounterfactualParams,
  RunCounterfactualResult,
  RebuildSimulationSummary,
  SimulationDemoViews,
} from './persistence';
export type {
  // Records.
  HsinCounterfactualRunRecord,
  HsinCounterfactualEventRecord,
  HsinSimulationResultRecord,
  HsinForecastAccuracyRecord,
  HsinWorldforgeScenarioRecord,
  HsinNarrativeRecord,
  // View-models.
  SimulationOverview,
  CounterfactualRunView,
  BacktestingView,
  WorldforgeScenariosView,
  SimulationHighlights,
  // Unions.
  CounterfactualScenarioType,
  CounterfactualActionType,
  ConfidenceBand,
} from '@hsi/shared-types';
