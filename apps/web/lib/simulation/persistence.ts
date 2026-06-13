// =============================================================================
// HSIN Phase 12 — Counterfactual Simulation Engine data-access layer (DAL).
// SERVER-ONLY.
//
// "What would have happened if X never happened — and how good are our forecasts
// really?" The persistence layer for the Phase-12 counterfactual + backtesting
// layer over the Phase-10/11 narrative-intelligence graph (migration 0016):
//   * RUNS       — hsin_counterfactual_runs: a single "what if?" simulation over a
//                  narrative (scenario_type, confidence, inputs_json, results_json).
//   * EVENTS     — hsin_counterfactual_events: the action a run applied to a causal
//                  event (removed/reduced/amplified/delayed/accelerated + impact).
//   * RESULTS    — hsin_simulation_results: a simulated predicted state/probability
//                  scored against the actual (error_score).
//   * ACCURACY   — hsin_forecast_accuracy: rolling accuracy/calibration per
//                  narrative + forecast window (the one mutable table; upsert).
//   * SCENARIOS  — hsin_worldforge_scenarios: an alternate world-state materialized
//                  from a run (world_state, confidence) — the WorldForge bridge.
//
// The PURE, deterministic engine lives in '@hsi/counterfactual-engine'. This DAL
// loads each narrative's CounterfactualInput from the Phase-10/11 hsin_* tables
// (snapshots ordered / evolution / causal events / latest forecast), feeds it to
// the engine, and persists the results. Reads assemble the Phase-12 view-models
// the WorldForge simulation / backtesting / scenarios consoles render.
//
// SERVER-ONLY — never import from a 'use client' module (uses next/headers via
// lib/supabase/server.ts). `server-only` is not installed in this workspace, so
// this comment stands in for the import (mirrors lib/causal/persistence.ts).
//
// AUTHZ MODEL (migration 0016 RLS, mirrored here for clean DbResult errors):
//   * All 5 Phase-12 tables are part of the SHARED narrative-intelligence graph:
//       authenticated READ; researcher+ INSERT/UPDATE/DELETE; admin all.
//   * We gate the writes (runCounterfactual / generateWorldforgeScenario /
//     rebuildSimulation) at researcher (RLS is the backstop). Reads go through the
//     RLS client. NO service-role path — the background counterfactual worker uses
//     service_role; the app is RLS-scoped.
//
// DESIGN: every function returns DbResult<T> and NEVER throws. Empty Supabase env
// degrades gracefully (NOT_CONFIGURED) so `next build` passes. The rebuild wraps
// each stage so a partial failure still persists what it can.
// =============================================================================

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { loadHighestRole } from '@/lib/auth/get-session-role';
import { formatErrorMessage, logError } from '@/lib/errors/format-error';
import { createClient } from '@/lib/supabase/server';
import {
  backtestForecasts,
  calibrateConfidence,
  computeForecastAccuracy,
  counterfactualDemo,
  generateCounterfactual,
  generateCounterfactualWorld,
  INTERVENTION_PRESETS,
  type BacktestRecord,
  type CausalEvent,
  type CounterfactualInput,
  type CounterfactualResult,
  type EvolutionRecord,
  type NarrativeForecast,
  type NarrativeSnapshot,
  type ScenarioType,
} from '@hsi/counterfactual-engine';
import type {
  AppRole,
  BacktestingView,
  CounterfactualActionType,
  CounterfactualRunView,
  CounterfactualScenarioType,
  HsinCounterfactualEventRecord,
  HsinCounterfactualRunRecord,
  HsinForecastAccuracyRecord,
  HsinNarrativeForecastRecord,
  HsinNarrativeRecord,
  HsinSimulationResultRecord,
  HsinWorldforgeScenarioRecord,
  SimulationHighlights,
  SimulationOverview,
  WorldforgeScenariosView,
} from '@hsi/shared-types';

// -----------------------------------------------------------------------------
// Result type — canonical DbResult with 'FORBIDDEN' (Phase 6/7/8/9/10/11).
// -----------------------------------------------------------------------------
export type DbResultCode =
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'NOT_CONFIGURED'
  | 'DB_ERROR';

export type DbResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: DbResultCode };

const NOT_CONFIGURED =
  'Supabase is not configured (set NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).';

const AUTH_REQUIRED = 'Sign in to continue.';

export function fail(error: unknown): {
  ok: false;
  error: string;
  code: DbResultCode;
} {
  logError('simulation/persistence', error);
  if (
    error instanceof Error &&
    /required|not configured|SUPABASE_/i.test(error.message) &&
    /key|url/i.test(error.message)
  ) {
    return { ok: false, error: NOT_CONFIGURED, code: 'NOT_CONFIGURED' };
  }
  return { ok: false, error: formatErrorMessage(error), code: 'DB_ERROR' };
}

function authRequired(): { ok: false; error: string; code: DbResultCode } {
  return { ok: false, error: AUTH_REQUIRED, code: 'AUTH_REQUIRED' };
}

export function forbidden(required: AppRole): {
  ok: false;
  error: string;
  code: DbResultCode;
} {
  return {
    ok: false,
    error: `Requires the ${required} role or higher.`,
    code: 'FORBIDDEN',
  };
}

// -----------------------------------------------------------------------------
// Client + identity + role helpers (mirror lib/causal/persistence.ts).
// -----------------------------------------------------------------------------

/** Per-request, cookie-backed, RLS-enforced client for reads AND writes. */
function db(): SupabaseClient {
  return createClient();
}

async function currentUser(client: SupabaseClient): Promise<User | null> {
  const {
    data: { user },
  } = await client.auth.getUser();
  return user ?? null;
}

/** Ascending privilege ladder. viewer < researcher < reviewer < curator < admin. */
const ROLE_LEVEL: Record<AppRole, number> = {
  viewer: 1,
  researcher: 2,
  reviewer: 3,
  curator: 4,
  admin: 5,
};

async function sessionRole(client: SupabaseClient): Promise<AppRole | null> {
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;
  return loadHighestRole(client, user.id);
}

async function requireRole(
  client: SupabaseClient,
  min: AppRole,
): Promise<
  | { ok: true; user: User; role: AppRole }
  | { ok: false; error: string; code: DbResultCode }
> {
  const user = await currentUser(client);
  if (!user) return authRequired();
  const role = (await sessionRole(client)) ?? 'viewer';
  if (ROLE_LEVEL[role] < ROLE_LEVEL[min]) return forbidden(min);
  return { ok: true, user, role };
}

// -----------------------------------------------------------------------------
// Typed JSON helpers — keep `any` out of signatures.
// -----------------------------------------------------------------------------
export type JsonRecord = Record<string, unknown>;

/** Cast an arbitrary engine value into the jsonb record shape (never `any`). */
function toJson(value: unknown): JsonRecord {
  return (value ?? {}) as JsonRecord;
}

/** Read a numeric metric out of a jsonb record, else undefined. */
function numFrom(rec: JsonRecord | undefined, key: string): number | undefined {
  const v = rec?.[key];
  return typeof v === 'number' ? v : undefined;
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0;
  return Math.round((nums.reduce((a, n) => a + n, 0) / nums.length) * 1e4) / 1e4;
}

// -----------------------------------------------------------------------------
// Engine union → DB union guards. The engine + DB use identical string sets;
// these guards keep the persisted value inside the migration-0016 CHECK domains.
// -----------------------------------------------------------------------------
const SCENARIO_TYPES: CounterfactualScenarioType[] = [
  'remove_event',
  'delay_event',
  'accelerate_event',
  'reduce_amplification',
  'increase_amplification',
  'remove_source',
  'add_source',
  'remove_community',
  'increase_reliability',
  'decrease_reliability',
  'remove_contradiction',
  'increase_contradiction',
];

const ACTION_TYPES: CounterfactualActionType[] = [
  'removed',
  'reduced',
  'amplified',
  'delayed',
  'accelerated',
];

/** Guard an engine/string scenario type into the migration-0016 CHECK domain. */
function asScenarioType(t: ScenarioType | string): CounterfactualScenarioType {
  return (SCENARIO_TYPES as string[]).includes(t)
    ? (t as CounterfactualScenarioType)
    : 'remove_event';
}

/** Guard an engine/string action into the migration-0016 CHECK domain. */
function asActionType(t: string): CounterfactualActionType {
  return (ACTION_TYPES as string[]).includes(t)
    ? (t as CounterfactualActionType)
    : 'removed';
}

// -----------------------------------------------------------------------------
// DB row → engine input adapters. Reused by loadCounterfactualInput.
// -----------------------------------------------------------------------------

interface SnapshotRow {
  id: string;
  narrative_id: string;
  captured_at: string;
  signal_count?: number | null;
  source_count?: number | null;
  community_count?: number | null;
  amplification_score?: number | null;
  reliability_score?: number | null;
  support_ratio?: number | null;
  contradiction_ratio?: number | null;
  metadata?: JsonRecord | null;
}

function rowToSnapshot(r: SnapshotRow): NarrativeSnapshot {
  return {
    id: r.id,
    narrativeId: r.narrative_id,
    capturedAt: r.captured_at,
    signalCount: r.signal_count ?? 0,
    sourceCount: r.source_count ?? 0,
    communityCount: r.community_count ?? 0,
    amplificationScore: r.amplification_score ?? 0,
    reliabilityScore: r.reliability_score ?? 0,
    supportRatio: r.support_ratio ?? 0,
    contradictionRatio: r.contradiction_ratio ?? 0,
    metadata: r.metadata ?? undefined,
  };
}

interface EvolutionRow {
  id: string;
  narrative_id?: string | null;
  parent_snapshot_id?: string | null;
  child_snapshot_id?: string | null;
  change_type?: string | null;
  growth_pct?: number | null;
  confidence?: number | null;
  metrics_json?: JsonRecord | null;
  reasoning_json?: JsonRecord | null;
  created_at?: string | null;
}

const EVOLUTION_CHANGE_TYPES = ['growth', 'decline', 'mutation', 'split', 'merge'];

function rowToEvolution(r: EvolutionRow): EvolutionRecord {
  const m = r.metrics_json ?? {};
  const reasoningRaw = r.reasoning_json?.reasoning;
  const ct = r.change_type ?? 'growth';
  return {
    id: r.id,
    narrativeId: r.narrative_id ?? '',
    parentSnapshotId: r.parent_snapshot_id ?? '',
    childSnapshotId: r.child_snapshot_id ?? '',
    changeType: (EVOLUTION_CHANGE_TYPES.includes(ct)
      ? ct
      : 'growth') as EvolutionRecord['changeType'],
    growthPct: r.growth_pct ?? 0,
    amplificationDelta: numFrom(m, 'amplificationDelta') ?? 0,
    communityDelta: numFrom(m, 'communityDelta') ?? 0,
    sourceDelta: numFrom(m, 'sourceDelta') ?? 0,
    reliabilityDelta: numFrom(m, 'reliabilityDelta') ?? 0,
    contradictionDelta: numFrom(m, 'contradictionDelta') ?? 0,
    confidence: r.confidence ?? 0,
    reasoning: Array.isArray(reasoningRaw)
      ? (reasoningRaw as unknown[]).map((x) => String(x))
      : [],
    createdAt: r.created_at ?? '',
  };
}

// Engine CausalEvent type set (mirror migration 0015 CHECK domain).
const CAUSAL_EVENT_TYPES = [
  'signal_surge',
  'source_expansion',
  'community_growth',
  'amplification_spike',
  'contradiction_drop',
  'contradiction_rise',
  'forecast_shift',
  'influence_transfer',
];

interface CausalEventRow {
  id: string;
  narrative_id: string;
  event_type?: string | null;
  event_strength?: number | null;
  confidence?: number | null;
  explanation?: string | null;
  metrics_json?: JsonRecord | null;
  occurred_at?: string | null;
  created_at?: string | null;
}

/** Coerce a jsonb metrics record into the engine's number|string-valued map. */
function toMetrics(rec: JsonRecord | null | undefined): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  if (!rec) return out;
  for (const [k, v] of Object.entries(rec)) {
    if (typeof v === 'number' || typeof v === 'string') out[k] = v;
  }
  return out;
}

function rowToCausalEvent(r: CausalEventRow): CausalEvent {
  const et = r.event_type ?? 'signal_surge';
  return {
    id: r.id,
    narrativeId: r.narrative_id,
    eventType: (CAUSAL_EVENT_TYPES.includes(et)
      ? et
      : 'signal_surge') as CausalEvent['eventType'],
    eventStrength: r.event_strength ?? 0,
    confidence: r.confidence ?? 0,
    explanation: r.explanation ?? '',
    occurredAt: r.occurred_at ?? '',
    metrics: toMetrics(r.metrics_json),
    createdAt: r.created_at ?? '',
  };
}

const FORECAST_STATES = ['emerging', 'rising', 'stable', 'declining', 'dead'];

function recordToForecast(
  r: HsinNarrativeForecastRecord | undefined,
): NarrativeForecast | undefined {
  if (!r) return undefined;
  const ft = r.forecast_type ?? 'stable';
  const reasoningRaw = (r.reasoning ?? {}).reasoning;
  const dist = r.distribution_json as
    | NarrativeForecast['distribution']
    | undefined;
  return {
    id: r.id,
    narrativeId: r.narrative_id ?? '',
    forecastType: (FORECAST_STATES.includes(ft)
      ? ft
      : 'stable') as NarrativeForecast['forecastType'],
    probability: r.probability ?? 0,
    reasoning: Array.isArray(reasoningRaw)
      ? (reasoningRaw as unknown[]).map((x) => String(x))
      : [],
    distribution: dist,
    generatedAt: r.generated_at,
  };
}

/**
 * Load the full CounterfactualInput for one narrative from the Phase-10/11 tables.
 * Snapshots (ordered) + evolution + causal events + latest forecast — reconstructed
 * into the engine shapes exactly like the causal/temporal DALs do. NEVER throws
 * (query errors degrade to empty arrays — the caller decides how to surface them).
 */
async function loadCounterfactualInput(
  client: SupabaseClient,
  narrativeId: string,
  now: string,
): Promise<CounterfactualInput> {
  const { data: snapRows } = await client
    .from('hsin_narrative_snapshots')
    .select(
      'id, narrative_id, captured_at, signal_count, source_count, community_count, amplification_score, reliability_score, support_ratio, contradiction_ratio, metadata',
    )
    .eq('narrative_id', narrativeId)
    .order('captured_at', { ascending: true })
    .limit(5000);
  const snapshots = ((snapRows ?? []) as SnapshotRow[]).map(rowToSnapshot);

  const { data: evoRows } = await client
    .from('hsin_narrative_evolution')
    .select('*')
    .eq('narrative_id', narrativeId)
    .order('created_at', { ascending: true })
    .limit(5000);
  const evolution = ((evoRows ?? []) as EvolutionRow[]).map(rowToEvolution);

  const { data: eventRows } = await client
    .from('hsin_causal_events')
    .select(
      'id, narrative_id, event_type, event_strength, confidence, explanation, metrics_json, occurred_at, created_at',
    )
    .eq('narrative_id', narrativeId)
    .order('occurred_at', { ascending: true })
    .limit(10000);
  const events = ((eventRows ?? []) as CausalEventRow[]).map(rowToCausalEvent);

  const { data: fcRows } = await client
    .from('hsin_narrative_forecasts')
    .select('*')
    .eq('narrative_id', narrativeId)
    .order('generated_at', { ascending: false })
    .limit(1);
  const forecast = recordToForecast(
    ((fcRows ?? []) as HsinNarrativeForecastRecord[])[0],
  );

  return { narrativeId, snapshots, evolution, events, forecast, now };
}

// =============================================================================
// READS (authenticated — RLS scopes visibility; anon/empty → empty lists)
// =============================================================================

export interface CounterfactualRunFilters {
  narrativeId?: string;
  scenarioType?: CounterfactualScenarioType;
}

/**
 * Simulation overview: recent + top counterfactual runs, rolling forecast
 * accuracy, materialized WorldForge scenarios, and aggregate accuracy/calibration.
 * RLS: any authenticated user reads. NEVER throws.
 */
export async function getSimulationOverview(): Promise<
  DbResult<SimulationOverview>
> {
  try {
    const client = db();

    const { data: recentRows, error: rerr } = await client
      .from('hsin_counterfactual_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    if (rerr) return fail(rerr);
    const recentRuns = (recentRows ?? []) as HsinCounterfactualRunRecord[];

    const { data: topRows, error: terr } = await client
      .from('hsin_counterfactual_runs')
      .select('*')
      .order('confidence', { ascending: false, nullsFirst: false })
      .limit(10);
    if (terr) return fail(terr);
    const topRuns = (topRows ?? []) as HsinCounterfactualRunRecord[];

    const { data: accRows, error: aerr } = await client
      .from('hsin_forecast_accuracy')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(200);
    if (aerr) return fail(aerr);
    const accuracy = (accRows ?? []) as HsinForecastAccuracyRecord[];

    const { data: scenRows, error: serr } = await client
      .from('hsin_worldforge_scenarios')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (serr) return fail(serr);
    const scenarios = (scenRows ?? []) as HsinWorldforgeScenarioRecord[];

    const avgAccuracy = mean(
      accuracy
        .map((a) => a.accuracy_score)
        .filter((n): n is number => typeof n === 'number'),
    );
    const avgCalibration = mean(
      accuracy
        .map((a) => a.calibration_score)
        .filter((n): n is number => typeof n === 'number'),
    );

    return {
      ok: true,
      data: { recentRuns, topRuns, accuracy, scenarios, avgAccuracy, avgCalibration },
    };
  } catch (e) {
    return fail(e);
  }
}

/**
 * List counterfactual runs, optionally filtered by narrative + scenario type,
 * newest first. RLS: any authenticated user reads. NEVER throws.
 */
export async function getCounterfactualRuns(
  filters?: CounterfactualRunFilters,
): Promise<DbResult<HsinCounterfactualRunRecord[]>> {
  try {
    let q = db().from('hsin_counterfactual_runs').select('*');
    if (filters?.narrativeId) q = q.eq('narrative_id', filters.narrativeId);
    if (filters?.scenarioType) q = q.eq('scenario_type', filters.scenarioType);
    const { data, error } = await q
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error) return fail(error);
    return { ok: true, data: (data ?? []) as HsinCounterfactualRunRecord[] };
  } catch (e) {
    return fail(e);
  }
}

/**
 * A single counterfactual run + its applied events + simulated results + the
 * source narrative. RLS: any authenticated user reads. NEVER throws.
 */
export async function getCounterfactualRun(
  id: string,
): Promise<DbResult<CounterfactualRunView>> {
  try {
    const client = db();

    const { data: runRow, error: runErr } = await client
      .from('hsin_counterfactual_runs')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (runErr) return fail(runErr);
    if (!runRow) {
      return { ok: false, error: 'Counterfactual run not found.', code: 'DB_ERROR' };
    }
    const run = runRow as HsinCounterfactualRunRecord;

    const { data: eventRows, error: evErr } = await client
      .from('hsin_counterfactual_events')
      .select('*')
      .eq('counterfactual_run_id', id)
      .order('created_at', { ascending: true })
      .limit(5000);
    if (evErr) return fail(evErr);
    const events = (eventRows ?? []) as HsinCounterfactualEventRecord[];

    const { data: resultRows, error: resErr } = await client
      .from('hsin_simulation_results')
      .select('*')
      .eq('counterfactual_run_id', id)
      .order('created_at', { ascending: true })
      .limit(5000);
    if (resErr) return fail(resErr);
    const results = (resultRows ?? []) as HsinSimulationResultRecord[];

    const { data: narrativeRow } = await client
      .from('hsin_narratives')
      .select('*')
      .eq('id', run.narrative_id)
      .maybeSingle();
    const narrative = (narrativeRow as HsinNarrativeRecord | null) ?? null;

    return { ok: true, data: { run, events, results, narrative } };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Backtesting view: rolling forecast accuracy + simulation results + the source
 * narratives, plus aggregate accuracy/calibration and a per-window confidence
 * DRIFT series (stated mean confidence vs empirical accuracy). The stated value is
 * derived from the calibration_score relation (stated = empirical + (1 −
 * calibration), the inverse of calibrationScore = 1 − |stated − empirical|), so a
 * low calibration surfaces as a wide stated-vs-empirical gap. RLS: any
 * authenticated user reads. NEVER throws.
 */
export async function getBacktesting(): Promise<DbResult<BacktestingView>> {
  try {
    const client = db();

    const { data: accRows, error: aerr } = await client
      .from('hsin_forecast_accuracy')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1000);
    if (aerr) return fail(aerr);
    const accuracy = (accRows ?? []) as HsinForecastAccuracyRecord[];

    const { data: resultRows, error: rerr } = await client
      .from('hsin_simulation_results')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(2000);
    if (rerr) return fail(rerr);
    const results = (resultRows ?? []) as HsinSimulationResultRecord[];

    const { data: narrativeRows, error: nerr } = await client
      .from('hsin_narratives')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(2000);
    if (nerr) return fail(nerr);
    const narratives = (narrativeRows ?? []) as HsinNarrativeRecord[];

    const avgAccuracy = mean(
      accuracy
        .map((a) => a.accuracy_score)
        .filter((n): n is number => typeof n === 'number'),
    );
    const avgCalibration = mean(
      accuracy
        .map((a) => a.calibration_score)
        .filter((n): n is number => typeof n === 'number'),
    );

    // Confidence drift per window: aggregate empirical accuracy + reconstruct the
    // stated confidence implied by the calibration score. calibrationScore =
    // 1 − |stated − empirical|, so the implied stated gap is (1 − calibration);
    // we add it to the empirical accuracy to surface the overconfidence side.
    const byWindow = new Map<
      string,
      { acc: number[]; cal: number[] }
    >();
    for (const a of accuracy) {
      const w = a.forecast_window ?? 'all';
      const bucket = byWindow.get(w) ?? { acc: [], cal: [] };
      if (typeof a.accuracy_score === 'number') bucket.acc.push(a.accuracy_score);
      if (typeof a.calibration_score === 'number') bucket.cal.push(a.calibration_score);
      byWindow.set(w, bucket);
    }
    const confidenceDrift = [...byWindow.entries()].map(([window, b]) => {
      const empirical = mean(b.acc);
      const calib = mean(b.cal);
      const stated = Math.round(Math.min(1, empirical + (1 - calib)) * 1e4) / 1e4;
      return { window, stated, empirical };
    });

    return {
      ok: true,
      data: {
        accuracy,
        results,
        narratives,
        avgAccuracy,
        avgCalibration,
        confidenceDrift,
      },
    };
  } catch (e) {
    return fail(e);
  }
}

/**
 * WorldForge scenarios view: materialized scenarios joined to their counterfactual
 * runs + the source narratives. RLS: any authenticated user reads. NEVER throws.
 */
export async function getWorldforgeScenarios(): Promise<
  DbResult<WorldforgeScenariosView>
> {
  try {
    const client = db();

    const { data: scenRows, error: serr } = await client
      .from('hsin_worldforge_scenarios')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    if (serr) return fail(serr);
    const scenarioRecords = (scenRows ?? []) as HsinWorldforgeScenarioRecord[];

    const runIds = Array.from(
      new Set(scenarioRecords.map((s) => s.counterfactual_run_id).filter(Boolean)),
    );
    const runById = new Map<string, HsinCounterfactualRunRecord>();
    if (runIds.length > 0) {
      const { data: runRows } = await client
        .from('hsin_counterfactual_runs')
        .select('*')
        .in('id', runIds)
        .limit(1000);
      for (const r of (runRows ?? []) as HsinCounterfactualRunRecord[]) {
        runById.set(r.id, r);
      }
    }

    const scenarios = scenarioRecords.map((s) => ({
      ...s,
      run: runById.get(s.counterfactual_run_id),
    }));

    // Narratives behind those runs.
    const narrativeIds = Array.from(
      new Set(
        scenarios
          .map((s) => s.run?.narrative_id)
          .filter((id): id is string => typeof id === 'string'),
      ),
    );
    let narratives: HsinNarrativeRecord[] = [];
    if (narrativeIds.length > 0) {
      const { data: narrativeRows } = await client
        .from('hsin_narratives')
        .select('*')
        .in('id', narrativeIds)
        .limit(2000);
      narratives = (narrativeRows ?? []) as HsinNarrativeRecord[];
    }

    return { ok: true, data: { scenarios, narratives } };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Headline simulation callouts for the dashboard:
 *   * simulationQueue   — queued-run count placeholder (0; no queue table yet);
 *   * latestRun         — the newest counterfactual run (id/narrative/type/conf);
 *   * forecastAccuracy  — mean rolling accuracy across windows;
 *   * calibrationHealth — mean rolling calibration across windows;
 *   * scenariosGenerated— count of materialized WorldForge scenarios.
 * Best-effort: each callout degrades to undefined/0 on missing data. RLS: any
 * authenticated user reads. NEVER throws.
 */
export async function getSimulationHighlights(): Promise<
  DbResult<SimulationHighlights>
> {
  try {
    const client = db();
    const highlights: SimulationHighlights = { simulationQueue: 0 };

    const { data: latestRows } = await client
      .from('hsin_counterfactual_runs')
      .select('id, narrative_id, scenario_name, scenario_type, confidence')
      .order('created_at', { ascending: false })
      .limit(1);
    const latest = ((latestRows ?? []) as Array<{
      id: string;
      narrative_id: string;
      scenario_name?: string | null;
      scenario_type: CounterfactualScenarioType;
      confidence?: number | null;
    }>)[0];
    if (latest) {
      let name = latest.scenario_name ?? '';
      if (!name) {
        const { data: nrow } = await client
          .from('hsin_narratives')
          .select('name')
          .eq('id', latest.narrative_id)
          .maybeSingle();
        name = (nrow?.name as string | undefined) ?? latest.narrative_id;
      }
      highlights.latestRun = {
        id: latest.id,
        narrativeId: latest.narrative_id,
        name,
        scenarioType: asScenarioType(latest.scenario_type),
        confidence: latest.confidence ?? 0,
      };
    }

    const { data: accRows } = await client
      .from('hsin_forecast_accuracy')
      .select('accuracy_score, calibration_score')
      .limit(1000);
    const accs = (accRows ?? []) as Array<{
      accuracy_score?: number | null;
      calibration_score?: number | null;
    }>;
    highlights.forecastAccuracy = mean(
      accs
        .map((a) => a.accuracy_score)
        .filter((n): n is number => typeof n === 'number'),
    );
    highlights.calibrationHealth = mean(
      accs
        .map((a) => a.calibration_score)
        .filter((n): n is number => typeof n === 'number'),
    );

    const { count } = await client
      .from('hsin_worldforge_scenarios')
      .select('id', { count: 'exact', head: true });
    highlights.scenariosGenerated = count ?? 0;

    return { ok: true, data: highlights };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// WRITES (researcher+) — run the engine + persist runs / events / results /
// accuracy / scenarios. RLS is the backstop; we gate at researcher for clean
// DbResult errors. NEVER throw.
// =============================================================================

export interface RunCounterfactualParams {
  targetEventId?: string;
  magnitude?: number;
  name?: string;
}

export interface RunCounterfactualResult {
  runId: string;
  result: CounterfactualResult;
}

/**
 * Persist a CounterfactualResult as a run + its per-change events. Returns the new
 * run id. Shared by runCounterfactual + rebuildSimulation. The caller has already
 * gated the role. NEVER throws (returns null run id on insert failure).
 */
async function persistRun(
  client: SupabaseClient,
  result: CounterfactualResult,
  createdBy: string,
  now: string,
): Promise<string | null> {
  const { data: runRow, error: runErr } = await client
    .from('hsin_counterfactual_runs')
    .insert({
      narrative_id: result.narrativeId,
      scenario_name: result.scenarioName,
      scenario_type: asScenarioType(result.scenarioType),
      confidence: result.confidence,
      summary: result.summary,
      inputs_json: toJson({
        scenarioType: result.scenarioType,
        scenarioName: result.scenarioName,
        confidenceBand: result.confidenceBand,
        reasoning: result.reasoning,
        limitations: result.limitations,
        evidence: result.evidence,
      }),
      results_json: toJson(result),
      generated_at: result.generatedAt ?? now,
      created_by: createdBy,
    })
    .select('id')
    .single();
  if (runErr || !runRow?.id) return null;
  const runId = runRow.id as string;

  for (const c of result.changes) {
    await client.from('hsin_counterfactual_events').insert({
      counterfactual_run_id: runId,
      // original_event_id is a uuid FK; only set it when it looks like a real id.
      original_event_id: c.originalEventId ?? null,
      action: asActionType(c.action),
      impact_score: c.impactScore,
      reasoning: c.reasoning,
    });
  }
  return runId;
}

/**
 * Run ONE counterfactual over a narrative (researcher+). Loads the
 * CounterfactualInput from the temporal/causal tables, runs generateCounterfactual,
 * and persists the run + its per-change events. Returns the new run id + the full
 * engine result. NEVER throws.
 */
export async function runCounterfactual(
  narrativeId: string,
  scenarioType: CounterfactualScenarioType,
  params?: RunCounterfactualParams,
): Promise<DbResult<RunCounterfactualResult>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'researcher');
    if (!gate.ok) return gate;

    const now = new Date().toISOString();
    const input = await loadCounterfactualInput(client, narrativeId, now);

    const result = generateCounterfactual(
      input,
      {
        type: scenarioType as ScenarioType,
        targetEventId: params?.targetEventId,
        magnitude: params?.magnitude,
        name: params?.name,
      },
      now,
    );

    const runId = await persistRun(client, result, gate.user.id, now);
    if (!runId) {
      return {
        ok: false,
        error: 'Failed to persist the counterfactual run.',
        code: 'DB_ERROR',
      };
    }

    return { ok: true, data: { runId, result } };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Materialize a WorldForge scenario from an existing counterfactual run
 * (researcher+). Loads the run's results_json (the persisted CounterfactualResult),
 * runs generateCounterfactualWorld, and inserts a hsin_worldforge_scenarios row,
 * optionally linked to an existing hsin_worldforge_links row for the narrative.
 * NEVER throws.
 */
export async function generateWorldforgeScenario(
  counterfactualRunId: string,
): Promise<DbResult<{ scenarioId: string }>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'researcher');
    if (!gate.ok) return gate;

    const { data: runRow, error: runErr } = await client
      .from('hsin_counterfactual_runs')
      .select('id, narrative_id, results_json')
      .eq('id', counterfactualRunId)
      .maybeSingle();
    if (runErr) return fail(runErr);
    if (!runRow) {
      return { ok: false, error: 'Counterfactual run not found.', code: 'DB_ERROR' };
    }

    const result = (runRow.results_json ?? {}) as unknown as CounterfactualResult;
    if (!result || !result.counterfactual || !result.counterfactual.frames) {
      return {
        ok: false,
        error: 'Run has no stored result to generate a scenario from.',
        code: 'DB_ERROR',
      };
    }

    const now = new Date().toISOString();
    // generateCounterfactualWorld only consumes the result; pass a minimal input.
    const minimalInput: CounterfactualInput = {
      narrativeId: result.narrativeId,
      snapshots: [],
      evolution: [],
      events: [],
      now,
    };
    const world = generateCounterfactualWorld(minimalInput, result, now);

    // Optionally link to an existing WorldForge link for the narrative (best-effort).
    let worldforgeLinkId: string | null = null;
    try {
      const { data: linkRow } = await client
        .from('hsin_worldforge_links')
        .select('id')
        .eq('narrative_id', runRow.narrative_id as string)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      worldforgeLinkId = (linkRow?.id as string | undefined) ?? null;
    } catch {
      // hsin_worldforge_links is owned by an earlier phase; absence is non-fatal.
      worldforgeLinkId = null;
    }

    const { data: scenRow, error: scenErr } = await client
      .from('hsin_worldforge_scenarios')
      .insert({
        counterfactual_run_id: counterfactualRunId,
        worldforge_link_id: worldforgeLinkId,
        scenario_title: world.scenarioTitle,
        scenario_summary: world.scenarioSummary,
        world_state: toJson(world.worldState),
        confidence: world.confidence,
      })
      .select('id')
      .single();
    if (scenErr || !scenRow?.id) {
      return fail(scenErr ?? new Error('Scenario insert returned no id.'));
    }

    return { ok: true, data: { scenarioId: scenRow.id as string } };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// REBUILD (researcher+) — the END-TO-END compute + persist pipeline.
// =============================================================================

export interface RebuildSimulationSummary {
  narrativesProcessed: number;
  runs: number;
  events: number;
  results: number;
  accuracyWindows: number;
  scenarios: number;
}

interface NarrativeIdRow {
  id: string;
}

/**
 * Derive a backtest history for a narrative from its forecasts + the subsequent
 * snapshots. For each forecast we find the snapshot captured just BEFORE it
 * (prior) and the first snapshot captured AFTER it (actual), so the engine can
 * score the prediction against the observed transition. Returns [] when there is
 * not enough history. NEVER throws.
 */
function buildBacktestHistory(
  snapshots: NarrativeSnapshot[],
  forecasts: NarrativeForecast[],
): {
  forecast: NarrativeForecast;
  priorSnapshot: NarrativeSnapshot;
  actualSnapshotAfter: NarrativeSnapshot;
}[] {
  const ordered = [...snapshots].sort(
    (a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt),
  );
  const history: {
    forecast: NarrativeForecast;
    priorSnapshot: NarrativeSnapshot;
    actualSnapshotAfter: NarrativeSnapshot;
  }[] = [];
  for (const forecast of forecasts) {
    const at = Date.parse(forecast.generatedAt);
    if (Number.isNaN(at)) continue;
    let prior: NarrativeSnapshot | undefined;
    let after: NarrativeSnapshot | undefined;
    for (const s of ordered) {
      const t = Date.parse(s.capturedAt);
      if (t <= at) prior = s;
      else {
        after = s;
        break;
      }
    }
    if (prior && after) {
      history.push({ forecast, priorSnapshot: prior, actualSnapshotAfter: after });
    }
  }
  return history;
}

/**
 * Rebuild the entire counterfactual + backtesting layer (researcher+) for a
 * server-supplied `now`. For each narrative:
 *   1. Load its CounterfactualInput from the temporal/causal tables.
 *   2. Run a REPRESENTATIVE set of counterfactuals (the INTERVENTION_PRESETS),
 *      persisting each as a run + its per-change events.
 *   3. Derive a backtest history from the narrative's forecasts + subsequent
 *      snapshots, backtestForecasts → computeForecastAccuracy → UPSERT
 *      hsin_forecast_accuracy (unique narrative + window), and persist one
 *      hsin_simulation_results row per backtest record (predicted vs actual +
 *      error_score), tied to the most-confident run for that narrative.
 *   4. calibrateConfidence over the backtest (informs the persisted confidence).
 *   5. generateCounterfactualWorld for the top run of the narrative → insert a
 *      hsin_worldforge_scenarios row.
 *
 * Each stage is wrapped so a partial failure still persists what it can; the
 * returned summary reflects what was actually written. NEVER throws.
 */
export async function rebuildSimulation(
  now: string,
): Promise<DbResult<RebuildSimulationSummary>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'researcher');
    if (!gate.ok) return gate;

    const summary: RebuildSimulationSummary = {
      narrativesProcessed: 0,
      runs: 0,
      events: 0,
      results: 0,
      accuracyWindows: 0,
      scenarios: 0,
    };

    const { data: narrativeRows, error: nerr } = await client
      .from('hsin_narratives')
      .select('id')
      .limit(2000);
    if (nerr) return fail(nerr);
    const narrativeIds = ((narrativeRows ?? []) as NarrativeIdRow[]).map((n) => n.id);
    if (narrativeIds.length === 0) return { ok: true, data: summary };

    const presets = Object.values(INTERVENTION_PRESETS);

    for (const narrativeId of narrativeIds) {
      try {
        const input = await loadCounterfactualInput(client, narrativeId, now);
        if (input.snapshots.length === 0) continue;
        summary.narrativesProcessed += 1;

        // ---- 2. Representative counterfactuals (one per preset) -------------
        const runOutcomes: { runId: string; result: CounterfactualResult }[] = [];
        for (const preset of presets) {
          try {
            const result = generateCounterfactual(
              input,
              {
                type: preset.scenarioType,
                magnitude: preset.magnitude,
                name: preset.label,
              },
              now,
            );
            const runId = await persistRun(client, result, gate.user.id, now);
            if (runId) {
              summary.runs += 1;
              summary.events += result.changes.length;
              runOutcomes.push({ runId, result });
            }
          } catch (e) {
            logError('simulation/persistence:rebuild-preset', e);
          }
        }

        // The most-confident run anchors this narrative's results + scenario.
        const topRun = runOutcomes
          .slice()
          .sort((a, b) => b.result.confidence - a.result.confidence)[0];

        // ---- 3. Backtest → accuracy + simulation results --------------------
        try {
          const { data: fcRows } = await client
            .from('hsin_narrative_forecasts')
            .select('*')
            .eq('narrative_id', narrativeId)
            .order('generated_at', { ascending: true })
            .limit(1000);
          const forecasts = ((fcRows ?? []) as HsinNarrativeForecastRecord[])
            .map(recordToForecast)
            .filter((f): f is NarrativeForecast => !!f);

          const history = buildBacktestHistory(input.snapshots, forecasts);
          const backtest: BacktestRecord[] = backtestForecasts(history, now);

          if (backtest.length > 0) {
            const window = '7d';
            const accuracy = computeForecastAccuracy(backtest, narrativeId, window);

            // UPSERT one rolling row per (narrative, window).
            const { data: existing } = await client
              .from('hsin_forecast_accuracy')
              .select('id')
              .eq('narrative_id', narrativeId)
              .eq('forecast_window', window)
              .maybeSingle();
            if (existing?.id) {
              const { error } = await client
                .from('hsin_forecast_accuracy')
                .update({
                  prediction_count: accuracy.predictionCount,
                  accuracy_score: accuracy.accuracyScore,
                  calibration_score: accuracy.calibrationScore,
                })
                .eq('id', existing.id as string);
              if (!error) summary.accuracyWindows += 1;
            } else {
              const { error } = await client.from('hsin_forecast_accuracy').insert({
                narrative_id: narrativeId,
                forecast_window: window,
                prediction_count: accuracy.predictionCount,
                accuracy_score: accuracy.accuracyScore,
                calibration_score: accuracy.calibrationScore,
              });
              if (!error) summary.accuracyWindows += 1;
            }

            // calibrateConfidence informs honesty; computed for completeness.
            void calibrateConfidence(backtest);

            // Persist predicted-vs-actual results, anchored to the top run.
            if (topRun) {
              const fcById = new Map(forecasts.map((f) => [f.id, f]));
              for (const b of backtest) {
                const fid = b.forecastId ? fcById.get(b.forecastId)?.id : undefined;
                const { error } = await client
                  .from('hsin_simulation_results')
                  .insert({
                    counterfactual_run_id: topRun.runId,
                    forecast_id: fid ?? null,
                    predicted_state: b.predictedState,
                    predicted_probability: b.predictedProbability,
                    actual_state: b.actualState,
                    actual_probability: b.actualProbability,
                    error_score: b.errorScore,
                  });
                if (!error) summary.results += 1;
              }
            }
          }
        } catch (e) {
          logError('simulation/persistence:rebuild-backtest', e);
        }

        // ---- 5. WorldForge scenario for the top run -------------------------
        if (topRun) {
          try {
            const world = generateCounterfactualWorld(input, topRun.result, now);
            const { error } = await client
              .from('hsin_worldforge_scenarios')
              .insert({
                counterfactual_run_id: topRun.runId,
                scenario_title: world.scenarioTitle,
                scenario_summary: world.scenarioSummary,
                world_state: toJson(world.worldState),
                confidence: world.confidence,
              });
            if (!error) summary.scenarios += 1;
          } catch (e) {
            logError('simulation/persistence:rebuild-scenario', e);
          }
        }
      } catch (e) {
        logError('simulation/persistence:rebuild-narrative', e);
      }
    }

    return { ok: true, data: summary };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// DEMO — labeled, NON-PERSISTED view-models from the package counterfactualDemo().
// For the NOT_CONFIGURED / empty-env showcase path. NEVER throws.
// =============================================================================

export interface SimulationDemoViews {
  overview: SimulationOverview;
  backtesting: BacktestingView;
  scenarios: WorldforgeScenariosView;
  highlights: SimulationHighlights;
  runs: CounterfactualRunView[];
}

/**
 * Build the Phase-12 view-models from the deterministic engine fixtures
 * (counterfactualDemo). Synthetic ids; clearly a demo. The UI renders this when
 * Supabase is not configured. NEVER throws (counterfactualDemo is pure/offline).
 */
export async function demoSimulation(): Promise<DbResult<SimulationDemoViews>> {
  try {
    const demo = counterfactualDemo();
    const now = demo.now;
    const allResults: CounterfactualResult[] = [
      ...demo.counterfactuals,
      ...demo.interventions,
    ];

    // Synthetic narratives behind the demo results.
    const narrativeIds = Array.from(
      new Set(allResults.map((r) => r.narrativeId)),
    );
    const narratives: HsinNarrativeRecord[] = narrativeIds.map((id) => ({
      id,
      name: id,
      created_at: now,
      updated_at: now,
    }));

    // Runs (+ per-change events + a results row from the demo backtest).
    const runRecords: HsinCounterfactualRunRecord[] = [];
    const runs: CounterfactualRunView[] = [];
    allResults.forEach((r, i) => {
      const runId = `demo-run-${i}`;
      const run: HsinCounterfactualRunRecord = {
        id: runId,
        created_at: now,
        narrative_id: r.narrativeId,
        scenario_name: r.scenarioName,
        scenario_type: asScenarioType(r.scenarioType),
        confidence: r.confidence,
        summary: r.summary,
        inputs_json: toJson({ confidenceBand: r.confidenceBand }),
        results_json: toJson(r),
        generated_at: r.generatedAt,
      };
      runRecords.push(run);
      const events: HsinCounterfactualEventRecord[] = r.changes.map((c, j) => ({
        id: `demo-cf-event-${i}-${j}`,
        counterfactual_run_id: runId,
        original_event_id: c.originalEventId,
        action: asActionType(c.action),
        impact_score: c.impactScore,
        reasoning: c.reasoning,
        created_at: now,
      }));
      runs.push({
        run,
        events,
        results: [],
        narrative: narratives.find((n) => n.id === r.narrativeId) ?? null,
      });
    });

    // Accuracy (from the demo backtest) for narrative 'demo'.
    const accuracy: HsinForecastAccuracyRecord[] = [
      {
        id: 'demo-accuracy-7d',
        narrative_id: demo.accuracy.narrativeId,
        forecast_window: demo.accuracy.forecastWindow,
        prediction_count: demo.accuracy.predictionCount,
        accuracy_score: demo.accuracy.accuracyScore,
        calibration_score: demo.accuracy.calibrationScore,
        updated_at: now,
        created_at: now,
      },
    ];

    // Simulation results from the demo backtest, anchored to the first run.
    const anchorRunId = runRecords[0]?.id ?? 'demo-run-0';
    const simResults: HsinSimulationResultRecord[] = demo.backtest.map((b, i) => ({
      id: `demo-sim-result-${i}`,
      counterfactual_run_id: anchorRunId,
      forecast_id: b.forecastId,
      predicted_state: b.predictedState,
      predicted_probability: b.predictedProbability,
      actual_state: b.actualState,
      actual_probability: b.actualProbability,
      error_score: b.errorScore,
      created_at: now,
    }));

    // Scenarios from the demo worlds.
    const scenarioRecords: (HsinWorldforgeScenarioRecord & {
      run?: HsinCounterfactualRunRecord;
    })[] = demo.worlds.map((w, i) => ({
      id: `demo-scenario-${i}`,
      counterfactual_run_id: runRecords[i]?.id ?? anchorRunId,
      scenario_title: w.scenarioTitle,
      scenario_summary: w.scenarioSummary,
      world_state: toJson(w.worldState),
      confidence: w.confidence,
      created_at: now,
      run: runRecords[i],
    }));

    const avgAccuracy = mean(
      accuracy
        .map((a) => a.accuracy_score)
        .filter((n): n is number => typeof n === 'number'),
    );
    const avgCalibration = mean(
      accuracy
        .map((a) => a.calibration_score)
        .filter((n): n is number => typeof n === 'number'),
    );

    const overview: SimulationOverview = {
      recentRuns: runRecords,
      topRuns: [...runRecords].sort(
        (a, b) => (b.confidence ?? 0) - (a.confidence ?? 0),
      ),
      accuracy,
      scenarios: scenarioRecords,
      avgAccuracy,
      avgCalibration,
    };

    const confidenceDrift = [
      {
        window: demo.accuracy.forecastWindow,
        stated:
          Math.round(
            Math.min(
              1,
              demo.accuracy.accuracyScore + (1 - demo.accuracy.calibrationScore),
            ) * 1e4,
          ) / 1e4,
        empirical: demo.accuracy.accuracyScore,
      },
    ];

    const backtesting: BacktestingView = {
      accuracy,
      results: simResults,
      narratives,
      avgAccuracy,
      avgCalibration,
      confidenceDrift,
    };

    const scenarios: WorldforgeScenariosView = {
      scenarios: scenarioRecords,
      narratives,
    };

    const top = overview.topRuns[0];
    const highlights: SimulationHighlights = {
      simulationQueue: 0,
      latestRun: top
        ? {
            id: top.id,
            narrativeId: top.narrative_id,
            name: top.narrative_id,
            scenarioType: top.scenario_type,
            confidence: top.confidence ?? 0,
          }
        : undefined,
      forecastAccuracy: avgAccuracy,
      calibrationHealth: avgCalibration,
      scenariosGenerated: scenarioRecords.length,
    };

    return {
      ok: true,
      data: { overview, backtesting, scenarios, highlights, runs },
    };
  } catch (e) {
    return fail(e);
  }
}

// -----------------------------------------------------------------------------
// Re-export the shared client accessor + role helper for the actions layer.
// -----------------------------------------------------------------------------
export { db as simulationDbClient, requireRole as requireSimulationRole };
