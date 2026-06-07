// =============================================================================
// WorldForge — Supabase data-access layer (DAL).
//
// SERVER-ONLY — never import this from a 'use client' module. It uses next/headers
// (via lib/supabase/server.ts), so it must stay on the server. (`server-only` is
// not installed in this workspace, hence this comment instead of the import.)
//
// OWNERSHIP MODEL (Phase 2.75):
//   * READS go through the cookie-backed SSR server client (createClient). RLS
//     decides visibility: anonymous callers see only public rows; authenticated
//     callers see their own rows + public rows. No service-role for normal reads.
//   * WRITES first resolve the authenticated user via the SAME server client's
//     auth.getUser(). With NO user we return { ok:false, code:'AUTH_REQUIRED' }.
//     With a user we stamp created_by = user.id and perform the write through the
//     SAME authed client, so the RLS owner policy (created_by = auth.uid())
//     authorizes it. There is NO service-role write path for user-facing actions.
//
// DESIGN: every function returns a DbResult<T> and NEVER throws. In this sandbox
// the Supabase env vars are empty; the server client tolerates that (placeholder
// URL) and real queries fail at call time, so we wrap every query in try/catch
// and surface the error as a string (+ a machine-readable `code`). Pages render
// the error in a styled card and/or fall back to the in-browser engine demo, so
// a missing env degrades gracefully instead of white-screening.
// =============================================================================

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import type {
  WorldRecord,
  SimulationRecord,
  SimulationVersionRecord,
  ScenarioRecord,
  CounterfactualRecord,
  WorldTimelineRecord,
  SimulationProvenanceRecord,
  WorldForgeUniverseType,
  ScientificConfidenceTier,
  TimelineKind,
} from '@hsi/shared-types';
import {
  buildDependencyGraph,
  indexGraph,
  resolveAll,
  getUniverse,
  type WorldState,
} from '@hsi/simulation-engine';

// -----------------------------------------------------------------------------
// Result type
// -----------------------------------------------------------------------------
export type DbResultCode = 'AUTH_REQUIRED' | 'NOT_CONFIGURED' | 'DB_ERROR';

export type DbResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: DbResultCode };

const NOT_CONFIGURED =
  'Supabase is not configured (set NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).';

const AUTH_REQUIRED = 'Sign in to continue.';

function fail(error: unknown): { ok: false; error: string; code: DbResultCode } {
  if (error instanceof Error) {
    // Normalize the "URL/anon key required" throws (or an unreachable placeholder
    // backend) into the canonical not-configured message + code.
    if (
      /required|not configured|SUPABASE_/i.test(error.message) &&
      /key|url/i.test(error.message)
    ) {
      return { ok: false, error: NOT_CONFIGURED, code: 'NOT_CONFIGURED' };
    }
    return { ok: false, error: error.message, code: 'DB_ERROR' };
  }
  return { ok: false, error: String(error), code: 'DB_ERROR' };
}

function authRequired(): { ok: false; error: string; code: DbResultCode } {
  return { ok: false, error: AUTH_REQUIRED, code: 'AUTH_REQUIRED' };
}

// -----------------------------------------------------------------------------
// Client + identity helpers. Both are only ever called INSIDE a try/catch in the
// functions below, so a missing env surfaces as a DbResult error.
// -----------------------------------------------------------------------------

/** Per-request, cookie-backed, RLS-enforced client for reads AND writes. */
function db(): SupabaseClient {
  return createClient();
}

/** Resolve the authenticated user via the cookie session, or null. */
async function currentUser(client: SupabaseClient): Promise<User | null> {
  const {
    data: { user },
  } = await client.auth.getUser();
  return user ?? null;
}

// =============================================================================
// WORLDS
// =============================================================================

export async function listWorlds(): Promise<DbResult<WorldRecord[]>> {
  try {
    const { data, error } = await db()
      .from('worlds')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) return fail(error);
    return { ok: true, data: (data ?? []) as WorldRecord[] };
  } catch (e) {
    return fail(e);
  }
}

export async function getWorld(id: string): Promise<DbResult<WorldRecord>> {
  try {
    const { data, error } = await db()
      .from('worlds')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return fail(error);
    return { ok: true, data: data as WorldRecord };
  } catch (e) {
    return fail(e);
  }
}

export async function createWorld(input: {
  name: string;
  description?: string;
  universe_type: WorldForgeUniverseType;
  base_state: Record<string, unknown>;
  tags?: string[];
  is_public?: boolean;
}): Promise<DbResult<WorldRecord>> {
  try {
    const client = db();
    const user = await currentUser(client);
    if (!user) return authRequired();

    const { data, error } = await client
      .from('worlds')
      .insert({
        name: input.name,
        description: input.description ?? null,
        universe_type: input.universe_type,
        base_state: input.base_state,
        tags: input.tags ?? [],
        is_public: input.is_public ?? false,
        created_by: user.id,
      })
      .select('*')
      .single();
    if (error) return fail(error);
    return { ok: true, data: data as WorldRecord };
  } catch (e) {
    return fail(e);
  }
}

export async function updateWorld(
  id: string,
  patch: Partial<{
    name: string;
    description: string;
    universe_type: WorldForgeUniverseType;
    base_state: Record<string, unknown>;
    tags: string[];
    is_public: boolean;
  }>,
): Promise<DbResult<WorldRecord>> {
  try {
    const client = db();
    const user = await currentUser(client);
    if (!user) return authRequired();

    // RLS owner policy authorizes the update only when created_by = auth.uid().
    const { data, error } = await client
      .from('worlds')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) return fail(error);
    return { ok: true, data: data as WorldRecord };
  } catch (e) {
    return fail(e);
  }
}

export async function cloneWorld(
  id: string,
  opts?: { name?: string },
): Promise<DbResult<WorldRecord>> {
  try {
    // Source must be readable (public or owned) per RLS.
    const source = await getWorld(id);
    if (!source.ok) return source;
    const src = source.data;
    // Forking into the current user's ownership; createWorld stamps created_by
    // = the authed user and forces is_public=false below.
    return await createWorld({
      name: opts?.name ?? `${src.name} (copy)`,
      description: src.description ?? undefined,
      universe_type: src.universe_type,
      base_state: src.base_state,
      tags: src.tags ?? [],
      is_public: false,
    });
  } catch (e) {
    return fail(e);
  }
}

export async function setWorldPublished(
  id: string,
  isPublic: boolean,
): Promise<DbResult<WorldRecord>> {
  return updateWorld(id, { is_public: isPublic });
}

// =============================================================================
// SIMULATIONS
// =============================================================================

export async function listSimulations(
  worldId?: string,
): Promise<DbResult<SimulationRecord[]>> {
  try {
    let query = db().from('simulations').select('*');
    if (worldId) query = query.eq('world_id', worldId);
    const { data, error } = await query.order('created_at', { ascending: true });
    if (error) return fail(error);
    return { ok: true, data: (data ?? []) as SimulationRecord[] };
  } catch (e) {
    return fail(e);
  }
}

export async function getSimulation(
  id: string,
): Promise<DbResult<SimulationRecord>> {
  try {
    const { data, error } = await db()
      .from('simulations')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return fail(error);
    return { ok: true, data: data as SimulationRecord };
  } catch (e) {
    return fail(e);
  }
}

export async function createSimulation(input: {
  world_id: string;
  name: string;
  universe_type: WorldForgeUniverseType;
  current_state: Record<string, unknown>;
}): Promise<DbResult<SimulationRecord>> {
  try {
    const client = db();
    const user = await currentUser(client);
    if (!user) return authRequired();

    const { data, error } = await client
      .from('simulations')
      .insert({
        world_id: input.world_id,
        name: input.name,
        universe_type: input.universe_type,
        current_state: input.current_state,
        latest_version: 1,
        status: 'active',
        created_by: user.id,
      })
      .select('*')
      .single();
    if (error) return fail(error);
    const sim = data as SimulationRecord;

    // Also create the version-1 snapshot of the initial state.
    const { error: versionError } = await client
      .from('simulation_versions')
      .insert({
        simulation_id: sim.id,
        version: 1,
        label: 'initial',
        world_state: input.current_state,
        evaluation: null,
        parent_version: null,
        created_by: user.id,
      });
    if (versionError) return fail(versionError);

    return { ok: true, data: sim };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// SIMULATION VERSIONS — the VERSIONING FLOW.
// Read sim.latest_version, append version = latest+1, then update the simulation's
// current_state + latest_version so the simulation always points at its newest
// snapshot. Provenance for the snapshot is persisted by the caller (action) via
// saveProvenance(provenanceRowsFromGraph(state)).
// =============================================================================

export async function saveSimulationVersion(
  simulationId: string,
  input: {
    world_state: Record<string, unknown>;
    evaluation?: Record<string, unknown>;
    label?: string;
    parent_version?: number;
  },
): Promise<DbResult<SimulationVersionRecord>> {
  try {
    const client = db();
    const user = await currentUser(client);
    if (!user) return authRequired();

    // 1. Read the current latest_version.
    const { data: simRow, error: simError } = await client
      .from('simulations')
      .select('latest_version')
      .eq('id', simulationId)
      .single();
    if (simError) return fail(simError);
    const latest = (simRow?.latest_version as number) ?? 0;
    const nextVersion = latest + 1;

    // 2. Insert the new immutable snapshot (RLS owner policy authorizes it).
    const { data: versionRow, error: versionError } = await client
      .from('simulation_versions')
      .insert({
        simulation_id: simulationId,
        version: nextVersion,
        label: input.label ?? `v${nextVersion}`,
        world_state: input.world_state,
        evaluation: input.evaluation ?? null,
        parent_version: input.parent_version ?? latest,
        created_by: user.id,
      })
      .select('*')
      .single();
    if (versionError) return fail(versionError);

    // 3. Point the simulation at the new snapshot.
    const { error: updateError } = await client
      .from('simulations')
      .update({
        current_state: input.world_state,
        latest_version: nextVersion,
      })
      .eq('id', simulationId);
    if (updateError) return fail(updateError);

    return { ok: true, data: versionRow as SimulationVersionRecord };
  } catch (e) {
    return fail(e);
  }
}

export async function listVersions(
  simulationId: string,
): Promise<DbResult<SimulationVersionRecord[]>> {
  try {
    const { data, error } = await db()
      .from('simulation_versions')
      .select('*')
      .eq('simulation_id', simulationId)
      .order('version', { ascending: false });
    if (error) return fail(error);
    return { ok: true, data: (data ?? []) as SimulationVersionRecord[] };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// SCENARIOS
// =============================================================================

export async function saveScenario(input: {
  simulation_id: string;
  name: string;
  description?: string;
  parameters: Record<string, unknown>;
  result_summary?: Record<string, unknown>;
}): Promise<DbResult<ScenarioRecord>> {
  try {
    const client = db();
    const user = await currentUser(client);
    if (!user) return authRequired();

    const { data, error } = await client
      .from('scenarios')
      .insert({
        simulation_id: input.simulation_id,
        name: input.name,
        description: input.description ?? null,
        parameters: input.parameters,
        result_summary: input.result_summary ?? null,
        created_by: user.id,
      })
      .select('*')
      .single();
    if (error) return fail(error);
    return { ok: true, data: data as ScenarioRecord };
  } catch (e) {
    return fail(e);
  }
}

export async function listScenarios(
  simulationId: string,
): Promise<DbResult<ScenarioRecord[]>> {
  try {
    const { data, error } = await db()
      .from('scenarios')
      .select('*')
      .eq('simulation_id', simulationId)
      .order('created_at', { ascending: false });
    if (error) return fail(error);
    return { ok: true, data: (data ?? []) as ScenarioRecord[] };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// COUNTERFACTUALS
// =============================================================================

export async function saveCounterfactual(input: {
  simulation_id: string;
  name: string;
  modification: Record<string, unknown>;
  impact_chain?: Record<string, unknown>;
  explanation?: string;
  confidence?: number;
  affected_nodes?: number;
  base_version?: number;
}): Promise<DbResult<CounterfactualRecord>> {
  try {
    const client = db();
    const user = await currentUser(client);
    if (!user) return authRequired();

    const { data, error } = await client
      .from('counterfactuals')
      .insert({
        simulation_id: input.simulation_id,
        name: input.name,
        modification: input.modification,
        impact_chain: input.impact_chain ?? null,
        explanation: input.explanation ?? null,
        confidence: input.confidence ?? null,
        affected_nodes: input.affected_nodes ?? null,
        base_version: input.base_version ?? null,
        created_by: user.id,
      })
      .select('*')
      .single();
    if (error) return fail(error);
    return { ok: true, data: data as CounterfactualRecord };
  } catch (e) {
    return fail(e);
  }
}

export async function listCounterfactuals(
  simulationId: string,
): Promise<DbResult<CounterfactualRecord[]>> {
  try {
    const { data, error } = await db()
      .from('counterfactuals')
      .select('*')
      .eq('simulation_id', simulationId)
      .order('created_at', { ascending: false });
    if (error) return fail(error);
    return { ok: true, data: (data ?? []) as CounterfactualRecord[] };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// TIMELINES
// =============================================================================

export async function saveTimeline(input: {
  simulation_id: string;
  kind: TimelineKind;
  span_years?: number;
  events: Record<string, unknown>[];
}): Promise<DbResult<WorldTimelineRecord>> {
  try {
    const client = db();
    const user = await currentUser(client);
    if (!user) return authRequired();

    const { data, error } = await client
      .from('world_timelines')
      .insert({
        simulation_id: input.simulation_id,
        kind: input.kind,
        span_years: input.span_years ?? null,
        events: input.events,
        created_by: user.id,
      })
      .select('*')
      .single();
    if (error) return fail(error);
    return { ok: true, data: data as WorldTimelineRecord };
  } catch (e) {
    return fail(e);
  }
}

export async function listTimelines(
  simulationId: string,
): Promise<DbResult<WorldTimelineRecord[]>> {
  try {
    const { data, error } = await db()
      .from('world_timelines')
      .select('*')
      .eq('simulation_id', simulationId)
      .order('created_at', { ascending: false });
    if (error) return fail(error);
    return { ok: true, data: (data ?? []) as WorldTimelineRecord[] };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// PROVENANCE — the PROVENANCE FLOW.
// provenanceRowsFromGraph(state) builds the dependency graph for a world and maps
// each node's Provenance to a simulation_provenance row, so a persisted snapshot
// carries the same per-node traceability the live UI shows. Capped to the most
// meaningful nodes to keep the bulk insert reasonable.
// =============================================================================

export interface ProvenanceRowInput {
  node_id?: string;
  source?: string;
  reason?: string;
  depends_on?: string[];
  confidence?: number;
  scientific_tier?: ScientificConfidenceTier;
}

const MAX_PROVENANCE_ROWS = 80;

export function provenanceRowsFromGraph(
  state: WorldState,
): ProvenanceRowInput[] {
  const graph = buildDependencyGraph(state, getUniverse(state.universeType));
  const index = indexGraph(graph);
  resolveAll(graph, index);

  // Prefer derived nodes (those with upstream dependencies) — they carry the
  // richest provenance — then fall back to root inputs to fill the cap.
  const sorted = [...graph.nodes].sort(
    (a, b) => b.provenance.dependsOn.length - a.provenance.dependsOn.length,
  );

  return sorted.slice(0, MAX_PROVENANCE_ROWS).map((node) => ({
    node_id: node.id,
    source: node.provenance.source,
    reason: node.provenance.reason,
    depends_on: node.provenance.dependsOn,
    confidence: node.provenance.confidence,
    scientific_tier: node.provenance.scientificConfidence
      .tier as ScientificConfidenceTier,
  }));
}

export async function saveProvenance(
  simulationId: string,
  rows: ProvenanceRowInput[],
): Promise<DbResult<SimulationProvenanceRecord[]>> {
  try {
    if (rows.length === 0) {
      return { ok: true, data: [] };
    }
    const client = db();
    const user = await currentUser(client);
    if (!user) return authRequired();

    // simulation_provenance has NO created_by column. Its RLS owner policy is
    // authorized via the PARENT simulation's created_by = auth.uid(), so the
    // authed client can only insert rows for simulations the user owns.
    const payload = rows.map((r) => ({
      simulation_id: simulationId,
      node_id: r.node_id ?? null,
      source: r.source ?? null,
      reason: r.reason ?? null,
      depends_on: r.depends_on ?? [],
      confidence: r.confidence ?? null,
      scientific_tier: r.scientific_tier ?? null,
    }));
    const { data, error } = await client
      .from('simulation_provenance')
      .insert(payload)
      .select('*');
    if (error) return fail(error);
    return { ok: true, data: (data ?? []) as SimulationProvenanceRecord[] };
  } catch (e) {
    return fail(e);
  }
}

export async function listProvenance(
  simulationId: string,
): Promise<DbResult<SimulationProvenanceRecord[]>> {
  try {
    const { data, error } = await db()
      .from('simulation_provenance')
      .select('*')
      .eq('simulation_id', simulationId)
      .order('created_at', { ascending: false });
    if (error) return fail(error);
    return { ok: true, data: (data ?? []) as SimulationProvenanceRecord[] };
  } catch (e) {
    return fail(e);
  }
}
