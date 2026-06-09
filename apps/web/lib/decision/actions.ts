'use server';

// =============================================================================
// HSIN Phase 13 — Decision Intelligence & Strategic War-Gaming server actions.
// 'use server'.
//
// THIN wrappers over the Phase-13 DAL (lib/decision/persistence.ts). They return
// DbResult and revalidate the relevant dashboards. They NEVER throw (the DAL
// already returns DbResult).
//
// THE EXPORTED ACTION SURFACE IS LOAD-BEARING: the Phase-13 UI (the decision /
// war-gaming / cross-narrative / explorer consoles + the operations rebuild
// control) is built against exactly these names — do not rename them.
//
// SERVER-ONLY: this module imports next/headers (transitively via the DAL) and
// must never be imported by a client component — it is reachable only via these
// actions.
// =============================================================================

import { revalidatePath } from 'next/cache';
import {
  compareScenariosRun,
  computeCrossImpacts,
  demoDecision,
  exploreDecision,
  getCrossNarrativeImpacts,
  getDecisionDashboard,
  getDecisionHighlights,
  getDecisionRun,
  getScenarioComparisons,
  rebuildDecisions,
  runDecision,
  type CompareScenariosResult,
  type ComputeCrossImpactsResult,
  type DbResult,
  type DecisionDemoViews,
  type RebuildDecisionsSummary,
  type RunDecisionResult,
} from './persistence';
import type { InterventionType } from '@hsi/decision-intelligence';

// -----------------------------------------------------------------------------
// Routes revalidated after a write/rebuild (best-effort; safe if absent).
// -----------------------------------------------------------------------------
const DECISION_ROUTE = '/decision';
const DECISION_SCENARIOS_ROUTE = '/decision/scenarios';
const DECISION_CROSS_ROUTE = '/decision/cross-narrative';
const DECISION_EXPLORER_ROUTE = '/decision/explorer';
const SIMULATION_ROUTE = '/simulation';
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

/** Decision dashboard (recent runs, top rankings, top risks, queue, avg conf). */
export async function getDecisionDashboardAction() {
  return getDecisionDashboard();
}

/** A single decision run + its rankings + comparisons + audit + narrative. */
export async function getDecisionRunAction(id: string) {
  return getDecisionRun(id);
}

/** Scenario war-gaming view (comparisons joined to runs + source narratives). */
export async function getScenarioComparisonsAction() {
  return getScenarioComparisons();
}

/** Cross-narrative impacts (optionally scoped to a narrative) + the narratives. */
export async function getCrossNarrativeImpactsAction(narrativeId?: string) {
  return getCrossNarrativeImpacts(narrativeId);
}

/** Headline decision callouts for the dashboard. */
export async function getDecisionHighlightsAction() {
  return getDecisionHighlights();
}

/**
 * Decision explorer — DERIVED ON READ. Estimate one intervention's expected
 * effect / risk / confidence / reasoning / limitations for a narrative.
 */
export async function exploreDecisionAction(
  narrativeId: string,
  interventionType: InterventionType,
) {
  return exploreDecision(narrativeId, interventionType);
}

/** Labeled, non-persisted demo view-models for the empty-env / showcase path. */
export async function demoDecisionAction() {
  return demoDecision();
}

// =============================================================================
// WRITES (researcher+)
// =============================================================================

/**
 * Run ONE decision over a narrative (researcher+). Loads the input from the
 * temporal/causal/counterfactual tables, runs the deterministic engine, and
 * persists the run + its rankings + an audit. Revalidates the decision +
 * operations routes. NEVER throws.
 */
export async function runDecisionAction(
  narrativeId: string,
): Promise<DbResult<RunDecisionResult>> {
  const result = await runDecision(narrativeId);
  if (result.ok) {
    revalidate(
      DECISION_ROUTE,
      DECISION_EXPLORER_ROUTE,
      SIMULATION_ROUTE,
      OPERATIONS_ROUTE,
    );
  }
  return result;
}

/**
 * War-game scenario A vs scenario B over a narrative (researcher+). Persists a
 * scenario comparison attached to the narrative's decision run. Revalidates the
 * decision + scenarios + operations routes. NEVER throws.
 */
export async function compareScenariosAction(
  narrativeId: string,
  scenarioA: { name: string; interventions: InterventionType[] },
  scenarioB: { name: string; interventions: InterventionType[] },
): Promise<DbResult<CompareScenariosResult>> {
  const result = await compareScenariosRun(narrativeId, scenarioA, scenarioB);
  if (result.ok) {
    revalidate(
      DECISION_ROUTE,
      DECISION_SCENARIOS_ROUTE,
      OPERATIONS_ROUTE,
    );
  }
  return result;
}

/**
 * Compute + persist the cross-narrative impacts for ONE source narrative
 * (researcher+). Upserts one impact row per (source, target, impact_type).
 * Revalidates the decision + cross-narrative + operations routes. NEVER throws.
 */
export async function computeCrossImpactsAction(
  sourceNarrativeId: string,
): Promise<DbResult<ComputeCrossImpactsResult>> {
  const result = await computeCrossImpacts(sourceNarrativeId);
  if (result.ok) {
    revalidate(
      DECISION_ROUTE,
      DECISION_CROSS_ROUTE,
      OPERATIONS_ROUTE,
    );
  }
  return result;
}

// =============================================================================
// REBUILD (researcher+)
// =============================================================================

/**
 * Rebuild the entire decision-intelligence layer (researcher+). Passes a SERVER
 * timestamp into the deterministic engine (the engine never calls Date.now()),
 * runs the end-to-end decision-run → rankings → audit → cross-impact →
 * scenario-battle pipeline per narrative, and persists the results. Revalidates
 * the decision + simulation + operations routes. NEVER throws.
 */
export async function rebuildDecisionsAction(): Promise<
  DbResult<RebuildDecisionsSummary>
> {
  const now = new Date().toISOString();
  const result = await rebuildDecisions(now);
  if (result.ok) {
    revalidate(
      DECISION_ROUTE,
      DECISION_SCENARIOS_ROUTE,
      DECISION_CROSS_ROUTE,
      DECISION_EXPLORER_ROUTE,
      SIMULATION_ROUTE,
      OPERATIONS_ROUTE,
    );
  }
  return result;
}

// =============================================================================
// RE-EXPORTS for the UI — DbResult + Phase-13 view-model / record types.
// (Type re-exports are erased at compile time; safe in a 'use server' module.)
// =============================================================================
export type { DbResult, DbResultCode } from './persistence';
export type {
  RunDecisionResult,
  CompareScenariosResult,
  ComputeCrossImpactsResult,
  RebuildDecisionsSummary,
  DecisionDemoViews,
} from './persistence';
export type {
  // Records.
  HsinDecisionRunRecord,
  HsinScenarioComparisonRecord,
  HsinInterventionRankingRecord,
  HsinCrossNarrativeImpactRecord,
  HsinDecisionAuditRecord,
  HsinNarrativeRecord,
  // View-models.
  DecisionDashboardData,
  DecisionRunView,
  ScenarioComparisonView,
  CrossNarrativeImpactView,
  DecisionHighlights,
  DecisionExplorerResult,
  // Unions.
  DecisionType,
  DecisionImpactType,
  ScenarioWinner,
} from '@hsi/shared-types';
