// =============================================================================
// HSIN Phase 13 — Decision Intelligence & Strategic War-Gaming data-access layer
// (DAL). SERVER-ONLY.
//
// "What should we do next, and which intervention has the highest probability of
// success?" The persistence layer for the Phase-13 decision-intelligence layer
// over the temporal / causal / counterfactual narrative-intelligence graph
// (migration 0017):
//   * RUNS        — hsin_decision_runs: a recommended strategic action for a
//                   narrative (decision_type, confidence, reasoning, limitations).
//   * COMPARISONS — hsin_scenario_comparisons: a head-to-head scenario A vs B
//                   war-game for a run (winner, confidence, reasoning).
//   * RANKINGS    — hsin_intervention_rankings: ranked candidate interventions for
//                   a run (expected_effect, risk_score, confidence, rank_position).
//   * IMPACTS     — hsin_cross_narrative_impacts: how one narrative affects another
//                   (amplifies/dampens/triggers/competes/reinforces/neutral);
//                   unique per (source, target, impact_type) → idempotent upsert.
//   * AUDITS      — hsin_decision_audits: the tamper-evident audit record for a run
//                   (decision_output, confidence, limitations, audit_log).
//
// The PURE, deterministic engine lives in '@hsi/decision-intelligence'. This DAL
// loads each narrative's DecisionInput from the Phase-10/11/12 hsin_* tables
// (snapshots ordered / evolution / causal events / latest forecast / influence
// in+out / optional calibration from hsin_forecast_accuracy), feeds it to the
// engine, and persists the results. Reads assemble the Phase-13 view-models the
// decision / war-gaming / cross-narrative / explorer consoles render.
//
// SERVER-ONLY — never import from a 'use client' module (uses next/headers via
// lib/supabase/server.ts). `server-only` is not installed in this workspace, so
// this comment stands in for the import (mirrors lib/simulation/persistence.ts).
//
// AUTHZ MODEL (migration 0017 RLS, mirrored here for clean DbResult errors):
//   * All 5 Phase-13 tables are part of the SHARED narrative-intelligence graph:
//       authenticated READ; researcher+ INSERT/UPDATE/DELETE; admin all.
//   * We gate the writes (runDecision / compareScenariosRun / computeCrossImpacts
//     / rebuildDecisions) at researcher (RLS is the backstop). Reads go through the
//     RLS client. NO service-role path — the background decision worker uses
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
import { calibrateConfidence } from '@hsi/counterfactual-engine';
import {
  buildDecisionAudit,
  compareScenarios,
  computeCrossNarrativeImpact,
  decisionDemo,
  generateDecisionRun,
  rankInterventions,
  simulateInterventionSet,
  type Calibration,
  type CausalEvent,
  type CrossNarrativeImpact,
  type CrossNarrativeTarget,
  type DecisionAudit,
  type DecisionInput,
  type DecisionRun,
  type EvolutionRecord,
  type InfluenceEdge,
  type InterventionType,
  type NarrativeForecast,
  type NarrativeSnapshot,
  type ScenarioBattleResult,
} from '@hsi/decision-intelligence';
import type {
  AppRole,
  CrossNarrativeImpactView,
  DecisionDashboardData,
  DecisionExplorerResult,
  DecisionHighlights,
  DecisionImpactType,
  DecisionRunView,
  DecisionType,
  HsinCrossNarrativeImpactRecord,
  HsinDecisionAuditRecord,
  HsinDecisionRunRecord,
  HsinInterventionRankingRecord,
  HsinNarrativeForecastRecord,
  HsinNarrativeRecord,
  HsinScenarioComparisonRecord,
  ScenarioComparisonView,
} from '@hsi/shared-types';

// -----------------------------------------------------------------------------
// Result type — canonical DbResult with 'FORBIDDEN' (Phase 6/7/8/9/10/11/12).
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
  logError('decision/persistence', error);
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
// Client + identity + role helpers (mirror lib/simulation/persistence.ts).
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

/** A string[] wrapped into a jsonb record (reasoning/limitations columns). */
function listJson(items: string[]): JsonRecord {
  return { items };
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
// these guards keep the persisted value inside the migration-0017 CHECK domains.
// -----------------------------------------------------------------------------
const DECISION_TYPES: DecisionType[] = [
  'intervention',
  'monitor',
  'escalate',
  'no_action',
  'counter_narrative',
];

const IMPACT_TYPES: DecisionImpactType[] = [
  'amplifies',
  'dampens',
  'triggers',
  'competes',
  'reinforces',
  'neutral',
];

/** The 12 intervention types (== the 12 counterfactual scenario types). */
const INTERVENTION_TYPES: InterventionType[] = [
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

/** Guard an engine/string decision type into the migration-0017 CHECK domain. */
function asDecisionType(t: DecisionType | string): DecisionType {
  return (DECISION_TYPES as string[]).includes(t)
    ? (t as DecisionType)
    : 'monitor';
}

/** Guard an engine/string impact type into the migration-0017 CHECK domain. */
function asImpactType(t: string): DecisionImpactType {
  return (IMPACT_TYPES as string[]).includes(t)
    ? (t as DecisionImpactType)
    : 'neutral';
}

/** Guard an engine/string intervention type into the known catalogue. */
function asInterventionType(t: string): InterventionType {
  return (INTERVENTION_TYPES as string[]).includes(t)
    ? (t as InterventionType)
    : 'remove_event';
}

// -----------------------------------------------------------------------------
// DB row → engine input adapters. Reused by loadDecisionInput.
// (Identical shapes to the Phase-11/12 DALs; the engines share these types.)
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
function toMetrics(
  rec: JsonRecord | null | undefined,
): Record<string, number | string> {
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

interface InfluenceRow {
  id: string;
  source_narrative_id: string;
  target_narrative_id: string;
  influence_score?: number | null;
  shared_entities?: number | null;
  shared_sources?: number | null;
  shared_communities?: number | null;
  rationale?: string | null;
  created_at: string;
}

function rowToInfluence(r: InfluenceRow): InfluenceEdge {
  return {
    id: r.id,
    sourceNarrativeId: r.source_narrative_id,
    targetNarrativeId: r.target_narrative_id,
    influenceScore: r.influence_score ?? 0,
    sharedEntities: r.shared_entities ?? 0,
    sharedSources: r.shared_sources ?? 0,
    sharedCommunities: r.shared_communities ?? 0,
    rationale: r.rationale ?? '',
    createdAt: r.created_at,
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

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * Reconstruct a calibrateConfidence-COMPATIBLE Calibration from the rolling
 * hsin_forecast_accuracy rows for one narrative. We do NOT have the per-band
 * backtest records (those live behind the Phase-12 worker), only the aggregate
 * accuracy + calibration scores — so we build a faithful, conservative model:
 *   * the mean calibration_score (0..1, where 1 = perfectly calibrated) becomes a
 *     uniform multiplicative `adjustment` applied to raw confidence;
 *   * since the engine's contract is "pull overconfident bands DOWN, never up",
 *     the adjustment is clamped to ≤ 1 — a well-calibrated history (≈1) leaves
 *     confidence untouched; a poorly-calibrated one shaves it down.
 * Returns undefined when there is no accuracy history (caller passes undefined,
 * leaving the engine on its raw confidence). NEVER throws.
 */
function buildCalibration(
  accuracyRows: Array<{
    accuracy_score?: number | null;
    calibration_score?: number | null;
  }>,
): Calibration | undefined {
  const calScores = accuracyRows
    .map((a) => a.calibration_score)
    .filter((n): n is number => typeof n === 'number');
  const accScores = accuracyRows
    .map((a) => a.accuracy_score)
    .filter((n): n is number => typeof n === 'number');
  if (calScores.length === 0) return undefined;

  const adjustment = clamp01(mean(calScores));
  const empiricalAccuracy = accScores.length > 0 ? clamp01(mean(accScores)) : adjustment;
  // overconfidenceIndex ≈ how far the calibration falls short of perfect (1).
  const overconfidenceIndex = Math.round((1 - adjustment) * 1e4) / 1e4;

  const bands: Calibration['bands'] = (['low', 'medium', 'high'] as const).map(
    (band) => ({
      band,
      statedConfidence: band === 'low' ? 0.3 : band === 'medium' ? 0.5 : 0.8,
      empiricalAccuracy,
      adjustment,
    }),
  );

  return {
    bands,
    overconfidenceIndex,
    calibrate(raw: number): {
      calibrated: number;
      band: Calibration['bands'][number]['band'];
    } {
      const r = clamp01(raw);
      const band = r >= 0.66 ? 'high' : r >= 0.4 ? 'medium' : 'low';
      const calibrated = Math.round(clamp01(r * adjustment) * 1e4) / 1e4;
      return { calibrated, band };
    },
  };
}

/**
 * Phase 16 (Calibration & Trust) — LEARNING INTEGRATION.
 *
 * Build a calibrateConfidence-COMPATIBLE Calibration from the LATEST overall
 * calibration snapshot (migration 0020, hsin_calibration_snapshots) so a decision
 * run's confidence is grounded in EMPIRICALLY OBSERVED success per confidence band
 * rather than the raw stated confidence. The snapshot's `curve` jsonb is the engine
 * ReliabilityCurve (bins with meanConfidence vs observedSuccess); `calibrate(raw)`
 * maps a raw confidence to the observed success of the bin that CONTAINS it (pull
 * toward reality), and overconfidenceIndex carries the snapshot's signed index.
 *
 * Returns undefined when no snapshot / no populated bins exist (caller keeps its
 * prior calibration). Best-effort + additive; NEVER throws.
 */
async function loadLatestCalibrationOverride(
  client: SupabaseClient,
): Promise<Calibration | undefined> {
  const { data: snapRows } = await client
    .from('hsin_calibration_snapshots')
    .select('curve, overconfidence_index, generated_at, created_at')
    .order('generated_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1);
  const snapshot = ((snapRows ?? []) as Array<{
    curve?: JsonRecord | null;
    overconfidence_index?: number | null;
  }>)[0];
  if (!snapshot?.curve) return undefined;

  const rawBins = (snapshot.curve as JsonRecord).bins;
  if (!Array.isArray(rawBins) || rawBins.length === 0) return undefined;

  // The reliability bins, sorted by their lower edge.
  const curveBins = rawBins
    .map((b) => b as JsonRecord)
    .map((b) => ({
      lower: typeof b.lower === 'number' ? b.lower : 0,
      upper: typeof b.upper === 'number' ? b.upper : 1,
      count: typeof b.count === 'number' ? b.count : 0,
      meanConfidence: typeof b.meanConfidence === 'number' ? b.meanConfidence : 0,
      observedSuccess:
        typeof b.observedSuccess === 'number' ? b.observedSuccess : 0,
    }))
    .sort((a, b) => a.lower - b.lower);
  if (!curveBins.some((b) => b.count > 0)) return undefined;

  const overconfidenceIndex = Math.max(
    0,
    typeof snapshot.overconfidence_index === 'number'
      ? snapshot.overconfidence_index
      : 0,
  );

  // Engine Calibration.bands are advisory metadata; map low/medium/high to the
  // observed success of the bin that contains their representative confidence.
  const observedAt = (raw: number): number => {
    const r = clamp01(raw);
    const populated = curveBins.filter((b) => b.count > 0);
    // The bin whose [lower, upper) contains r (last bin inclusive of 1).
    const hit =
      populated.find((b) => r >= b.lower && r < b.upper) ??
      populated.find((b) => r >= b.lower) ??
      populated[populated.length - 1];
    return hit ? clamp01(hit.observedSuccess) : r;
  };

  const bands: Calibration['bands'] = (['low', 'medium', 'high'] as const).map(
    (band) => {
      const stated = band === 'low' ? 0.3 : band === 'medium' ? 0.5 : 0.8;
      const empiricalAccuracy = observedAt(stated);
      const adjustment = stated > 0 ? clamp01(empiricalAccuracy / stated) : 1;
      return { band, statedConfidence: stated, empiricalAccuracy, adjustment };
    },
  );

  return {
    bands,
    overconfidenceIndex: Math.round(overconfidenceIndex * 1e4) / 1e4,
    calibrate(raw: number): {
      calibrated: number;
      band: Calibration['bands'][number]['band'];
    } {
      const r = clamp01(raw);
      const band = r >= 0.66 ? 'high' : r >= 0.4 ? 'medium' : 'low';
      // Calibrated confidence = the observed historical success at this band.
      const calibrated = Math.round(observedAt(r) * 1e4) / 1e4;
      return { calibrated, band };
    },
  };
}

/**
 * Load the full DecisionInput for one narrative from the Phase-10/11/12 tables.
 * Snapshots (ordered) + evolution + causal events + latest forecast + inbound /
 * outbound influence + optional calibration from hsin_forecast_accuracy. NEVER
 * throws (query errors degrade to empty arrays — the caller decides how to
 * surface them).
 */
async function loadDecisionInput(
  client: SupabaseClient,
  narrativeId: string,
  now: string,
): Promise<DecisionInput> {
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

  const { data: outRows } = await client
    .from('hsin_narrative_influence')
    .select('*')
    .eq('source_narrative_id', narrativeId)
    .order('influence_score', { ascending: false })
    .limit(2000);
  const influenceOut = ((outRows ?? []) as InfluenceRow[]).map(rowToInfluence);

  const { data: inRows } = await client
    .from('hsin_narrative_influence')
    .select('*')
    .eq('target_narrative_id', narrativeId)
    .order('influence_score', { ascending: false })
    .limit(2000);
  const influenceIn = ((inRows ?? []) as InfluenceRow[]).map(rowToInfluence);

  // Optional calibration from the Phase-12 rolling accuracy rows.
  let calibration: Calibration | undefined;
  try {
    const { data: accRows } = await client
      .from('hsin_forecast_accuracy')
      .select('accuracy_score, calibration_score')
      .eq('narrative_id', narrativeId)
      .limit(200);
    calibration = buildCalibration(
      (accRows ?? []) as Array<{
        accuracy_score?: number | null;
        calibration_score?: number | null;
      }>,
    );
  } catch {
    // hsin_forecast_accuracy is owned by Phase 12; absence is non-fatal.
    calibration = undefined;
  }

  // Phase 16 (Calibration & Trust): augment with the latest empirical calibration
  // curve so FUTURE recommendation confidence is grounded in observed success, not
  // raw stated confidence. Additive + backward compatible — absent snapshot leaves
  // behavior unchanged. Wrapped so it NEVER breaks a decision run.
  try {
    const curveCalibration = await loadLatestCalibrationOverride(client);
    if (curveCalibration) calibration = curveCalibration;
  } catch {
    // Phase-16 tables absence / any failure is non-fatal — keep prior calibration.
  }

  return {
    narrativeId,
    snapshots,
    evolution,
    events,
    forecast,
    influenceOut,
    influenceIn,
    calibration,
    now,
  };
}

// =============================================================================
// READS (authenticated — RLS scopes visibility; anon/empty → empty lists)
// =============================================================================

/**
 * Decision dashboard: recent decision runs, top intervention rankings,
 * highest-risk narratives (by ranking risk_score), the recommendation queue
 * (runs whose decision_type is 'intervention' or 'escalate'), and aggregate
 * confidence across runs. RLS: any authenticated user reads. NEVER throws.
 */
export async function getDecisionDashboard(): Promise<
  DbResult<DecisionDashboardData>
> {
  try {
    const client = db();

    const { data: recentRows, error: rerr } = await client
      .from('hsin_decision_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    if (rerr) return fail(rerr);
    const recentRuns = (recentRows ?? []) as HsinDecisionRunRecord[];

    const { data: rankRows, error: kerr } = await client
      .from('hsin_intervention_rankings')
      .select('*')
      .order('rank_position', { ascending: true, nullsFirst: false })
      .order('confidence', { ascending: false, nullsFirst: false })
      .limit(20);
    if (kerr) return fail(kerr);
    const topRankings = (rankRows ?? []) as HsinInterventionRankingRecord[];

    // Highest-risk narratives: the top rankings by risk_score, mapped to their
    // run's narrative + name. We resolve narrative ids via the runs the rankings
    // belong to (rankings carry no narrative_id directly).
    const { data: riskRankRows, error: xerr } = await client
      .from('hsin_intervention_rankings')
      .select('decision_run_id, risk_score, intervention_type')
      .order('risk_score', { ascending: false, nullsFirst: false })
      .limit(200);
    if (xerr) return fail(xerr);
    const riskRanks = (riskRankRows ?? []) as Array<{
      decision_run_id: string;
      risk_score?: number | null;
      intervention_type?: string | null;
    }>;

    const runIds = Array.from(
      new Set(riskRanks.map((r) => r.decision_run_id).filter(Boolean)),
    );
    const narrativeByRun = new Map<string, string>();
    if (runIds.length > 0) {
      const { data: runRows } = await client
        .from('hsin_decision_runs')
        .select('id, narrative_id')
        .in('id', runIds)
        .limit(1000);
      for (const r of (runRows ?? []) as Array<{
        id: string;
        narrative_id: string;
      }>) {
        narrativeByRun.set(r.id, r.narrative_id);
      }
    }

    const nameById = await loadNarrativeNames(client);

    // Highest risk per narrative (keep the single worst ranking per narrative).
    const worstByNarrative = new Map<string, number>();
    for (const rr of riskRanks) {
      const nid = narrativeByRun.get(rr.decision_run_id);
      if (!nid || typeof rr.risk_score !== 'number') continue;
      const prev = worstByNarrative.get(nid) ?? -Infinity;
      if (rr.risk_score > prev) worstByNarrative.set(nid, rr.risk_score);
    }
    const highestRiskNarratives = [...worstByNarrative.entries()]
      .map(([narrativeId, riskScore]) => ({
        narrativeId,
        name: nameById.get(narrativeId) ?? narrativeId,
        riskScore,
      }))
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 10);

    // Recommendation queue: runs that recommend an active response.
    const { data: recRows, error: cerr } = await client
      .from('hsin_decision_runs')
      .select('*')
      .in('decision_type', ['intervention', 'escalate'])
      .order('created_at', { ascending: false })
      .limit(50);
    if (cerr) return fail(cerr);
    const recommendations = (recRows ?? []) as HsinDecisionRunRecord[];

    const avgConfidence = mean(
      recentRuns
        .map((r) => r.confidence)
        .filter((n): n is number => typeof n === 'number'),
    );

    return {
      ok: true,
      data: {
        recentRuns,
        topRankings,
        highestRiskNarratives,
        recommendations,
        avgConfidence,
      },
    };
  } catch (e) {
    return fail(e);
  }
}

/** Best-effort narrative id → name lookup. NEVER throws. */
async function loadNarrativeNames(
  client: SupabaseClient,
): Promise<Map<string, string>> {
  const nameById = new Map<string, string>();
  try {
    const { data } = await client
      .from('hsin_narratives')
      .select('id, name')
      .limit(5000);
    for (const n of (data ?? []) as Array<{ id: string; name: string }>) {
      nameById.set(n.id, n.name);
    }
  } catch {
    // narratives table absence is non-fatal — ids stand in for names.
  }
  return nameById;
}

/**
 * A single decision run + its intervention rankings + scenario comparisons +
 * the most-recent audit + the source narrative. RLS: any authenticated user
 * reads. NEVER throws.
 */
export async function getDecisionRun(
  id: string,
): Promise<DbResult<DecisionRunView>> {
  try {
    const client = db();

    const { data: runRow, error: runErr } = await client
      .from('hsin_decision_runs')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (runErr) return fail(runErr);
    if (!runRow) {
      return { ok: false, error: 'Decision run not found.', code: 'DB_ERROR' };
    }
    const run = runRow as HsinDecisionRunRecord;

    const { data: rankRows, error: kerr } = await client
      .from('hsin_intervention_rankings')
      .select('*')
      .eq('decision_run_id', id)
      .order('rank_position', { ascending: true, nullsFirst: false })
      .limit(1000);
    if (kerr) return fail(kerr);
    const rankings = (rankRows ?? []) as HsinInterventionRankingRecord[];

    const { data: compRows, error: cerr } = await client
      .from('hsin_scenario_comparisons')
      .select('*')
      .eq('decision_run_id', id)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (cerr) return fail(cerr);
    const comparisons = (compRows ?? []) as HsinScenarioComparisonRecord[];

    const { data: auditRows, error: aerr } = await client
      .from('hsin_decision_audits')
      .select('*')
      .eq('decision_run_id', id)
      .order('created_at', { ascending: false })
      .limit(1);
    if (aerr) return fail(aerr);
    const audit = ((auditRows ?? []) as HsinDecisionAuditRecord[])[0] ?? null;

    const { data: narrativeRow } = await client
      .from('hsin_narratives')
      .select('*')
      .eq('id', run.narrative_id)
      .maybeSingle();
    const narrative = (narrativeRow as HsinNarrativeRecord | null) ?? null;

    return {
      ok: true,
      data: { run, rankings, comparisons, audit, narrative },
    };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Scenario war-gaming view: all scenario comparisons joined to their decision
 * runs + the source narratives behind those runs. RLS: any authenticated user
 * reads. NEVER throws.
 */
export async function getScenarioComparisons(): Promise<
  DbResult<ScenarioComparisonView>
> {
  try {
    const client = db();

    const { data: compRows, error: cerr } = await client
      .from('hsin_scenario_comparisons')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    if (cerr) return fail(cerr);
    const compRecords = (compRows ?? []) as HsinScenarioComparisonRecord[];

    const runIds = Array.from(
      new Set(compRecords.map((c) => c.decision_run_id).filter(Boolean)),
    );
    const runById = new Map<string, HsinDecisionRunRecord>();
    if (runIds.length > 0) {
      const { data: runRows } = await client
        .from('hsin_decision_runs')
        .select('*')
        .in('id', runIds)
        .limit(1000);
      for (const r of (runRows ?? []) as HsinDecisionRunRecord[]) {
        runById.set(r.id, r);
      }
    }

    const comparisons = compRecords.map((c) => ({
      ...c,
      run: runById.get(c.decision_run_id),
    }));

    const narrativeIds = Array.from(
      new Set(
        comparisons
          .map((c) => c.run?.narrative_id)
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

    return { ok: true, data: { comparisons, narratives } };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Cross-narrative impact view: the directed impacts (optionally scoped to a
 * source OR target narrative) + the narratives they reference. RLS: any
 * authenticated user reads. NEVER throws.
 */
export async function getCrossNarrativeImpacts(
  narrativeId?: string,
): Promise<DbResult<CrossNarrativeImpactView>> {
  try {
    const client = db();

    let q = client.from('hsin_cross_narrative_impacts').select('*');
    if (narrativeId) {
      // Scope to impacts where the narrative is EITHER source or target.
      q = q.or(
        `source_narrative_id.eq.${narrativeId},target_narrative_id.eq.${narrativeId}`,
      );
    }
    const { data: impactRows, error: ierr } = await q
      .order('impact_strength', { ascending: false, nullsFirst: false })
      .limit(2000);
    if (ierr) return fail(ierr);
    const impacts = (impactRows ?? []) as HsinCrossNarrativeImpactRecord[];

    const narrativeIds = Array.from(
      new Set(
        impacts.flatMap((i) => [i.source_narrative_id, i.target_narrative_id]),
      ),
    ).filter(Boolean);
    let narratives: HsinNarrativeRecord[] = [];
    if (narrativeIds.length > 0) {
      const { data: narrativeRows } = await client
        .from('hsin_narratives')
        .select('*')
        .in('id', narrativeIds)
        .limit(2000);
      narratives = (narrativeRows ?? []) as HsinNarrativeRecord[];
    }

    return { ok: true, data: { narratives, impacts } };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Headline decision callouts for the dashboard:
 *   * decisionHealth        — mean confidence across recent decision runs;
 *   * recommendationQueue   — count of active-response runs (intervention/escalate);
 *   * topRisks              — highest-risk narratives (by ranking risk_score);
 *   * scenarioBattles       — count of scenario comparisons;
 *   * crossNarrativeEffects — count of cross-narrative impacts.
 * Best-effort: each callout degrades to undefined/0 on missing data. RLS: any
 * authenticated user reads. NEVER throws.
 */
export async function getDecisionHighlights(): Promise<
  DbResult<DecisionHighlights>
> {
  try {
    const client = db();
    const highlights: DecisionHighlights = {};

    const { data: runRows } = await client
      .from('hsin_decision_runs')
      .select('confidence, decision_type')
      .limit(2000);
    const runs = (runRows ?? []) as Array<{
      confidence?: number | null;
      decision_type?: string | null;
    }>;
    highlights.decisionHealth = mean(
      runs
        .map((r) => r.confidence)
        .filter((n): n is number => typeof n === 'number'),
    );
    highlights.recommendationQueue = runs.filter(
      (r) => r.decision_type === 'intervention' || r.decision_type === 'escalate',
    ).length;

    // Top risks (reuse the dashboard derivation, capped at 5).
    const dash = await getDecisionDashboard();
    if (dash.ok) {
      highlights.topRisks = dash.data.highestRiskNarratives.slice(0, 5);
    }

    const { count: battleCount } = await client
      .from('hsin_scenario_comparisons')
      .select('id', { count: 'exact', head: true });
    highlights.scenarioBattles = battleCount ?? 0;

    const { count: impactCount } = await client
      .from('hsin_cross_narrative_impacts')
      .select('id', { count: 'exact', head: true });
    highlights.crossNarrativeEffects = impactCount ?? 0;

    return { ok: true, data: highlights };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Decision explorer — DERIVED ON READ (not persisted). Loads the narrative's
 * DecisionInput and, for the requested intervention type, runs
 * simulateInterventionSet([type]) for the expected effect / confidence /
 * reasoning / limitations, and reads the per-type ranking (rankInterventions
 * filtered to the type) for the risk score. RLS: any authenticated user reads.
 * NEVER throws.
 */
export async function exploreDecision(
  narrativeId: string,
  interventionType: InterventionType | string,
): Promise<DbResult<DecisionExplorerResult>> {
  try {
    const client = db();
    const now = new Date().toISOString();
    const type = asInterventionType(interventionType);
    const input = await loadDecisionInput(client, narrativeId, now);

    const set = simulateInterventionSet(input, [type], now);
    const rankings = rankInterventions(input, now);
    const ranking = rankings.find((r) => r.interventionType === type);

    // Expected effect: prefer the signed ranking effect (−100..100); fall back to
    // the intervention-set signal delta. Risk: from the ranking (0..100).
    const expectedEffect =
      ranking?.expectedEffect ?? set.deltas.signalDeltaPct;
    const riskScore = ranking?.riskScore ?? 0;
    const confidence = ranking?.confidence ?? set.confidence;

    const reasoning = [
      ...(ranking ? [ranking.reasoning] : []),
      set.outcome,
      ...set.reasoning,
    ];

    return {
      ok: true,
      data: {
        narrativeId,
        interventionType: type,
        expectedEffect,
        riskScore,
        confidence,
        reasoning,
        limitations: set.limitations,
      },
    };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// WRITES (researcher+) — run the engine + persist runs / rankings / comparisons
// / impacts / audits. RLS is the backstop; we gate at researcher for clean
// DbResult errors. NEVER throw.
// =============================================================================

/**
 * Persist a DecisionRun (run row + its intervention rankings + an audit row).
 * Returns the new run id. Shared by runDecision + rebuildDecisions. The caller
 * has already gated the role. NEVER throws (returns null on insert failure).
 */
async function persistDecisionRun(
  client: SupabaseClient,
  run: DecisionRun,
  audit: DecisionAudit,
  createdBy: string,
  now: string,
): Promise<string | null> {
  const { data: runRow, error: runErr } = await client
    .from('hsin_decision_runs')
    .insert({
      narrative_id: run.narrativeId,
      decision_name: run.decisionName,
      decision_type: asDecisionType(run.decisionType),
      confidence: run.confidence,
      recommended_action: run.recommendedAction,
      reasoning: listJson(run.reasoning),
      limitations: listJson(run.limitations),
      generated_at: run.generatedAt ?? now,
      created_by: createdBy,
    })
    .select('id')
    .single();
  if (runErr || !runRow?.id) return null;
  const runId = runRow.id as string;

  // Rankings (one row per ranked candidate intervention).
  for (const r of run.rankings) {
    await client.from('hsin_intervention_rankings').insert({
      decision_run_id: runId,
      intervention_type: asInterventionType(r.interventionType),
      expected_effect: r.expectedEffect,
      risk_score: r.riskScore,
      confidence: r.confidence,
      rank_position: r.rankPosition,
      reasoning: r.reasoning,
    });
  }

  // Audit (decision_output + confidence + limitations + the step log).
  await client.from('hsin_decision_audits').insert({
    decision_run_id: runId,
    decision_output: toJson(audit.decisionOutput),
    confidence: audit.confidence,
    limitations: listJson(audit.limitations),
    audit_log: { steps: audit.auditLog },
  });

  return runId;
}

export interface RunDecisionResult {
  decisionRunId: string;
  run: DecisionRun;
}

/**
 * Run ONE decision over a narrative (researcher+). Loads the DecisionInput from
 * the temporal/causal/counterfactual tables, runs generateDecisionRun, then
 * persists the run + its intervention rankings + a buildDecisionAudit record.
 * Returns the new run id + the full engine run. NEVER throws.
 */
export async function runDecision(
  narrativeId: string,
): Promise<DbResult<RunDecisionResult>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'researcher');
    if (!gate.ok) return gate;

    const now = new Date().toISOString();
    const input = await loadDecisionInput(client, narrativeId, now);

    const run = generateDecisionRun(input, now);
    const audit = buildDecisionAudit(run, now);

    const decisionRunId = await persistDecisionRun(
      client,
      run,
      audit,
      gate.user.id,
      now,
    );
    if (!decisionRunId) {
      return {
        ok: false,
        error: 'Failed to persist the decision run.',
        code: 'DB_ERROR',
      };
    }

    return { ok: true, data: { decisionRunId, run } };
  } catch (e) {
    return fail(e);
  }
}

export interface CompareScenariosResult {
  decisionRunId: string;
  comparisonId: string;
  battle: ScenarioBattleResult;
}

/**
 * War-game scenario A vs scenario B over a narrative (researcher+). Loads the
 * DecisionInput, runs compareScenarios, ensures a decision run exists to attach
 * the comparison to (reuses the narrative's latest run, else creates a lightweight
 * one), and inserts a hsin_scenario_comparisons row. NEVER throws.
 */
export async function compareScenariosRun(
  narrativeId: string,
  scenarioA: { name: string; interventions: InterventionType[] },
  scenarioB: { name: string; interventions: InterventionType[] },
): Promise<DbResult<CompareScenariosResult>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'researcher');
    if (!gate.ok) return gate;

    const now = new Date().toISOString();
    const input = await loadDecisionInput(client, narrativeId, now);

    const battle = compareScenarios(input, scenarioA, scenarioB, now);

    // Attach to the narrative's latest run, else create a lightweight one.
    const decisionRunId = await ensureDecisionRun(
      client,
      input,
      gate.user.id,
      now,
    );
    if (!decisionRunId) {
      return {
        ok: false,
        error: 'Failed to find or create a decision run for the comparison.',
        code: 'DB_ERROR',
      };
    }

    const winner: string = battle.winner; // 'A' | 'B' | 'tie' — free-text column.
    const { data: compRow, error: cerr } = await client
      .from('hsin_scenario_comparisons')
      .insert({
        decision_run_id: decisionRunId,
        scenario_a: toJson({
          name: battle.scenarioA.name,
          interventions: battle.scenarioA.interventions,
          metrics: battle.metrics.a,
        }),
        scenario_b: toJson({
          name: battle.scenarioB.name,
          interventions: battle.scenarioB.interventions,
          metrics: battle.metrics.b,
        }),
        winner,
        confidence: battle.confidence,
        comparison_reasoning: battle.reasoning.join(' | '),
      })
      .select('id')
      .single();
    if (cerr || !compRow?.id) {
      return fail(cerr ?? new Error('Scenario comparison insert returned no id.'));
    }

    return {
      ok: true,
      data: { decisionRunId, comparisonId: compRow.id as string, battle },
    };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Find the narrative's most-recent decision run, or create a lightweight one so a
 * scenario comparison / cross-impact has a run to anchor to. Returns the run id,
 * or null on failure. The caller has already gated the role. NEVER throws.
 */
async function ensureDecisionRun(
  client: SupabaseClient,
  input: DecisionInput,
  createdBy: string,
  now: string,
): Promise<string | null> {
  const { data: existing } = await client
    .from('hsin_decision_runs')
    .select('id')
    .eq('narrative_id', input.narrativeId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  // No run yet — create a full one so the comparison has real context.
  const run = generateDecisionRun(input, now);
  const audit = buildDecisionAudit(run, now);
  return persistDecisionRun(client, run, audit, createdBy, now);
}

export interface ComputeCrossImpactsResult {
  sourceNarrativeId: string;
  upserted: number;
  impacts: CrossNarrativeImpact[];
}

/**
 * Compute + persist the cross-narrative impacts for ONE source narrative
 * (researcher+). Loads the source DecisionInput, gathers candidate target
 * narratives (every OTHER narrative with its snapshots + the source→target
 * influence edge), runs computeCrossNarrativeImpact, and UPSERTS one
 * hsin_cross_narrative_impacts row per (source, target, impact_type). NEVER
 * throws.
 */
export async function computeCrossImpacts(
  sourceNarrativeId: string,
): Promise<DbResult<ComputeCrossImpactsResult>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'researcher');
    if (!gate.ok) return gate;

    const now = new Date().toISOString();
    const source = await loadDecisionInput(client, sourceNarrativeId, now);

    const targets = await loadCrossTargets(client, source);
    const impacts = computeCrossNarrativeImpact(source, targets, now);

    let upserted = 0;
    for (const im of impacts) {
      const ok = await upsertCrossImpact(client, im);
      if (ok) upserted += 1;
    }

    return {
      ok: true,
      data: { sourceNarrativeId, upserted, impacts },
    };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Build the candidate cross-narrative targets for a source: every OTHER narrative
 * with its snapshots (for the slope/amp signals) + the influence edge weight from
 * the source (so the engine grounds its coupling in real influence). Best-effort;
 * NEVER throws.
 */
async function loadCrossTargets(
  client: SupabaseClient,
  source: DecisionInput,
): Promise<CrossNarrativeTarget[]> {
  const { data: narrativeRows } = await client
    .from('hsin_narratives')
    .select('id')
    .limit(2000);
  const otherIds = ((narrativeRows ?? []) as Array<{ id: string }>)
    .map((n) => n.id)
    .filter((id) => id !== source.narrativeId);
  if (otherIds.length === 0) return [];

  // Influence edges from the source (target id → score + shared overlap).
  const influenceByTarget = new Map<
    string,
    { score: number; sharedCommunities: number; sharedSources: number }
  >();
  for (const e of source.influenceOut ?? []) {
    if (e.sourceNarrativeId === source.narrativeId) {
      influenceByTarget.set(e.targetNarrativeId, {
        score: e.influenceScore,
        sharedCommunities: e.sharedCommunities,
        sharedSources: e.sharedSources,
      });
    }
  }

  const targets: CrossNarrativeTarget[] = [];
  for (const targetId of otherIds) {
    const { data: snapRows } = await client
      .from('hsin_narrative_snapshots')
      .select('captured_at, signal_count, amplification_score')
      .eq('narrative_id', targetId)
      .order('captured_at', { ascending: true })
      .limit(5000);
    const snapshots = ((snapRows ?? []) as Array<{
      captured_at: string;
      signal_count?: number | null;
      amplification_score?: number | null;
    }>).map((s) => ({
      capturedAt: s.captured_at,
      signalCount: s.signal_count ?? 0,
      amplificationScore: s.amplification_score ?? 0,
    }));

    const inf = influenceByTarget.get(targetId);
    targets.push({
      narrativeId: targetId,
      snapshots,
      influenceFromSource: inf?.score,
      sharedCommunities: inf?.sharedCommunities,
      sharedSources: inf?.sharedSources,
    });
  }
  return targets;
}

/**
 * UPSERT one cross-narrative impact on the (source, target, impact_type) unique
 * key. Returns true on success. NEVER throws.
 */
async function upsertCrossImpact(
  client: SupabaseClient,
  im: CrossNarrativeImpact,
): Promise<boolean> {
  const impactType = asImpactType(im.impactType);
  const { data: existing } = await client
    .from('hsin_cross_narrative_impacts')
    .select('id')
    .eq('source_narrative_id', im.sourceNarrativeId)
    .eq('target_narrative_id', im.targetNarrativeId)
    .eq('impact_type', impactType)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await client
      .from('hsin_cross_narrative_impacts')
      .update({
        impact_strength: im.impactStrength,
        confidence: im.confidence,
        reasoning: im.reasoning,
      })
      .eq('id', existing.id as string);
    return !error;
  }
  const { error } = await client.from('hsin_cross_narrative_impacts').insert({
    source_narrative_id: im.sourceNarrativeId,
    target_narrative_id: im.targetNarrativeId,
    impact_type: impactType,
    impact_strength: im.impactStrength,
    confidence: im.confidence,
    reasoning: im.reasoning,
  });
  return !error;
}

// =============================================================================
// REBUILD (researcher+) — the END-TO-END compute + persist pipeline.
// =============================================================================

export interface RebuildDecisionsSummary {
  narrativesProcessed: number;
  runs: number;
  rankings: number;
  comparisons: number;
  crossImpacts: number;
  audits: number;
}

interface NarrativeIdRow {
  id: string;
}

/**
 * A representative scenario battle for a narrative: the top-ranked dampening
 * intervention vs doing nothing (baseline). Falls back to the single top-ranked
 * intervention vs baseline when no dampener is present. Deterministic given the
 * loaded input + `now`.
 */
function representativeBattle(
  input: DecisionInput,
  now: string,
): {
  scenarioA: { name: string; interventions: InterventionType[] };
  scenarioB: { name: string; interventions: InterventionType[] };
} {
  const rankings = rankInterventions(input, now);
  const dampener = rankings.find((r) => r.expectedEffect < 0);
  const top = rankings[0];
  const chosen = dampener ?? top;
  return {
    scenarioA: chosen
      ? { name: `Apply ${chosen.interventionType}`, interventions: [chosen.interventionType] }
      : { name: 'Baseline', interventions: [] },
    scenarioB: { name: 'Do nothing', interventions: [] },
  };
}

/**
 * Rebuild the entire decision-intelligence layer (researcher+) for a
 * server-supplied `now`. For each narrative:
 *   1. Load its DecisionInput from the temporal/causal/counterfactual tables.
 *   2. generateDecisionRun → persist the run + rankings + audit (runDecision-style).
 *   3. computeCrossNarrativeImpact against the other narratives → upsert the
 *      hsin_cross_narrative_impacts rows.
 *   4. compareScenarios on a REPRESENTATIVE battle → insert a
 *      hsin_scenario_comparisons row attached to the run just created.
 *
 * Each stage is wrapped so a partial failure still persists what it can; the
 * returned summary reflects what was actually written. NEVER throws.
 */
export async function rebuildDecisions(
  now: string,
): Promise<DbResult<RebuildDecisionsSummary>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'researcher');
    if (!gate.ok) return gate;

    const summary: RebuildDecisionsSummary = {
      narrativesProcessed: 0,
      runs: 0,
      rankings: 0,
      comparisons: 0,
      crossImpacts: 0,
      audits: 0,
    };

    const { data: narrativeRows, error: nerr } = await client
      .from('hsin_narratives')
      .select('id')
      .limit(2000);
    if (nerr) return fail(nerr);
    const narrativeIds = ((narrativeRows ?? []) as NarrativeIdRow[]).map(
      (n) => n.id,
    );
    if (narrativeIds.length === 0) return { ok: true, data: summary };

    for (const narrativeId of narrativeIds) {
      try {
        const input = await loadDecisionInput(client, narrativeId, now);
        if (input.snapshots.length === 0) continue;
        summary.narrativesProcessed += 1;

        // ---- 2. Decision run + rankings + audit ----------------------------
        let runId: string | null = null;
        try {
          const run = generateDecisionRun(input, now);
          const audit = buildDecisionAudit(run, now);
          runId = await persistDecisionRun(client, run, audit, gate.user.id, now);
          if (runId) {
            summary.runs += 1;
            summary.rankings += run.rankings.length;
            summary.audits += 1;
          }
        } catch (e) {
          logError('decision/persistence:rebuild-run', e);
        }

        // ---- 3. Cross-narrative impacts ------------------------------------
        try {
          const targets = await loadCrossTargets(client, input);
          const impacts = computeCrossNarrativeImpact(input, targets, now);
          for (const im of impacts) {
            const ok = await upsertCrossImpact(client, im);
            if (ok) summary.crossImpacts += 1;
          }
        } catch (e) {
          logError('decision/persistence:rebuild-cross', e);
        }

        // ---- 4. Representative scenario battle -----------------------------
        if (runId) {
          try {
            const { scenarioA, scenarioB } = representativeBattle(input, now);
            const battle = compareScenarios(input, scenarioA, scenarioB, now);
            const { error } = await client
              .from('hsin_scenario_comparisons')
              .insert({
                decision_run_id: runId,
                scenario_a: toJson({
                  name: battle.scenarioA.name,
                  interventions: battle.scenarioA.interventions,
                  metrics: battle.metrics.a,
                }),
                scenario_b: toJson({
                  name: battle.scenarioB.name,
                  interventions: battle.scenarioB.interventions,
                  metrics: battle.metrics.b,
                }),
                winner: battle.winner,
                confidence: battle.confidence,
                comparison_reasoning: battle.reasoning.join(' | '),
              });
            if (!error) summary.comparisons += 1;
          } catch (e) {
            logError('decision/persistence:rebuild-battle', e);
          }
        }
      } catch (e) {
        logError('decision/persistence:rebuild-narrative', e);
      }
    }

    return { ok: true, data: summary };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// DEMO — labeled, NON-PERSISTED view-models from the package decisionDemo().
// For the NOT_CONFIGURED / empty-env showcase path. NEVER throws.
// =============================================================================

export interface DecisionDemoViews {
  dashboard: DecisionDashboardData;
  run: DecisionRunView;
  scenarios: ScenarioComparisonView;
  crossImpacts: CrossNarrativeImpactView;
  highlights: DecisionHighlights;
  explorer: DecisionExplorerResult;
}

/**
 * Build the Phase-13 view-models from the deterministic engine fixtures
 * (decisionDemo). Synthetic ids; clearly a demo. The UI renders this when
 * Supabase is not configured. NEVER throws (decisionDemo is pure/offline).
 */
export async function demoDecision(): Promise<DbResult<DecisionDemoViews>> {
  try {
    const demo = decisionDemo();
    const now = demo.now;
    const run = demo.decisionRun;
    const decisionRunId = 'demo-decision-run-0';

    // Synthetic narratives behind the demo (source + the cross-impact targets).
    const narrativeIds = Array.from(
      new Set([
        run.narrativeId,
        ...demo.crossImpacts.flatMap((i) => [
          i.sourceNarrativeId,
          i.targetNarrativeId,
        ]),
      ]),
    );
    const narratives: HsinNarrativeRecord[] = narrativeIds.map((id) => ({
      id,
      name: id,
      created_at: now,
      updated_at: now,
    }));

    const runRecord: HsinDecisionRunRecord = {
      id: decisionRunId,
      created_at: now,
      narrative_id: run.narrativeId,
      decision_name: run.decisionName,
      decision_type: asDecisionType(run.decisionType),
      confidence: run.confidence,
      recommended_action: run.recommendedAction,
      reasoning: listJson(run.reasoning),
      limitations: listJson(run.limitations),
      generated_at: run.generatedAt,
    };

    const rankingRecords: HsinInterventionRankingRecord[] = run.rankings.map(
      (r, i) => ({
        id: `demo-ranking-${i}`,
        decision_run_id: decisionRunId,
        intervention_type: asInterventionType(r.interventionType),
        expected_effect: r.expectedEffect,
        risk_score: r.riskScore,
        confidence: r.confidence,
        rank_position: r.rankPosition,
        reasoning: r.reasoning,
        created_at: now,
      }),
    );

    const battles = [demo.decisiveBattle, demo.closeBattle];
    const comparisonRecords: (HsinScenarioComparisonRecord & {
      run?: HsinDecisionRunRecord;
    })[] = battles.map((b, i) => ({
      id: `demo-comparison-${i}`,
      decision_run_id: decisionRunId,
      scenario_a: toJson({
        name: b.scenarioA.name,
        interventions: b.scenarioA.interventions,
        metrics: b.metrics.a,
      }),
      scenario_b: toJson({
        name: b.scenarioB.name,
        interventions: b.scenarioB.interventions,
        metrics: b.metrics.b,
      }),
      winner: b.winner,
      confidence: b.confidence,
      comparison_reasoning: b.reasoning.join(' | '),
      created_at: now,
      run: runRecord,
    }));

    const auditRecord: HsinDecisionAuditRecord = {
      id: 'demo-audit-0',
      decision_run_id: decisionRunId,
      decision_output: toJson(demo.audit.decisionOutput),
      confidence: demo.audit.confidence,
      limitations: listJson(demo.audit.limitations),
      audit_log: { steps: demo.audit.auditLog },
      created_at: now,
    };

    const impactRecords: HsinCrossNarrativeImpactRecord[] = demo.crossImpacts.map(
      (im, i) => ({
        id: `demo-impact-${i}`,
        source_narrative_id: im.sourceNarrativeId,
        target_narrative_id: im.targetNarrativeId,
        impact_type: asImpactType(im.impactType),
        impact_strength: im.impactStrength,
        confidence: im.confidence,
        reasoning: im.reasoning,
        created_at: now,
      }),
    );

    // Highest-risk narratives from the demo rankings (worst per narrative = the
    // run's narrative, since all demo rankings belong to one run).
    const worstRisk = rankingRecords.reduce(
      (max, r) => Math.max(max, r.risk_score ?? 0),
      0,
    );
    const highestRiskNarratives = [
      { narrativeId: run.narrativeId, name: run.narrativeId, riskScore: worstRisk },
    ];

    const recommendations =
      runRecord.decision_type === 'intervention' ||
      runRecord.decision_type === 'escalate'
        ? [runRecord]
        : [];

    const dashboard: DecisionDashboardData = {
      recentRuns: [runRecord],
      topRankings: rankingRecords.slice(0, 10),
      highestRiskNarratives,
      recommendations,
      avgConfidence: runRecord.confidence ?? 0,
    };

    const runView: DecisionRunView = {
      run: runRecord,
      rankings: rankingRecords,
      comparisons: comparisonRecords,
      audit: auditRecord,
      narrative: narratives.find((n) => n.id === run.narrativeId) ?? null,
    };

    const scenarios: ScenarioComparisonView = {
      comparisons: comparisonRecords,
      narratives,
    };

    const crossImpacts: CrossNarrativeImpactView = {
      narratives,
      impacts: impactRecords,
    };

    const highlights: DecisionHighlights = {
      decisionHealth: runRecord.confidence ?? 0,
      recommendationQueue: recommendations.length,
      topRisks: highestRiskNarratives,
      scenarioBattles: comparisonRecords.length,
      crossNarrativeEffects: impactRecords.length,
    };

    const top = run.rankings[0];
    const explorer: DecisionExplorerResult = {
      narrativeId: run.narrativeId,
      interventionType: top
        ? asInterventionType(top.interventionType)
        : 'remove_event',
      expectedEffect: top?.expectedEffect ?? 0,
      riskScore: top?.riskScore ?? 0,
      confidence: top?.confidence ?? 0,
      reasoning: [
        ...(top ? [top.reasoning] : []),
        demo.interventionSet.outcome,
        ...demo.interventionSet.reasoning,
      ],
      limitations: demo.interventionSet.limitations,
    };

    return {
      ok: true,
      data: { dashboard, run: runView, scenarios, crossImpacts, highlights, explorer },
    };
  } catch (e) {
    return fail(e);
  }
}

// -----------------------------------------------------------------------------
// Re-export the shared client accessor + role helper for the actions layer.
// -----------------------------------------------------------------------------
export { db as decisionDbClient, requireRole as requireDecisionRole };
