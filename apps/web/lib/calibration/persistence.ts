// =============================================================================
// HSIN Phase 16 — Calibration & Trust data-access layer (DAL). SERVER-ONLY.
//
// "What does 82% confidence ACTUALLY mean, and how trustworthy is this?" The
// persistence layer for the Phase-16 calibration & trust layer over the
// decision-intelligence (Phase 13, migration 0017) and outcome-tracking (Phase
// 15, migration 0019) layers (migration 0020):
//   * CALIBRATION — hsin_calibration_snapshots: a point-in-time calibration of
//                   predicted confidence vs observed success (ECE/MCE/over-
//                   confidence/Brier + the reliability curve as jsonb bins).
//   * CURVES      — hsin_reliability_curves: the per-bin reliability-diagram rows
//                   behind a snapshot (band / count / mean_confidence /
//                   observed_success / calibration_error).
//   * BRIER       — hsin_brier_scores: standalone Brier scores per scope/kind with
//                   a calibration-quality label + interpretation + decomposition.
//   * DRIFT       — hsin_confidence_drift: detected drift between a prior and
//                   current ECE (over/under-confidence, degradation, improvement,
//                   stable). RECOMMENDS recalibration only — never auto-acts.
//   * TRUST       — hsin_source_trust / hsin_narrative_trust / hsin_decision_trust
//                   / hsin_forecast_trust: a 0..100 trust score + band per entity,
//                   with explanation, limitations, and a manual-override trail.
//
// The PURE, deterministic engine lives in '@hsi/calibration-engine'. This DAL
// builds Prediction[] from the Phase-15 outcome history (+ best-effort forecast
// history), feeds it (with injected `now`) into the engine, and persists the
// results. Reads assemble the Phase-16 view-models the calibration / trust
// dashboards render.
//
// THE PIPELINES:
//   recomputeCalibration(now): loadPredictions → calibrate + reliabilityByKind +
//     computeBrierScore/brierByKind + detectConfidenceDrift (vs the previous
//     snapshot's curve) → INSERT hsin_calibration_snapshots (+ reliability_curves
//     rows, brier_scores, confidence_drift). Returns counts + ECE/Brier.
//   recomputeTrust(now): for each source / narrative / decision / forecast entity,
//     assemble TrustInputs (historicalAccuracy + evidenceQuality + calibrationScore
//     from the latest curve + review/governance outcomes) → computeTrustScore →
//     UPSERT the matching hsin_*_trust table, PRESERVING a manual override unless
//     forced.
//   overrideTrust(...): load base trust, applyTrustOverride (REQUIRES a non-blank
//     reason — else a validation error), UPDATE the row (overridden=true,
//     override_reason, overridden_by=user.id), write an audit_logs row.
//
// SERVER-ONLY — never import from a 'use client' module (uses next/headers via
// lib/supabase/server.ts). `server-only` is not installed in this workspace, so
// this comment stands in for the import (mirrors lib/outcome/persistence.ts).
//
// AUTHZ MODEL (migration 0020 RLS, mirrored here for clean DbResult errors):
//   * All 8 Phase-16 tables: researcher+ READ (public.is_researcher_or_above());
//     curator/admin INSERT/UPDATE/DELETE (public.is_curator_or_admin()); admin all.
//   * We gate reads at researcher and writes at curator (RLS is the backstop).
//   NO service-role path — the background calibration/alert worker uses
//   service_role; the app is RLS-scoped.
//
// DESIGN: every function returns DbResult<T> and NEVER throws. Empty Supabase env
// degrades gracefully (NOT_CONFIGURED) so `next build` passes.
// =============================================================================

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { loadHighestRole } from '@/lib/auth/get-session-role';
import { formatErrorMessage, logError } from '@/lib/errors/format-error';
import { createClient } from '@/lib/supabase/server';
import {
  applyTrustOverride,
  brierByKind,
  calibrate,
  calibrationDemo,
  computeBrierScore,
  computeReliabilityCurve,
  computeTrustScore,
  confidenceMeaning,
  detectConfidenceDrift,
  reliabilityByKind,
  type BrierResult,
  type ConfidenceDriftResult,
  type Prediction,
  type ReliabilityCurve,
  type TrustEntityType,
  type TrustInputs,
  type TrustScore,
} from '@hsi/calibration-engine';
import type {
  AppRole,
  CalibrationDashboardData,
  CalibrationHighlights,
  CalibrationQuality,
  CalibrationView,
  ConfidenceDriftKind,
  HsinBrierScoreRecord,
  HsinCalibrationSnapshotRecord,
  HsinConfidenceDriftRecord,
  HsinDecisionTrustRecord,
  HsinForecastTrustRecord,
  HsinNarrativeTrustRecord,
  HsinReliabilityCurveRecord,
  HsinSourceTrustRecord,
  TrustBand,
  TrustDashboardData,
  TrustView,
} from '@hsi/shared-types';

// -----------------------------------------------------------------------------
// Result type — canonical DbResult with 'FORBIDDEN' (Phase 6–15).
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
  logError('calibration/persistence', error);
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

function validation(message: string): {
  ok: false;
  error: string;
  code: DbResultCode;
} {
  // A bad request (e.g. blank override reason) is surfaced as FORBIDDEN per spec
  // (the write is refused) with an explicit operator-facing message.
  return { ok: false, error: message, code: 'FORBIDDEN' };
}

// -----------------------------------------------------------------------------
// Client + identity + role helpers (mirror lib/outcome/persistence.ts).
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

/** A string[] wrapped into a jsonb record (explanation/limitations columns). */
function listJson(items: string[]): JsonRecord {
  return { items };
}

/** Read a string[] back out of an explanation/limitations jsonb record. */
function listFromJson(rec: JsonRecord | undefined): string[] {
  const items = rec?.items;
  if (Array.isArray(items)) return items.map((x) => String(x));
  return [];
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0;
  return Math.round((nums.reduce((a, n) => a + n, 0) / nums.length) * 1e4) / 1e4;
}

function numbersOf(values: Array<number | null | undefined>): number[] {
  return values.filter((n): n is number => typeof n === 'number');
}

// -----------------------------------------------------------------------------
// Engine union → DB union guards. The engine + shared-types use identical string
// sets; these guards keep the persisted value inside the migration-0020 CHECK
// domains (drift_kind / band / calibration_quality).
// -----------------------------------------------------------------------------
const DRIFT_KINDS: ConfidenceDriftKind[] = [
  'overconfidence',
  'underconfidence',
  'degradation',
  'improvement',
  'stable',
];

const TRUST_BANDS: TrustBand[] = ['low', 'medium', 'high'];

const CALIBRATION_QUALITIES: CalibrationQuality[] = [
  'excellent',
  'good',
  'fair',
  'poor',
  'insufficient_data',
];

const TRUST_ENTITY_TYPES: TrustEntityType[] = [
  'source',
  'narrative',
  'forecast',
  'intervention',
  'recommendation',
  'decision',
];

/** Guard an engine/string drift kind into the migration-0020 CHECK domain. */
function asDriftKind(k: ConfidenceDriftKind | string): ConfidenceDriftKind {
  return (DRIFT_KINDS as string[]).includes(k)
    ? (k as ConfidenceDriftKind)
    : 'stable';
}

/** Guard a string trust band into the migration-0020 CHECK domain. */
function asTrustBand(b: TrustBand | string): TrustBand {
  return (TRUST_BANDS as string[]).includes(b) ? (b as TrustBand) : 'low';
}

/** Guard a string calibration quality into the migration-0020 domain. */
function asCalibrationQuality(q: string): CalibrationQuality {
  return (CALIBRATION_QUALITIES as string[]).includes(q)
    ? (q as CalibrationQuality)
    : 'insufficient_data';
}

/** Guard a string trust entity type into the engine's TrustEntityType domain. */
function asTrustEntityType(t: TrustEntityType | string): TrustEntityType {
  return (TRUST_ENTITY_TYPES as string[]).includes(t)
    ? (t as TrustEntityType)
    : 'source';
}

/** Map a 0..100 trust score to its band (mirrors the engine thresholds). */
function bandForScore(score: number): TrustBand {
  return score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
}

// =============================================================================
// PREDICTION HISTORY — build Prediction[] from the stored Phase-15/12 history.
// =============================================================================

interface OutcomeLite {
  confidence_before?: number | null;
  success_score?: number | null;
  recommendation_id?: string | null;
  decision_run_id?: string | null;
  created_at?: string | null;
}

interface ForecastLite {
  id: string;
  narrative_id?: string | null;
  probability?: number | null;
  generated_at?: string | null;
}

/**
 * Build the full Prediction[] from the stored history (NEVER throws — each source
 * degrades to an empty contribution):
 *   * RECOMMENDATIONS — hsin_recommendation_outcomes: stated confidence_before vs
 *     the observed success_score/100. kind 'recommendation'.
 *   * FORECASTS (best-effort) — hsin_narrative_forecasts: the forecast probability
 *     vs whether a SUBSEQUENT snapshot for the same narrative confirmed an upward
 *     move (a faithful, conservative proxy for "did the forecast come true?").
 *     kind 'forecast'. Absent forecast/snapshot data simply contributes nothing.
 */
async function loadPredictions(client: SupabaseClient): Promise<Prediction[]> {
  const predictions: Prediction[] = [];

  // --- recommendations: confidence_before vs success_score/100 --------------
  try {
    const { data: outcomeRows } = await client
      .from('hsin_recommendation_outcomes')
      .select('confidence_before, success_score, recommendation_id, decision_run_id, created_at')
      .order('created_at', { ascending: true })
      .limit(20000);
    for (const o of (outcomeRows ?? []) as OutcomeLite[]) {
      if (typeof o.confidence_before !== 'number') continue;
      if (typeof o.success_score !== 'number') continue;
      predictions.push({
        id: o.recommendation_id ?? o.decision_run_id ?? `outcome-${predictions.length}`,
        kind: 'recommendation',
        confidence: clamp01(o.confidence_before),
        success: clamp01(o.success_score / 100),
        at: o.created_at ?? '1970-01-01T00:00:00.000Z',
        entityId: o.decision_run_id ?? undefined,
      });
    }
  } catch (e) {
    logError('calibration/persistence:loadPredictions-outcomes', e);
  }

  // --- forecasts (best-effort): probability vs a subsequent confirming move --
  try {
    const { data: fcRows } = await client
      .from('hsin_narrative_forecasts')
      .select('id, narrative_id, probability, generated_at')
      .order('generated_at', { ascending: true })
      .limit(20000);
    const forecasts = (fcRows ?? []) as ForecastLite[];
    for (const f of forecasts) {
      if (typeof f.probability !== 'number' || !f.narrative_id) continue;
      const success = await forecastObservedSuccess(client, f);
      if (success === undefined) continue;
      predictions.push({
        id: f.id,
        kind: 'forecast',
        confidence: clamp01(f.probability),
        success,
        at: f.generated_at ?? '1970-01-01T00:00:00.000Z',
        entityId: f.narrative_id,
      });
    }
  } catch (e) {
    logError('calibration/persistence:loadPredictions-forecasts', e);
  }

  return predictions;
}

/**
 * Did a forecast "come true"? Best-effort: compare the narrative's signal level at
 * the forecast time against the next snapshot AFTER it. A higher subsequent signal
 * count → success 1, a lower → 0, no later snapshot → undefined (excluded). This
 * is a documented, conservative proxy, NOT a backtest record. NEVER throws.
 */
async function forecastObservedSuccess(
  client: SupabaseClient,
  forecast: ForecastLite,
): Promise<number | undefined> {
  try {
    if (!forecast.narrative_id || !forecast.generated_at) return undefined;
    const { data: rows } = await client
      .from('hsin_narrative_snapshots')
      .select('captured_at, signal_count')
      .eq('narrative_id', forecast.narrative_id)
      .order('captured_at', { ascending: true })
      .limit(5000);
    const snaps = ((rows ?? []) as Array<{
      captured_at: string;
      signal_count?: number | null;
    }>).filter((s) => typeof s.signal_count === 'number');
    if (snaps.length < 2) return undefined;

    const at = Date.parse(forecast.generated_at);
    const before = [...snaps]
      .filter((s) => Date.parse(s.captured_at) <= at)
      .pop();
    const after = snaps.find((s) => Date.parse(s.captured_at) > at);
    if (!before || !after) return undefined;
    const b = before.signal_count ?? 0;
    const a = after.signal_count ?? 0;
    // A rising/upward forecast is "confirmed" when the next snapshot grew.
    return a >= b ? 1 : 0;
  } catch {
    return undefined;
  }
}

// =============================================================================
// READS (researcher+ — RLS scopes visibility; anon/empty → empty lists)
// =============================================================================

/**
 * The calibration dashboard (CalibrationDashboardData): the latest
 * hsin_calibration_snapshots row + its reliability curves + the latest Brier
 * scores + the latest drift events + a trend series (ECE/Brier per snapshot over
 * time). RLS: researcher+ reads. NEVER throws.
 */
export async function getCalibrationDashboard(): Promise<
  DbResult<CalibrationDashboardData>
> {
  try {
    const client = db();

    const { data: snapRows, error: serr } = await client
      .from('hsin_calibration_snapshots')
      .select('*')
      .order('generated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(200);
    if (serr) return fail(serr);
    const snapshots = (snapRows ?? []) as HsinCalibrationSnapshotRecord[];
    const snapshot = snapshots[0];

    let curves: HsinReliabilityCurveRecord[] = [];
    if (snapshot) {
      const { data: curveRows, error: cerr } = await client
        .from('hsin_reliability_curves')
        .select('*')
        .eq('calibration_snapshot_id', snapshot.id)
        .order('bin_lower', { ascending: true, nullsFirst: false })
        .limit(1000);
      if (cerr) return fail(cerr);
      curves = (curveRows ?? []) as HsinReliabilityCurveRecord[];
    }

    const { data: brierRows, error: berr } = await client
      .from('hsin_brier_scores')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (berr) return fail(berr);
    const brier = (brierRows ?? []) as HsinBrierScoreRecord[];

    const { data: driftRows, error: derr } = await client
      .from('hsin_confidence_drift')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (derr) return fail(derr);
    const drift = (driftRows ?? []) as HsinConfidenceDriftRecord[];

    // Trend: ECE + Brier per snapshot over time (oldest → newest for charting).
    const trend = [...snapshots]
      .reverse()
      .map((s) => ({
        generatedAt: s.generated_at ?? s.created_at,
        ece:
          typeof s.expected_calibration_error === 'number'
            ? s.expected_calibration_error
            : 0,
        brier: typeof s.brier_score === 'number' ? s.brier_score : 0,
      }));

    return { ok: true, data: { snapshot, curves, brier, drift, trend } };
  } catch (e) {
    return fail(e);
  }
}

/**
 * A single calibration view (CalibrationView): one snapshot + its reliability
 * curves + (best-effort) the Brier score + drift event closest in time to it.
 * RLS: researcher+ reads. NEVER throws.
 */
export async function getCalibration(id: string): Promise<DbResult<CalibrationView>> {
  try {
    const client = db();

    const { data: snapRow, error: serr } = await client
      .from('hsin_calibration_snapshots')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (serr) return fail(serr);
    if (!snapRow) {
      return { ok: false, error: 'Calibration snapshot not found.', code: 'DB_ERROR' };
    }
    const snapshot = snapRow as HsinCalibrationSnapshotRecord;

    const { data: curveRows, error: cerr } = await client
      .from('hsin_reliability_curves')
      .select('*')
      .eq('calibration_snapshot_id', id)
      .order('bin_lower', { ascending: true, nullsFirst: false })
      .limit(1000);
    if (cerr) return fail(cerr);
    const curves = (curveRows ?? []) as HsinReliabilityCurveRecord[];

    // Best-effort matching Brier (same scope+kind) + drift (same scope), nearest.
    const { data: brierRows } = await client
      .from('hsin_brier_scores')
      .select('*')
      .eq('scope', snapshot.scope ?? '')
      .order('created_at', { ascending: false })
      .limit(1);
    const brier = ((brierRows ?? []) as HsinBrierScoreRecord[])[0];

    const { data: driftRows } = await client
      .from('hsin_confidence_drift')
      .select('*')
      .eq('scope', snapshot.scope ?? '')
      .order('created_at', { ascending: false })
      .limit(1);
    const drift = ((driftRows ?? []) as HsinConfidenceDriftRecord[])[0];

    return { ok: true, data: { snapshot, curves, brier, drift } };
  } catch (e) {
    return fail(e);
  }
}

/** List calibration snapshots (most recent first). RLS: researcher+. NEVER throws. */
export async function listCalibrationSnapshots(): Promise<
  DbResult<HsinCalibrationSnapshotRecord[]>
> {
  try {
    const client = db();
    const { data, error } = await client
      .from('hsin_calibration_snapshots')
      .select('*')
      .order('generated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) return fail(error);
    return { ok: true, data: (data ?? []) as HsinCalibrationSnapshotRecord[] };
  } catch (e) {
    return fail(e);
  }
}

/** List the standalone Brier scores (most recent first). RLS: researcher+. NEVER throws. */
export async function getBrierScores(): Promise<DbResult<HsinBrierScoreRecord[]>> {
  try {
    const client = db();
    const { data, error } = await client
      .from('hsin_brier_scores')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) return fail(error);
    return { ok: true, data: (data ?? []) as HsinBrierScoreRecord[] };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Headline calibration/trust callouts (CalibrationHighlights): latest ECE + Brier
 * from the most recent snapshot, the latest drift kind, and the average trust
 * score across all four trust tables. Best-effort — each callout degrades to
 * undefined on missing data. RLS: researcher+ reads. NEVER throws.
 */
export async function getCalibrationHighlights(): Promise<
  DbResult<CalibrationHighlights>
> {
  try {
    const client = db();
    const highlights: CalibrationHighlights = {};

    const { data: snapRows } = await client
      .from('hsin_calibration_snapshots')
      .select('expected_calibration_error, brier_score, generated_at, created_at')
      .order('generated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1);
    const snap = ((snapRows ?? []) as Array<{
      expected_calibration_error?: number | null;
      brier_score?: number | null;
    }>)[0];
    if (snap) {
      if (typeof snap.expected_calibration_error === 'number') {
        highlights.ece = snap.expected_calibration_error;
      }
      if (typeof snap.brier_score === 'number') highlights.brier = snap.brier_score;
    }

    const { data: driftRows } = await client
      .from('hsin_confidence_drift')
      .select('drift_kind, created_at')
      .order('created_at', { ascending: false })
      .limit(1);
    const driftKind = ((driftRows ?? []) as Array<{ drift_kind?: string | null }>)[0]
      ?.drift_kind;
    if (typeof driftKind === 'string') highlights.driftKind = asDriftKind(driftKind);

    // Average trust across all four trust tables.
    const trustScores: number[] = [];
    for (const table of [
      'hsin_source_trust',
      'hsin_narrative_trust',
      'hsin_forecast_trust',
      'hsin_decision_trust',
    ] as const) {
      try {
        const { data } = await client.from(table).select('trust_score').limit(5000);
        trustScores.push(
          ...numbersOf(
            ((data ?? []) as Array<{ trust_score?: number | null }>).map(
              (r) => r.trust_score,
            ),
          ),
        );
      } catch {
        // A missing trust table is non-fatal for the highlight.
      }
    }
    if (trustScores.length > 0) highlights.avgTrust = mean(trustScores);

    return { ok: true, data: highlights };
  } catch (e) {
    return fail(e);
  }
}

/**
 * The trust dashboard (TrustDashboardData): every source / narrative / forecast /
 * decision trust row, each ordered by trust_score descending. RLS: researcher+
 * reads. NEVER throws.
 */
export async function getTrustDashboard(): Promise<DbResult<TrustDashboardData>> {
  try {
    const client = db();

    const { data: srcRows, error: serr } = await client
      .from('hsin_source_trust')
      .select('*')
      .order('trust_score', { ascending: false, nullsFirst: false })
      .limit(2000);
    if (serr) return fail(serr);
    const sources = (srcRows ?? []) as HsinSourceTrustRecord[];

    const { data: narrRows, error: nerr } = await client
      .from('hsin_narrative_trust')
      .select('*')
      .order('trust_score', { ascending: false, nullsFirst: false })
      .limit(2000);
    if (nerr) return fail(nerr);
    const narratives = (narrRows ?? []) as HsinNarrativeTrustRecord[];

    const { data: fcRows, error: ferr } = await client
      .from('hsin_forecast_trust')
      .select('*')
      .order('trust_score', { ascending: false, nullsFirst: false })
      .limit(2000);
    if (ferr) return fail(ferr);
    const forecasts = (fcRows ?? []) as HsinForecastTrustRecord[];

    const { data: decRows, error: derr } = await client
      .from('hsin_decision_trust')
      .select('*')
      .order('trust_score', { ascending: false, nullsFirst: false })
      .limit(2000);
    if (derr) return fail(derr);
    const decisions = (decRows ?? []) as HsinDecisionTrustRecord[];

    return { ok: true, data: { sources, narratives, forecasts, decisions } };
  } catch (e) {
    return fail(e);
  }
}

interface TrustRowLite {
  trust_score?: number | null;
  band?: string | null;
  explanation?: JsonRecord | null;
  limitations?: JsonRecord | null;
  overridden?: boolean | null;
  override_reason?: string | null;
  last_updated?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}

/**
 * A single trust view (TrustView) for one entity: the current score/band +
 * explanation + limitations + override state, plus a history series. The four
 * trust tables keep a SINGLE current row per entity (unique key), so the history
 * is best-effort: prior calibration snapshots provide context points where
 * available, else a single point at the current value. RLS: researcher+ reads.
 * NEVER throws.
 */
export async function getTrust(
  entityType: TrustEntityType | string,
  entityId: string,
): Promise<DbResult<TrustView>> {
  try {
    const client = db();
    const type = asTrustEntityType(entityType);

    const table =
      type === 'source'
        ? 'hsin_source_trust'
        : type === 'narrative'
          ? 'hsin_narrative_trust'
          : type === 'forecast'
            ? 'hsin_forecast_trust'
            : 'hsin_decision_trust';
    const idColumn =
      type === 'source'
        ? 'source_id'
        : type === 'narrative'
          ? 'narrative_id'
          : type === 'forecast'
            ? 'narrative_id'
            : 'decision_run_id';

    const { data: row, error } = await client
      .from(table)
      .select('*')
      .eq(idColumn, entityId)
      .maybeSingle();
    if (error) return fail(error);
    if (!row) {
      return { ok: false, error: 'Trust record not found.', code: 'DB_ERROR' };
    }
    const trust = row as TrustRowLite;

    const trustScore =
      typeof trust.trust_score === 'number' ? trust.trust_score : 0;
    const band = asTrustBand(trust.band ?? bandForScore(trustScore));
    const at =
      trust.last_updated ?? trust.updated_at ?? trust.created_at ?? '1970-01-01T00:00:00.000Z';

    // History: a single current point. (The trust tables hold one row per entity;
    // a richer series would require an append-only trust-history table.)
    const history = [{ trustScore, at }];

    return {
      ok: true,
      data: {
        entityType: type,
        entityId,
        trustScore,
        band,
        history,
        explanation: listFromJson(trust.explanation ?? undefined),
        limitations: listFromJson(trust.limitations ?? undefined),
        overridden: trust.overridden === true,
        overrideReason: trust.override_reason ?? undefined,
      },
    };
  } catch (e) {
    return fail(e);
  }
}

export interface ConfidenceMeaning {
  statedConfidence: number;
  historicalSuccess: number;
  sampleCount: number;
  sentence: string;
}

/**
 * "What does X% confidence actually mean?" — answered from the LATEST calibration
 * snapshot's reliability curve via confidenceMeaning. Reconstructs a ReliabilityCurve
 * from the snapshot's persisted bins (the `curve` jsonb, falling back to the
 * hsin_reliability_curves rows). RLS: researcher+ reads. NEVER throws.
 */
export async function confidenceMeaningFor(
  confidence: number,
): Promise<DbResult<ConfidenceMeaning>> {
  try {
    const client = db();

    const { data: snapRows, error: serr } = await client
      .from('hsin_calibration_snapshots')
      .select('*')
      .order('generated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1);
    if (serr) return fail(serr);
    const snapshot = ((snapRows ?? []) as HsinCalibrationSnapshotRecord[])[0];
    if (!snapshot) {
      return {
        ok: false,
        error: 'No calibration snapshot available to ground the meaning.',
        code: 'DB_ERROR',
      };
    }

    let curve = curveFromSnapshotJson(snapshot);
    if (!curve) {
      const { data: curveRows } = await client
        .from('hsin_reliability_curves')
        .select('*')
        .eq('calibration_snapshot_id', snapshot.id)
        .order('bin_lower', { ascending: true, nullsFirst: false })
        .limit(1000);
      curve = curveFromRows(
        snapshot,
        (curveRows ?? []) as HsinReliabilityCurveRecord[],
      );
    }

    return { ok: true, data: confidenceMeaning(curve, confidence) };
  } catch (e) {
    return fail(e);
  }
}

/** Reconstruct a ReliabilityCurve from a snapshot's persisted `curve` jsonb. */
function curveFromSnapshotJson(
  snapshot: HsinCalibrationSnapshotRecord,
): ReliabilityCurve | null {
  const raw = snapshot.curve as JsonRecord | undefined;
  const bins = raw?.bins;
  if (!Array.isArray(bins) || bins.length === 0) return null;
  // The snapshot's `curve` jsonb is the engine ReliabilityCurve verbatim.
  return raw as unknown as ReliabilityCurve;
}

/** Reconstruct a ReliabilityCurve from the per-bin hsin_reliability_curves rows. */
function curveFromRows(
  snapshot: HsinCalibrationSnapshotRecord,
  rows: HsinReliabilityCurveRecord[],
): ReliabilityCurve {
  const bins = rows.map((r) => {
    const lower = typeof r.bin_lower === 'number' ? r.bin_lower : 0;
    const upper = typeof r.bin_upper === 'number' ? r.bin_upper : 0;
    return {
      lower,
      upper,
      label: `${Math.round(lower * 100)}–${Math.round(upper * 100)}%`,
      count: typeof r.count === 'number' ? r.count : 0,
      meanConfidence: typeof r.mean_confidence === 'number' ? r.mean_confidence : 0,
      observedSuccess:
        typeof r.observed_success === 'number' ? r.observed_success : 0,
      calibrationError:
        typeof r.calibration_error === 'number' ? r.calibration_error : 0,
    };
  });
  return {
    bins,
    sampleCount: typeof snapshot.sample_count === 'number' ? snapshot.sample_count : 0,
    expectedCalibrationError:
      typeof snapshot.expected_calibration_error === 'number'
        ? snapshot.expected_calibration_error
        : 0,
    maxCalibrationError:
      typeof snapshot.max_calibration_error === 'number'
        ? snapshot.max_calibration_error
        : 0,
    overconfidenceIndex:
      typeof snapshot.overconfidence_index === 'number'
        ? snapshot.overconfidence_index
        : 0,
    generatedAt: snapshot.generated_at ?? snapshot.created_at,
  };
}

// =============================================================================
// WRITES (curator/admin) — run the engine + persist. RLS is the backstop; we
// gate at curator for clean DbResult errors. NEVER throw.
// =============================================================================

export interface RecomputeCalibrationSummary {
  snapshotId: string | null;
  sampleCount: number;
  ece: number;
  maxCalibrationError: number;
  brier: number;
  curveBins: number;
  brierRows: number;
  driftKind: ConfidenceDriftKind;
}

/**
 * Recompute the OVERALL calibration (curator/admin). loadPredictions →
 *   * calibrate → the overall reliability curve;
 *   * reliabilityByKind → a per-kind curve (persisted as additional Brier rows);
 *   * computeBrierScore (overall) + brierByKind (per-kind) → the Brier rows;
 *   * detectConfidenceDrift vs the PREVIOUS snapshot's curve → the drift row.
 * Then INSERT hsin_calibration_snapshots (with the curve jsonb) + one
 * hsin_reliability_curves row per bin + the Brier rows + the drift row.
 * Returns the summary counts + ECE/Brier. NEVER throws.
 */
export async function recomputeCalibration(
  now: string,
): Promise<DbResult<RecomputeCalibrationSummary>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'curator');
    if (!gate.ok) return gate;

    const predictions = await loadPredictions(client);

    const curve = calibrate(predictions, { now });
    const byKind = reliabilityByKind(predictions, { now });
    const brierOverall = computeBrierScore(
      predictions.map((p) => ({ confidence: p.confidence, success: p.success })),
    );
    const brierKinds = brierByKind(predictions);

    // Drift vs the most recent PRIOR snapshot's curve (best-effort).
    const priorCurve = await loadLatestSnapshotCurve(client);
    const drift = detectConfidenceDrift(curve, priorCurve, { now });

    // --- INSERT the snapshot (overall) --------------------------------------
    const { data: snapRow, error: serr } = await client
      .from('hsin_calibration_snapshots')
      .insert({
        scope: 'overall',
        kind: 'all',
        sample_count: curve.sampleCount,
        expected_calibration_error: curve.expectedCalibrationError,
        max_calibration_error: curve.maxCalibrationError,
        overconfidence_index: curve.overconfidenceIndex,
        brier_score: brierOverall.score,
        curve: toJson(curve),
        generated_at: curve.generatedAt ?? now,
        created_by: gate.user.id,
      })
      .select('id')
      .single();
    if (serr || !snapRow?.id) {
      return fail(serr ?? new Error('Calibration snapshot insert returned no id.'));
    }
    const snapshotId = snapRow.id as string;

    // --- INSERT the per-bin reliability-curve rows --------------------------
    let curveBins = 0;
    for (const b of curve.bins) {
      const { error } = await client.from('hsin_reliability_curves').insert({
        calibration_snapshot_id: snapshotId,
        bin_lower: b.lower,
        bin_upper: b.upper,
        count: b.count,
        mean_confidence: b.meanConfidence,
        observed_success: b.observedSuccess,
        calibration_error: b.calibrationError,
      });
      if (!error) curveBins += 1;
    }

    // --- INSERT the Brier rows (overall + per-kind) -------------------------
    let brierRows = 0;
    if (await insertBrier(client, 'overall', 'all', brierOverall)) brierRows += 1;
    for (const kind of Object.keys(brierKinds) as Array<keyof typeof brierKinds>) {
      const result = brierKinds[kind];
      if (result.sampleCount === 0) continue;
      if (await insertBrier(client, 'overall', kind, result)) brierRows += 1;
    }

    // --- INSERT the drift row -----------------------------------------------
    await client.from('hsin_confidence_drift').insert({
      scope: 'overall',
      drift_kind: asDriftKind(drift.kind),
      magnitude: drift.magnitude,
      current_ece: drift.currentEce,
      prior_ece: drift.priorEce ?? null,
      recommendation: drift.recommendation,
      explanation: drift.explanation,
      detected_at: drift.detectedAt ?? now,
    });

    return {
      ok: true,
      data: {
        snapshotId,
        sampleCount: curve.sampleCount,
        ece: curve.expectedCalibrationError,
        maxCalibrationError: curve.maxCalibrationError,
        brier: brierOverall.score,
        curveBins,
        brierRows,
        driftKind: asDriftKind(drift.kind),
      },
    };
  } catch (e) {
    return fail(e);
  }
}

/** INSERT a single Brier row. Guards calibration_quality to the CHECK domain. NEVER throws. */
async function insertBrier(
  client: SupabaseClient,
  scope: string,
  kind: string,
  result: BrierResult,
): Promise<boolean> {
  const { error } = await client.from('hsin_brier_scores').insert({
    scope,
    kind,
    score: result.score,
    sample_count: result.sampleCount,
    calibration_quality: asCalibrationQuality(result.calibrationQuality),
    interpretation: result.interpretation,
    decomposition: result.decomposition ? toJson(result.decomposition) : null,
  });
  return !error;
}

/** Load the most recent snapshot's reliability curve (for drift comparison). NEVER throws. */
async function loadLatestSnapshotCurve(
  client: SupabaseClient,
): Promise<ReliabilityCurve | undefined> {
  try {
    const { data: snapRows } = await client
      .from('hsin_calibration_snapshots')
      .select('*')
      .order('generated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1);
    const snapshot = ((snapRows ?? []) as HsinCalibrationSnapshotRecord[])[0];
    if (!snapshot) return undefined;
    const fromJson = curveFromSnapshotJson(snapshot);
    if (fromJson) return fromJson;
    const { data: curveRows } = await client
      .from('hsin_reliability_curves')
      .select('*')
      .eq('calibration_snapshot_id', snapshot.id)
      .order('bin_lower', { ascending: true, nullsFirst: false })
      .limit(1000);
    return curveFromRows(snapshot, (curveRows ?? []) as HsinReliabilityCurveRecord[]);
  } catch {
    return undefined;
  }
}

export interface RecomputeTrustSummary {
  sources: number;
  narratives: number;
  decisions: number;
  forecasts: number;
  preserved: number;
}

/**
 * Recompute the trust scores across all four entity classes (curator/admin). For
 * each source / narrative / decision / forecast entity, assemble TrustInputs:
 *   * historicalAccuracy — from the entity's recommendation-outcome success;
 *   * evidenceQuality    — a documented proxy (the entity's confidence signal);
 *   * calibrationScore   — 1 − latest overall ECE (1 = perfectly calibrated);
 *   * review/governance outcomes — from hsin_governance_reviews / outcomes;
 *   * sampleCount        — the number of underlying observations.
 * Then computeTrustScore → UPSERT the matching hsin_*_trust table. A row whose
 * `overridden` flag is true is PRESERVED (skipped) unless `force` is set. NEVER
 * throws.
 */
export async function recomputeTrust(
  now: string,
  opts?: { force?: boolean },
): Promise<DbResult<RecomputeTrustSummary>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'curator');
    if (!gate.ok) return gate;

    const force = opts?.force === true;
    const summary: RecomputeTrustSummary = {
      sources: 0,
      narratives: 0,
      decisions: 0,
      forecasts: 0,
      preserved: 0,
    };

    // Shared calibration component: 1 − latest overall ECE (clamped 0..1).
    const latestCurve = await loadLatestSnapshotCurve(client);
    const calibrationScore =
      latestCurve !== undefined
        ? clamp01(1 - latestCurve.expectedCalibrationError)
        : undefined;

    // Governance + review outcomes aggregated per decision run (so each entity
    // class can fold the relevant tallies in).
    const govByRun = await loadGovernanceByRun(client);
    const outcomesByRun = await loadOutcomesByRun(client);

    // ---- SOURCES -----------------------------------------------------------
    try {
      const { data: srcRows } = await client
        .from('hsin_sources')
        .select('id, reliability_score')
        .limit(5000);
      for (const s of (srcRows ?? []) as Array<{
        id: string;
        reliability_score?: number | null;
      }>) {
        const evidenceQuality =
          typeof s.reliability_score === 'number'
            ? clamp01(s.reliability_score)
            : undefined;
        const score = computeTrustScore(
          {
            entityType: 'source',
            entityId: s.id,
            evidenceQuality,
            calibrationScore,
            sampleCount: 0,
          },
          { now },
        );
        if (
          await upsertTrust(client, 'hsin_source_trust', 'source_id', s.id, score, {
            force,
            summary,
          })
        ) {
          summary.sources += 1;
        }
      }
    } catch (e) {
      logError('calibration/persistence:recomputeTrust-sources', e);
    }

    // ---- NARRATIVES --------------------------------------------------------
    try {
      const { data: narrRows } = await client
        .from('hsin_narratives')
        .select('id')
        .limit(5000);
      for (const n of (narrRows ?? []) as Array<{ id: string }>) {
        const score = computeTrustScore(
          {
            entityType: 'narrative',
            entityId: n.id,
            calibrationScore,
            sampleCount: 0,
          },
          { now },
        );
        if (
          await upsertTrust(
            client,
            'hsin_narrative_trust',
            'narrative_id',
            n.id,
            score,
            { force, summary },
          )
        ) {
          summary.narratives += 1;
        }
      }
    } catch (e) {
      logError('calibration/persistence:recomputeTrust-narratives', e);
    }

    // ---- DECISIONS ---------------------------------------------------------
    try {
      const { data: runRows } = await client
        .from('hsin_decision_runs')
        .select('id, narrative_id, confidence')
        .limit(5000);
      for (const r of (runRows ?? []) as Array<{
        id: string;
        narrative_id?: string | null;
        confidence?: number | null;
      }>) {
        const out = outcomesByRun.get(r.id);
        const gov = govByRun.get(r.id);
        const score = computeTrustScore(
          {
            entityType: 'decision',
            entityId: r.id,
            historicalAccuracy: out?.accuracy,
            evidenceQuality:
              typeof r.confidence === 'number' ? clamp01(r.confidence) : undefined,
            calibrationScore,
            governanceOutcomes: gov,
            sampleCount: out?.count ?? 0,
          },
          { now },
        );
        if (
          await upsertTrust(
            client,
            'hsin_decision_trust',
            'decision_run_id',
            r.id,
            score,
            { force, summary },
          )
        ) {
          summary.decisions += 1;
        }
      }
    } catch (e) {
      logError('calibration/persistence:recomputeTrust-decisions', e);
    }

    // ---- FORECASTS ---------------------------------------------------------
    try {
      const { data: fcRows } = await client
        .from('hsin_narrative_forecasts')
        .select('id, narrative_id, forecast_type, probability')
        .order('generated_at', { ascending: false })
        .limit(5000);
      // One trust row per narrative forecast (the latest per narrative+type).
      const seen = new Set<string>();
      for (const f of (fcRows ?? []) as Array<{
        id: string;
        narrative_id?: string | null;
        forecast_type?: string | null;
        probability?: number | null;
      }>) {
        if (!f.narrative_id) continue;
        const key = `${f.narrative_id}:${f.forecast_type ?? 'unknown'}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const score = computeTrustScore(
          {
            entityType: 'forecast',
            entityId: f.narrative_id,
            evidenceQuality:
              typeof f.probability === 'number' ? clamp01(f.probability) : undefined,
            calibrationScore,
            sampleCount: 0,
          },
          { now },
        );
        if (
          await upsertForecastTrust(
            client,
            f.narrative_id,
            f.forecast_type ?? 'unknown',
            score,
            { force, summary },
          )
        ) {
          summary.forecasts += 1;
        }
      }
    } catch (e) {
      logError('calibration/persistence:recomputeTrust-forecasts', e);
    }

    return { ok: true, data: summary };
  } catch (e) {
    return fail(e);
  }
}

interface OutcomeAggregate {
  accuracy: number;
  count: number;
}

/** Aggregate recommendation-outcome success by decision run (accuracy 0..1). NEVER throws. */
async function loadOutcomesByRun(
  client: SupabaseClient,
): Promise<Map<string, OutcomeAggregate>> {
  const byRun = new Map<string, OutcomeAggregate>();
  try {
    const { data } = await client
      .from('hsin_recommendation_outcomes')
      .select('decision_run_id, success_score')
      .limit(20000);
    const acc = new Map<string, { sum: number; n: number }>();
    for (const o of (data ?? []) as Array<{
      decision_run_id?: string | null;
      success_score?: number | null;
    }>) {
      if (!o.decision_run_id || typeof o.success_score !== 'number') continue;
      const prev = acc.get(o.decision_run_id) ?? { sum: 0, n: 0 };
      prev.sum += clamp01(o.success_score / 100);
      prev.n += 1;
      acc.set(o.decision_run_id, prev);
    }
    for (const [runId, { sum, n }] of acc) {
      byRun.set(runId, { accuracy: n > 0 ? sum / n : 0, count: n });
    }
  } catch (e) {
    logError('calibration/persistence:loadOutcomesByRun', e);
  }
  return byRun;
}

/** Aggregate governance review tallies by decision run. NEVER throws. */
async function loadGovernanceByRun(
  client: SupabaseClient,
): Promise<Map<string, { validated: number; escalated: number; rejected: number }>> {
  const byRun = new Map<
    string,
    { validated: number; escalated: number; rejected: number }
  >();
  try {
    const { data } = await client
      .from('hsin_governance_reviews')
      .select('decision_run_id, decision')
      .limit(20000);
    for (const g of (data ?? []) as Array<{
      decision_run_id?: string | null;
      decision?: string | null;
    }>) {
      if (!g.decision_run_id) continue;
      const prev =
        byRun.get(g.decision_run_id) ?? { validated: 0, escalated: 0, rejected: 0 };
      if (g.decision === 'validated' || g.decision === 'approved') prev.validated += 1;
      else if (g.decision === 'escalated') prev.escalated += 1;
      else if (g.decision === 'rejected') prev.rejected += 1;
      byRun.set(g.decision_run_id, prev);
    }
  } catch (e) {
    logError('calibration/persistence:loadGovernanceByRun', e);
  }
  return byRun;
}

/**
 * UPSERT one trust row on a single-column unique key (source_id / narrative_id /
 * decision_run_id). Preserves a manually-overridden row unless `force` is set
 * (incrementing summary.preserved when skipped). NEVER throws.
 */
async function upsertTrust(
  client: SupabaseClient,
  table: 'hsin_source_trust' | 'hsin_narrative_trust' | 'hsin_decision_trust',
  idColumn: 'source_id' | 'narrative_id' | 'decision_run_id',
  entityId: string,
  score: TrustScore,
  ctx: { force: boolean; summary: RecomputeTrustSummary },
): Promise<boolean> {
  const { data: existing } = await client
    .from(table)
    .select('id, overridden')
    .eq(idColumn, entityId)
    .maybeSingle();

  if (existing?.id && existing.overridden === true && !ctx.force) {
    ctx.summary.preserved += 1;
    return false;
  }

  const payload = trustPayload(score);
  if (existing?.id) {
    const { error } = await client
      .from(table)
      .update(payload)
      .eq('id', existing.id as string);
    return !error;
  }
  const { error } = await client
    .from(table)
    .insert({ [idColumn]: entityId, ...payload });
  return !error;
}

/**
 * UPSERT one forecast-trust row on (narrative_id, forecast_kind). hsin_forecast_trust
 * has NO single-column unique key, so we match on the pair explicitly. Preserves a
 * manual override unless `force`. NEVER throws.
 */
async function upsertForecastTrust(
  client: SupabaseClient,
  narrativeId: string,
  forecastKind: string,
  score: TrustScore,
  ctx: { force: boolean; summary: RecomputeTrustSummary },
): Promise<boolean> {
  const { data: existing } = await client
    .from('hsin_forecast_trust')
    .select('id, overridden')
    .eq('narrative_id', narrativeId)
    .eq('forecast_kind', forecastKind)
    .maybeSingle();

  if (existing?.id && existing.overridden === true && !ctx.force) {
    ctx.summary.preserved += 1;
    return false;
  }

  const payload = { forecast_kind: forecastKind, ...trustPayload(score) };
  if (existing?.id) {
    const { error } = await client
      .from('hsin_forecast_trust')
      .update(payload)
      .eq('id', existing.id as string);
    return !error;
  }
  const { error } = await client
    .from('hsin_forecast_trust')
    .insert({ narrative_id: narrativeId, ...payload });
  return !error;
}

/** Map a TrustScore engine value into the shared trust-column payload (never `any`). */
function trustPayload(score: TrustScore): JsonRecord {
  return {
    trust_score: score.trustScore,
    confidence: clamp01(score.confidence),
    evidence_count: score.evidenceCount,
    calibration_score: score.calibrationScore,
    band: asTrustBand(score.band),
    explanation: listJson(score.explanation),
    limitations: listJson(score.limitations),
    last_updated: score.lastUpdated,
  };
}

export interface OverrideTrustResult {
  entityType: TrustEntityType;
  entityId: string;
  trustScore: number;
  band: TrustBand;
}

/**
 * Apply a HUMAN OVERRIDE to a trust score (curator/admin). REQUIRES a non-blank
 * reason — a blank reason is REFUSED with a validation error (never silent). Loads
 * the base trust row, reconstructs the engine TrustScore, applies applyTrustOverride
 * (which records the override explainably), and UPDATES the row (overridden=true,
 * override_reason, overridden_by=user.id, trust_score, band, explanation,
 * limitations). Writes an audit_logs row. NEVER throws.
 */
export async function overrideTrust(
  entityType: TrustEntityType | string,
  entityId: string,
  newScore: number,
  reason: string,
): Promise<DbResult<OverrideTrustResult>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'curator');
    if (!gate.ok) return gate;

    const cleanReason = (reason ?? '').trim();
    if (cleanReason.length === 0) {
      return validation('A trust override requires a non-blank reason.');
    }

    const type = asTrustEntityType(entityType);
    const now = new Date().toISOString();

    const table =
      type === 'source'
        ? 'hsin_source_trust'
        : type === 'narrative'
          ? 'hsin_narrative_trust'
          : type === 'forecast'
            ? 'hsin_forecast_trust'
            : 'hsin_decision_trust';
    const idColumn =
      type === 'source'
        ? 'source_id'
        : type === 'narrative'
          ? 'narrative_id'
          : type === 'forecast'
            ? 'narrative_id'
            : 'decision_run_id';

    const { data: row, error: rerr } = await client
      .from(table)
      .select('*')
      .eq(idColumn, entityId)
      .maybeSingle();
    if (rerr) return fail(rerr);
    if (!row) {
      return { ok: false, error: 'Trust record not found.', code: 'DB_ERROR' };
    }
    const trust = row as TrustRowLite & { id: string };

    // Reconstruct the engine TrustScore from the stored row for the override.
    const base: TrustScore = {
      entityType: type,
      entityId,
      trustScore: typeof trust.trust_score === 'number' ? trust.trust_score : 0,
      confidence: 0,
      evidenceCount: 0,
      calibrationScore: 0,
      band: asTrustBand(trust.band ?? 'low'),
      explanation: listFromJson(trust.explanation ?? undefined),
      limitations: listFromJson(trust.limitations ?? undefined),
      lastUpdated: trust.last_updated ?? now,
    };

    const overridden = applyTrustOverride(base, {
      newScore,
      reason: cleanReason,
      by: gate.user.id,
      now,
    });

    const { error: uerr } = await client
      .from(table)
      .update({
        trust_score: overridden.trustScore,
        band: asTrustBand(overridden.band),
        explanation: listJson(overridden.explanation),
        limitations: listJson(overridden.limitations),
        overridden: true,
        override_reason: overridden.overrideReason,
        overridden_by: gate.user.id,
        last_updated: now,
      })
      .eq('id', trust.id);
    if (uerr) return fail(uerr);

    await recordAudit(client, gate.user.id, 'trust.override', entityId, {
      entity_type: type,
      table,
      new_score: overridden.trustScore,
      reason: cleanReason,
    });

    return {
      ok: true,
      data: {
        entityType: type,
        entityId,
        trustScore: overridden.trustScore,
        band: asTrustBand(overridden.band),
      },
    };
  } catch (e) {
    return fail(e);
  }
}

/** Write a best-effort audit_logs row (0001 shape). NEVER blocks the mutation. */
async function recordAudit(
  client: SupabaseClient,
  userId: string | null,
  action: string,
  entityId: string,
  extra?: JsonRecord,
): Promise<void> {
  try {
    await client.from('audit_logs').insert({
      user_id: userId,
      action,
      metadata: {
        entity_type: 'trust',
        entity_id: entityId,
        ...(extra ?? {}),
      },
    });
  } catch {
    // Best-effort — never block the mutation on an audit write.
  }
}

// =============================================================================
// DEMO — labeled, NON-PERSISTED view-models from the package calibrationDemo().
// For the NOT_CONFIGURED / empty-env showcase path. NEVER throws.
// =============================================================================

export interface CalibrationDemoViews {
  dashboard: CalibrationDashboardData;
  calibration: CalibrationView;
  highlights: CalibrationHighlights;
  meaning82: ConfidenceMeaning;
}

export interface TrustDemoViews {
  dashboard: TrustDashboardData;
  trust: TrustView;
}

/**
 * Build the Phase-16 CALIBRATION view-models from the deterministic engine
 * fixtures (calibrationDemo). Synthetic ids; clearly a demo. NEVER throws.
 */
export async function demoCalibration(): Promise<DbResult<CalibrationDemoViews>> {
  try {
    const demo = calibrationDemo();
    const now = demo.now;
    const curve = demo.curve;
    const snapshotId = 'demo-calibration-snapshot-0';

    const snapshot: HsinCalibrationSnapshotRecord = {
      id: snapshotId,
      scope: 'overall',
      kind: 'all',
      sample_count: curve.sampleCount,
      expected_calibration_error: curve.expectedCalibrationError,
      max_calibration_error: curve.maxCalibrationError,
      overconfidence_index: curve.overconfidenceIndex,
      brier_score: demo.brierOverall.score,
      curve: toJson(curve),
      generated_at: curve.generatedAt,
      created_at: now,
    };

    const curves: HsinReliabilityCurveRecord[] = curve.bins.map((b, i) => ({
      id: `demo-curve-${i}`,
      calibration_snapshot_id: snapshotId,
      bin_lower: b.lower,
      bin_upper: b.upper,
      count: b.count,
      mean_confidence: b.meanConfidence,
      observed_success: b.observedSuccess,
      calibration_error: b.calibrationError,
      created_at: now,
    }));

    const brier: HsinBrierScoreRecord[] = [
      {
        id: 'demo-brier-0',
        scope: 'overall',
        kind: 'all',
        score: demo.brierOverall.score,
        sample_count: demo.brierOverall.sampleCount,
        calibration_quality: asCalibrationQuality(demo.brierOverall.calibrationQuality),
        interpretation: demo.brierOverall.interpretation,
        decomposition: demo.brierOverall.decomposition
          ? toJson(demo.brierOverall.decomposition)
          : undefined,
        created_at: now,
      },
    ];

    const drift: HsinConfidenceDriftRecord[] = Object.entries(demo.drift).map(
      ([scope, d], i) => ({
        id: `demo-drift-${i}`,
        scope,
        drift_kind: asDriftKind(d.result.kind),
        magnitude: d.result.magnitude,
        current_ece: d.result.currentEce,
        prior_ece: d.result.priorEce,
        recommendation: d.result.recommendation,
        explanation: d.result.explanation,
        detected_at: d.result.detectedAt,
        created_at: now,
      }),
    );

    const trend = [
      {
        generatedAt: curve.generatedAt,
        ece: curve.expectedCalibrationError,
        brier: demo.brierOverall.score,
      },
    ];

    const dashboard: CalibrationDashboardData = {
      snapshot,
      curves,
      brier,
      drift,
      trend,
    };
    const calibration: CalibrationView = {
      snapshot,
      curves,
      brier: brier[0],
      drift: drift[0],
    };
    const avgTrust = mean([
      demo.trust.source.trustScore,
      demo.trust.narrative.trustScore,
      demo.trust.forecast.trustScore,
      demo.trust.decision.trustScore,
    ]);
    const highlights: CalibrationHighlights = {
      ece: curve.expectedCalibrationError,
      brier: demo.brierOverall.score,
      driftKind: asDriftKind(demo.drift.overconfidence?.result.kind ?? 'stable'),
      avgTrust,
    };

    return {
      ok: true,
      data: {
        dashboard,
        calibration,
        highlights,
        meaning82: demo.meaning82,
      },
    };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Build the Phase-16 TRUST view-models from the deterministic engine fixtures
 * (calibrationDemo). Synthetic ids; clearly a demo. NEVER throws.
 */
export async function demoTrust(): Promise<DbResult<TrustDemoViews>> {
  try {
    const demo = calibrationDemo();
    const now = demo.now;

    const toRecord = (
      score: TrustScore,
    ): HsinSourceTrustRecord => ({
      id: `demo-trust-${score.entityType}`,
      source_id: score.entityId,
      trust_score: score.trustScore,
      confidence: score.confidence,
      evidence_count: score.evidenceCount,
      calibration_score: score.calibrationScore,
      band: asTrustBand(score.band),
      explanation: listJson(score.explanation),
      limitations: listJson(score.limitations),
      overridden: false,
      created_at: now,
      updated_at: now,
    });

    const sources: HsinSourceTrustRecord[] = [toRecord(demo.trust.source)];
    const narratives: HsinNarrativeTrustRecord[] = [
      {
        id: 'demo-trust-narrative',
        narrative_id: demo.trust.narrative.entityId,
        trust_score: demo.trust.narrative.trustScore,
        confidence: demo.trust.narrative.confidence,
        evidence_count: demo.trust.narrative.evidenceCount,
        calibration_score: demo.trust.narrative.calibrationScore,
        band: asTrustBand(demo.trust.narrative.band),
        explanation: listJson(demo.trust.narrative.explanation),
        limitations: listJson(demo.trust.narrative.limitations),
        overridden: false,
        created_at: now,
        updated_at: now,
      },
    ];
    const forecasts: HsinForecastTrustRecord[] = [
      {
        id: 'demo-trust-forecast',
        narrative_id: demo.trust.forecast.entityId,
        forecast_kind: 'rising',
        trust_score: demo.trust.forecast.trustScore,
        confidence: demo.trust.forecast.confidence,
        evidence_count: demo.trust.forecast.evidenceCount,
        calibration_score: demo.trust.forecast.calibrationScore,
        band: asTrustBand(demo.trust.forecast.band),
        explanation: listJson(demo.trust.forecast.explanation),
        limitations: listJson(demo.trust.forecast.limitations),
        overridden: false,
        created_at: now,
        updated_at: now,
      },
    ];
    const decisions: HsinDecisionTrustRecord[] = [
      {
        id: 'demo-trust-decision',
        decision_run_id: demo.trust.decision.entityId,
        trust_score: demo.trust.decision.trustScore,
        confidence: demo.trust.decision.confidence,
        evidence_count: demo.trust.decision.evidenceCount,
        calibration_score: demo.trust.decision.calibrationScore,
        band: asTrustBand(demo.trust.decision.band),
        explanation: listJson(demo.trust.decision.explanation),
        limitations: listJson(demo.trust.decision.limitations),
        overridden: false,
        created_at: now,
        updated_at: now,
      },
    ];

    const dashboard: TrustDashboardData = {
      sources,
      narratives,
      forecasts,
      decisions,
    };

    const s = demo.trust.source;
    const trust: TrustView = {
      entityType: s.entityType,
      entityId: s.entityId,
      trustScore: s.trustScore,
      band: asTrustBand(s.band),
      history: [{ trustScore: s.trustScore, at: s.lastUpdated }],
      explanation: s.explanation,
      limitations: s.limitations,
      overridden: false,
    };

    return { ok: true, data: { dashboard, trust } };
  } catch (e) {
    return fail(e);
  }
}

// -----------------------------------------------------------------------------
// Re-export the shared client accessor + role helper for the actions layer.
// -----------------------------------------------------------------------------
export { db as calibrationDbClient, requireRole as requireCalibrationRole };
