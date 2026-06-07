'use server';

// =============================================================================
// WorldForge — server actions.
// Thin, serializable wrappers around the SERVER-ONLY data-access layer so client
// components can trigger Supabase persistence. Every action accepts/returns only
// plain JSON (objects/strings/numbers) — no class instances or engine objects
// cross the boundary. Mutations revalidate the affected route(s).
// =============================================================================

import { revalidatePath } from 'next/cache';
import {
  evaluateWorld,
  type WorldEvaluation,
} from '@hsi/simulation-engine';
import type {
  WorldForgeUniverseType,
  TimelineKind,
  WorldRecord,
  SimulationRecord,
  SimulationVersionRecord,
  ScenarioRecord,
  CounterfactualRecord,
  WorldTimelineRecord,
  SimulationProvenanceRecord,
} from '@hsi/shared-types';
import {
  createWorld,
  cloneWorld,
  setWorldPublished,
  createSimulation,
  listSimulations,
  saveSimulationVersion,
  listVersions,
  saveScenario,
  listScenarios,
  saveCounterfactual,
  listCounterfactuals,
  saveTimeline,
  listTimelines,
  saveProvenance,
  listProvenance,
  provenanceRowsFromGraph,
  type DbResult,
} from '@/lib/worldforge/persistence';
import {
  jsonToWorldState,
  worldStateToJson,
  evaluationToJson,
} from '@/lib/worldforge/mappers';

const WF_BASE = '/dashboard/worldforge';

// -----------------------------------------------------------------------------
// Worlds
// -----------------------------------------------------------------------------

export async function createWorldAction(input: {
  name: string;
  description?: string;
  universe_type: WorldForgeUniverseType;
  base_state: Record<string, unknown>;
  tags?: string[];
  is_public?: boolean;
}): Promise<DbResult<WorldRecord>> {
  const res = await createWorld(input);
  if (res.ok) {
    revalidatePath(WF_BASE);
    revalidatePath(`${WF_BASE}/simulations`);
  }
  return res;
}

export async function cloneWorldAction(
  worldId: string,
  name?: string,
): Promise<DbResult<WorldRecord>> {
  const res = await cloneWorld(worldId, name ? { name } : undefined);
  if (res.ok) {
    revalidatePath(WF_BASE);
    revalidatePath(`${WF_BASE}/simulations`);
  }
  return res;
}

export async function setPublishedAction(
  worldId: string,
  isPublic: boolean,
): Promise<DbResult<WorldRecord>> {
  const res = await setWorldPublished(worldId, isPublic);
  if (res.ok) {
    revalidatePath(WF_BASE);
    revalidatePath(`${WF_BASE}/simulations`);
  }
  return res;
}

// -----------------------------------------------------------------------------
// Simulations
// -----------------------------------------------------------------------------

export async function createSimulationAction(
  worldId: string,
  name: string,
  universeType: WorldForgeUniverseType,
  baseStateJson: Record<string, unknown>,
): Promise<DbResult<SimulationRecord>> {
  const res = await createSimulation({
    world_id: worldId,
    name,
    universe_type: universeType,
    current_state: baseStateJson,
  });
  if (res.ok) {
    revalidatePath(`${WF_BASE}/simulations`);
    revalidatePath(WF_BASE);
  }
  return res;
}

/**
 * Versioning flow: hydrate the incoming WorldState JSON, recompute a FRESH
 * evaluation server-side, append a new immutable version (latest+1), update the
 * simulation's current_state, and persist per-node provenance for the snapshot.
 */
export async function saveVersionAction(
  simulationId: string,
  worldStateJson: Record<string, unknown>,
  label?: string,
): Promise<DbResult<SimulationVersionRecord>> {
  const state = jsonToWorldState(worldStateJson);
  const evaluation: WorldEvaluation = evaluateWorld(state);

  const res = await saveSimulationVersion(simulationId, {
    world_state: worldStateToJson(state),
    evaluation: evaluationToJson(evaluation),
    label,
  });

  if (res.ok) {
    // Provenance flow: persist the snapshot's per-node provenance. Best-effort —
    // a provenance failure does not invalidate the saved version.
    await saveProvenance(simulationId, provenanceRowsFromGraph(state));
    revalidatePath(`${WF_BASE}/simulations`);
    revalidatePath(`${WF_BASE}/provenance`);
  }
  return res;
}

export async function listVersionsAction(
  simulationId: string,
): Promise<DbResult<SimulationVersionRecord[]>> {
  return listVersions(simulationId);
}

/** List simulations (optionally for one world) — used by save-target pickers. */
export async function listSimulationsAction(
  worldId?: string,
): Promise<DbResult<SimulationRecord[]>> {
  return listSimulations(worldId);
}

// -----------------------------------------------------------------------------
// Scenarios
// -----------------------------------------------------------------------------

export async function saveScenarioAction(
  simulationId: string,
  name: string,
  parameters: Record<string, unknown>,
  resultSummary?: Record<string, unknown>,
  description?: string,
): Promise<DbResult<ScenarioRecord>> {
  const res = await saveScenario({
    simulation_id: simulationId,
    name,
    description,
    parameters,
    result_summary: resultSummary,
  });
  if (res.ok) revalidatePath(`${WF_BASE}/scenarios`);
  return res;
}

export async function listScenariosAction(
  simulationId: string,
): Promise<DbResult<ScenarioRecord[]>> {
  return listScenarios(simulationId);
}

// -----------------------------------------------------------------------------
// Counterfactuals
// -----------------------------------------------------------------------------

export async function saveCounterfactualAction(
  simulationId: string,
  name: string,
  modification: Record<string, unknown>,
  impactChain?: Record<string, unknown>,
  explanation?: string,
  confidence?: number,
  affectedNodes?: number,
): Promise<DbResult<CounterfactualRecord>> {
  const res = await saveCounterfactual({
    simulation_id: simulationId,
    name,
    modification,
    impact_chain: impactChain,
    explanation,
    confidence,
    affected_nodes: affectedNodes,
  });
  if (res.ok) revalidatePath(`${WF_BASE}/counterfactuals`);
  return res;
}

export async function listCounterfactualsAction(
  simulationId: string,
): Promise<DbResult<CounterfactualRecord[]>> {
  return listCounterfactuals(simulationId);
}

// -----------------------------------------------------------------------------
// Timelines
// -----------------------------------------------------------------------------

export async function saveTimelineAction(
  simulationId: string,
  kind: TimelineKind,
  spanYears: number,
  events: Record<string, unknown>[],
): Promise<DbResult<WorldTimelineRecord>> {
  const res = await saveTimeline({
    simulation_id: simulationId,
    kind,
    span_years: spanYears,
    events,
  });
  if (res.ok) revalidatePath(`${WF_BASE}/timelines`);
  return res;
}

export async function listTimelinesAction(
  simulationId: string,
): Promise<DbResult<WorldTimelineRecord[]>> {
  return listTimelines(simulationId);
}

// -----------------------------------------------------------------------------
// Provenance
// -----------------------------------------------------------------------------

/**
 * Provenance flow (manual): rebuild the dependency graph for the given world
 * state server-side and persist each node's provenance for the simulation.
 */
export async function saveProvenanceAction(
  simulationId: string,
  worldStateJson: Record<string, unknown>,
): Promise<DbResult<SimulationProvenanceRecord[]>> {
  const state = jsonToWorldState(worldStateJson);
  const res = await saveProvenance(simulationId, provenanceRowsFromGraph(state));
  if (res.ok) revalidatePath(`${WF_BASE}/provenance`);
  return res;
}

export async function listProvenanceAction(
  simulationId: string,
): Promise<DbResult<SimulationProvenanceRecord[]>> {
  return listProvenance(simulationId);
}
