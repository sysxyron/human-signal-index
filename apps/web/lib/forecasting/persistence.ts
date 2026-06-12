// =============================================================================
// HSIN Phase 21 — Forecasting, Scenarios & Early Warning data-access layer.
// SERVER-ONLY.
//
// "What is likely to happen next, how reliable are our forecasts, what would
// invalidate them, and what early warnings exist?" The persistence layer for the
// Phase-21 tables (migration 0025):
//
//   * FORECASTS — hsin_forecasts (+ versions/outcomes/accuracy/alerts).
//   * SCENARIOS — hsin_scenarios (+ versions/comparisons/trees).
//   * WARNINGS  — hsin_early_warning_alerts.
//
// The PURE engines live in '@hsi/forecast-engine' (forecast + reliability) and
// '@hsi/scenario-engine' (scenarios + warnings). This DAL reads the persisted
// state, feeds it (with an injected `now`) into the engines for
// explanation/ranking/comparison, and persists governed changes.
//
// SERVER-ONLY — never import from a 'use client' module. Mirrors prior DALs.
// GOVERNANCE: autoPredict/autoAct/autoEscalate/autoPublish = false. Every forecast
// is a hypothesis with assumptions/invalidation/limitations. NEVER throws; empty
// env → NOT_CONFIGURED.
// =============================================================================

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { formatErrorMessage, logError } from '@/lib/errors/format-error';
import { createClient } from '@/lib/supabase/server';
import {
  buildForecastExplanation,
  computeForecastAccuracy,
  computeForecastBrierScore,
  computeForecastCalibration,
  type Forecast,
  type ForecastOutcome,
  type ForecastSignal,
  type ForecastStatus as EngineForecastStatus,
} from '@hsi/forecast-engine';
import {
  advanceScenario,
  compareScenarios,
  createScenario as engineCreateScenario,
  rankScenarios,
  type Scenario,
  type ScenarioState as EngineScenarioState,
} from '@hsi/scenario-engine';
import type {
  AppRole,
  ForecastBoardRow,
  ForecastDetailData,
  ForecastStatus,
  ForecastingHighlights,
  ForecastsBoardData,
  HsinEarlyWarningAlertRecord,
  HsinForecastReliabilityRecord,
  HsinForecastAlertRecord,
  HsinForecastOutcomeRecord,
  HsinForecastRecord,
  HsinForecastVersionRecord,
  HsinScenarioComparisonSnapshotRecord,
  HsinScenarioRecord,
  HsinScenarioTreeRecord,
  HsinScenarioVersionRecord,
  ScenarioDetailData,
  ScenarioState,
  ScenariosBoardData,
  WarningLevel,
  WarningsBoardData,
} from '@hsi/shared-types';

export type DbResultCode = 'AUTH_REQUIRED' | 'FORBIDDEN' | 'NOT_CONFIGURED' | 'DB_ERROR';
export type DbResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: DbResultCode };

const NOT_CONFIGURED = 'Supabase is not configured (set NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).';
const AUTH_REQUIRED = 'Sign in to continue.';

export function fail(error: unknown): { ok: false; error: string; code: DbResultCode } {
  logError('forecasting/persistence', error);
  if (error instanceof Error && /required|not configured|SUPABASE_/i.test(error.message) && /key|url/i.test(error.message)) {
    return { ok: false, error: NOT_CONFIGURED, code: 'NOT_CONFIGURED' };
  }
  return { ok: false, error: formatErrorMessage(error), code: 'DB_ERROR' };
}
function authRequired(): { ok: false; error: string; code: DbResultCode } {
  return { ok: false, error: AUTH_REQUIRED, code: 'AUTH_REQUIRED' };
}
export function forbidden(required: AppRole): { ok: false; error: string; code: DbResultCode } {
  return { ok: false, error: `Requires the ${required} role or higher.`, code: 'FORBIDDEN' };
}
function validation(message: string): { ok: false; error: string; code: DbResultCode } {
  return { ok: false, error: message, code: 'FORBIDDEN' };
}

function db(): SupabaseClient {
  return createClient();
}
async function currentUser(client: SupabaseClient): Promise<User | null> {
  const { data: { user } } = await client.auth.getUser();
  return user ?? null;
}
const ROLE_LEVEL: Record<AppRole, number> = { viewer: 1, researcher: 2, reviewer: 3, curator: 4, admin: 5 };
async function sessionRole(client: SupabaseClient): Promise<AppRole | null> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  const { data } = await client.from('users').select('role').eq('id', user.id).single();
  const role = (data?.role as string | undefined) ?? 'viewer';
  return (role in ROLE_LEVEL ? role : 'viewer') as AppRole;
}
async function requireRole(
  client: SupabaseClient,
  min: AppRole,
): Promise<{ ok: true; user: User; role: AppRole } | { ok: false; error: string; code: DbResultCode }> {
  const user = await currentUser(client);
  if (!user) return authRequired();
  const role = (await sessionRole(client)) ?? 'viewer';
  if (ROLE_LEVEL[role] < ROLE_LEVEL[min]) return forbidden(min);
  return { ok: true, user, role };
}

type JsonRecord = Record<string, unknown>;
function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
function listJson(items: unknown[]): JsonRecord {
  return { items };
}
function listFromJson(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((x) => String(x));
  if (value && typeof value === 'object') {
    const items = (value as JsonRecord).items;
    if (Array.isArray(items)) return items.map((x) => String(x));
  }
  return [];
}
function signalsFromJson(value: unknown): ForecastSignal[] {
  const raw = Array.isArray(value) ? value : (value && typeof value === 'object' ? (value as JsonRecord).items : undefined);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is JsonRecord => typeof r === 'object' && r !== null)
    .map((r, i) => ({ id: String(r.id ?? i), label: String(r.label ?? ''), strength: clamp01(Number(r.strength ?? 0)), direction: Math.sign(Number(r.direction ?? 0)), ...(r.sourceRef ? { sourceRef: String(r.sourceRef) } : {}) }));
}
function num(v: unknown, d = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}

/** Reconstruct an engine Forecast from a record (for the explanation). */
function recordToForecast(r: HsinForecastRecord): Forecast {
  return {
    forecastId: r.id,
    prediction: r.prediction ?? '',
    confidence: clamp01(num(r.confidence, 0.5)),
    reliability: clamp01(num(r.reliability, 0.5)),
    status: (r.status as EngineForecastStatus) ?? 'active',
    supportingSignals: signalsFromJson(r.supporting_signals),
    assumptions: listFromJson(r.assumptions),
    invalidationCriteria: listFromJson(r.invalidation_criteria),
    limitations: listFromJson(r.limitations),
    ...(r.horizon ? { horizon: r.horizon } : {}),
    createdAt: r.created_at,
    updatedAt: r.updated_at ?? r.created_at,
    ...(r.expires_at ? { expiresAt: r.expires_at } : {}),
    version: num(r.version, 1),
  };
}

// =============================================================================
// READS (researcher+)
// =============================================================================

export async function getForecastsBoard(): Promise<DbResult<ForecastsBoardData>> {
  try {
    const client = db();
    const { data, error } = await client.from('hsin_forecasts').select('*').order('created_at', { ascending: false }).limit(2000);
    if (error) return fail(error);
    const forecasts = (data ?? []) as HsinForecastRecord[];
    const rows: ForecastBoardRow[] = forecasts.map((f) => ({
      id: f.id,
      prediction: f.prediction ?? 'Untitled forecast',
      confidence: clamp01(num(f.confidence, 0)),
      reliability: clamp01(num(f.reliability, 0)),
      status: (f.status as ForecastStatus) ?? 'active',
      horizon: f.horizon,
      signalCount: signalsFromJson(f.supporting_signals).length,
      updatedAt: f.updated_at,
    }));
    const byStatus: Record<string, number> = {};
    for (const f of forecasts) byStatus[f.status ?? 'active'] = (byStatus[f.status ?? 'active'] ?? 0) + 1;

    const { data: accRows } = await client.from('hsin_forecast_accuracy').select('*').order('created_at', { ascending: false }).limit(1);
    const accuracy = ((accRows ?? []) as HsinForecastReliabilityRecord[])[0];
    return { ok: true, data: { rows, byStatus, ...(accuracy ? { accuracy } : {}) } };
  } catch (e) {
    return fail(e);
  }
}

export async function getForecastDetail(id: string, opts?: { now?: string }): Promise<DbResult<ForecastDetailData>> {
  try {
    const client = db();
    const now = opts?.now ?? new Date().toISOString();
    const { data: row, error } = await client.from('hsin_forecasts').select('*').eq('id', id).maybeSingle();
    if (error) return fail(error);
    if (!row) return { ok: false, error: 'Forecast not found.', code: 'DB_ERROR' };
    const forecast = row as HsinForecastRecord;

    const [{ data: oRows }, { data: vRows }, { data: aRows }] = await Promise.all([
      client.from('hsin_forecast_outcomes').select('*').eq('forecast_id', id).order('created_at', { ascending: false }).limit(500),
      client.from('hsin_forecast_versions').select('*').eq('forecast_id', id).order('version', { ascending: true }).limit(500),
      client.from('hsin_forecast_alerts').select('*').eq('forecast_id', id).order('created_at', { ascending: false }).limit(200),
    ]);

    const exp = buildForecastExplanation(recordToForecast(forecast), { now });
    return {
      ok: true,
      data: {
        forecast,
        explanation: { factors: exp.factors, assumptions: exp.assumptions, invalidationCriteria: exp.invalidationCriteria, limitations: exp.limitations, summary: exp.summary },
        outcomes: (oRows ?? []) as HsinForecastOutcomeRecord[],
        versions: (vRows ?? []) as HsinForecastVersionRecord[],
        alerts: (aRows ?? []) as HsinForecastAlertRecord[],
      },
    };
  } catch (e) {
    return fail(e);
  }
}

export async function getScenariosBoard(opts?: { now?: string }): Promise<DbResult<ScenariosBoardData>> {
  try {
    const client = db();
    const now = opts?.now ?? new Date().toISOString();
    const { data, error } = await client.from('hsin_scenarios').select('*').order('likelihood', { ascending: false, nullsFirst: false }).limit(2000);
    if (error) return fail(error);
    const scenarios = (data ?? []) as HsinScenarioRecord[];
    const byState: Record<string, number> = {};
    for (const s of scenarios) byState[s.state ?? 'EMERGING'] = (byState[s.state ?? 'EMERGING'] ?? 0) + 1;

    // Live comparison across active/emerging/monitoring scenarios.
    const live = scenarios.filter((s) => ['EMERGING', 'ACTIVE', 'MONITORING'].includes(s.state ?? ''));
    let comparison: HsinScenarioComparisonSnapshotRecord | undefined;
    if (live.length > 0) {
      const cmp = compareScenarios(live.map(recordToScenario), { now });
      comparison = { id: 'live', leading: cmp.leading ?? undefined, divergence: cmp.divergence, ranked: { items: cmp.ranked }, summary: cmp.summary, limitations: { items: cmp.limitations }, compared_at: cmp.comparedAt, created_at: cmp.comparedAt };
    }
    return { ok: true, data: { scenarios, byState, ...(comparison ? { comparison } : {}) } };
  } catch (e) {
    return fail(e);
  }
}

function recordToScenario(r: HsinScenarioRecord): Scenario {
  const drivers = Array.isArray(r.drivers) ? r.drivers : (r.drivers && typeof r.drivers === 'object' ? (r.drivers as JsonRecord).items : undefined);
  return {
    id: r.id,
    title: r.title ?? '',
    description: r.description ?? '',
    state: (r.state as EngineScenarioState) ?? 'EMERGING',
    likelihood: clamp01(num(r.likelihood, 0.5)),
    drivers: Array.isArray(drivers) ? drivers.filter((d): d is JsonRecord => typeof d === 'object' && d !== null).map((d) => ({ label: String(d.label ?? ''), weight: clamp01(Number(d.weight ?? 0)), presence: clamp01(Number(d.presence ?? 0)) })) : [],
    forecastIds: listFromJson(r.forecast_ids),
    createdAt: r.created_at,
    updatedAt: r.updated_at ?? r.created_at,
    events: [],
  };
}

export async function getScenarioDetail(id: string): Promise<DbResult<ScenarioDetailData>> {
  try {
    const client = db();
    const { data: row, error } = await client.from('hsin_scenarios').select('*').eq('id', id).maybeSingle();
    if (error) return fail(error);
    if (!row) return { ok: false, error: 'Scenario not found.', code: 'DB_ERROR' };
    const scenario = row as HsinScenarioRecord;

    const { data: tRows } = await client.from('hsin_scenario_trees').select('*').eq('scenario_id', id).order('created_at', { ascending: false }).limit(1);
    const { data: vRows } = await client.from('hsin_scenario_versions').select('*').eq('scenario_id', id).order('created_at', { ascending: true }).limit(500);
    const { data: allRows } = await client.from('hsin_scenarios').select('*').in('state', ['EMERGING', 'ACTIVE', 'MONITORING']).limit(2000);
    const ranked = rankScenarios(((allRows ?? []) as HsinScenarioRecord[]).map(recordToScenario)).map((r) => ({ id: r.id, title: r.title, likelihood: r.likelihood, rank: r.rank, share: r.share }));

    return { ok: true, data: { scenario, tree: ((tRows ?? []) as HsinScenarioTreeRecord[])[0], versions: (vRows ?? []) as HsinScenarioVersionRecord[], ranked } };
  } catch (e) {
    return fail(e);
  }
}

export async function getWarningsBoard(): Promise<DbResult<WarningsBoardData>> {
  try {
    const client = db();
    const { data: wRows, error } = await client.from('hsin_early_warning_alerts').select('*').order('created_at', { ascending: false }).limit(500);
    if (error) return fail(error);
    const warnings = (wRows ?? []) as HsinEarlyWarningAlertRecord[];
    const { data: fRows } = await client.from('hsin_forecast_alerts').select('*').order('created_at', { ascending: false }).limit(200);
    const byLevel: Record<WarningLevel, number> = { INFO: 0, WATCH: 0, WARNING: 0, CRITICAL: 0 };
    for (const w of warnings) if (w.level && w.level in byLevel) byLevel[w.level] += 1;
    return { ok: true, data: { warnings, forecastAlerts: (fRows ?? []) as HsinForecastAlertRecord[], byLevel } };
  } catch (e) {
    return fail(e);
  }
}

export async function getForecastingHighlights(): Promise<DbResult<ForecastingHighlights>> {
  try {
    const client = db();
    const { data: fRows } = await client.from('hsin_forecasts').select('status').limit(5000);
    const forecasts = (fRows ?? []) as Array<{ status?: string }>;
    const count = (s: string) => forecasts.filter((f) => f.status === s).length;
    const { data: scRows } = await client.from('hsin_scenarios').select('state').in('state', ['ACTIVE', 'EMERGING']).limit(5000);
    const { data: wRows } = await client.from('hsin_early_warning_alerts').select('id').eq('status', 'open').limit(5000);
    const { data: accRows } = await client.from('hsin_forecast_accuracy').select('success_rate, drift').order('created_at', { ascending: false }).limit(1);
    const acc = ((accRows ?? []) as Array<{ success_rate?: number; drift?: number }>)[0];
    return {
      ok: true,
      data: {
        activeForecasts: count('active'),
        forecastFailures: count('failed'),
        scenarioShifts: (scRows ?? []).length,
        warningAlerts: (wRows ?? []).length,
        ...(acc?.success_rate !== undefined ? { forecastAccuracy: acc.success_rate } : {}),
        ...(acc?.drift !== undefined ? { confidenceDrift: acc.drift } : {}),
      },
    };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// WRITES
// =============================================================================

export interface CreateScenarioResult { scenarioId: string; slug: string }

export async function createScenarioDal(input: { slug: string; title: string; description: string; drivers?: { label: string; weight: number; presence: number }[] }, now: string): Promise<DbResult<CreateScenarioResult>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'curator');
    if (!gate.ok) return gate;
    const scn = engineCreateScenario({ id: 'pending', title: input.title, description: input.description, drivers: input.drivers }, { now, actor: gate.user.id });
    const { data: row, error } = await client.from('hsin_scenarios').insert({ slug: input.slug, title: scn.title, description: scn.description, state: scn.state, likelihood: scn.likelihood, drivers: listJson(scn.drivers), forecast_ids: listJson([]), created_by: gate.user.id }).select('id, slug').single();
    if (error || !row?.id) return fail(error ?? new Error('Scenario insert returned no id.'));
    await client.from('hsin_scenario_versions').insert({ scenario_id: row.id, from_state: 'EMERGING', to_state: 'EMERGING', actor: gate.user.id, reason: 'Scenario created.', likelihood: scn.likelihood, at: now });
    await recordAudit(client, gate.user.id, 'scenario.create', row.id as string, { slug: input.slug });
    return { ok: true, data: { scenarioId: row.id as string, slug: row.slug as string } };
  } catch (e) {
    return fail(e);
  }
}

export async function transitionScenarioDal(id: string, to: ScenarioState, now: string, reason?: string): Promise<DbResult<{ from: string; to: string }>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'curator');
    if (!gate.ok) return gate;
    const { data: row, error } = await client.from('hsin_scenarios').select('*').eq('id', id).maybeSingle();
    if (error) return fail(error);
    if (!row) return { ok: false, error: 'Scenario not found.', code: 'DB_ERROR' };
    const scn = recordToScenario(row as HsinScenarioRecord);
    const res = advanceScenario(scn, to as EngineScenarioState, { now, actor: gate.user.id, reason });
    if (!res.ok) return validation(res.reason);
    await client.from('hsin_scenarios').update({ state: res.scenario.state }).eq('id', id);
    await client.from('hsin_scenario_versions').insert({ scenario_id: id, from_state: res.event.from, to_state: res.event.to, actor: gate.user.id, reason: res.event.reason, likelihood: scn.likelihood, at: now });
    await recordAudit(client, gate.user.id, 'scenario.transition', id, { from: res.event.from, to: res.event.to });
    return { ok: true, data: { from: res.event.from, to: res.event.to } };
  } catch (e) {
    return fail(e);
  }
}

export async function recomputeForecastAccuracyDal(now: string): Promise<DbResult<{ sampleCount: number; ece: number; brier: number }>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'curator');
    if (!gate.ok) return gate;
    const { data } = await client.from('hsin_forecast_outcomes').select('forecast_id, confidence, success').limit(20000);
    const outcomes: ForecastOutcome[] = ((data ?? []) as Array<{ forecast_id?: string; confidence?: number; success?: number }>)
      .filter((o) => typeof o.confidence === 'number' && typeof o.success === 'number')
      .map((o) => ({ forecastId: String(o.forecast_id ?? ''), confidence: clamp01(o.confidence as number), success: clamp01(o.success as number) }));
    if (outcomes.length === 0) return validation('No forecast outcomes to compute accuracy from.');
    const accuracy = computeForecastAccuracy(outcomes);
    const calibration = computeForecastCalibration(outcomes);
    const brier = computeForecastBrierScore(outcomes);
    await client.from('hsin_forecast_accuracy').insert({ scope: 'overall', success_rate: accuracy.successRate, failure_rate: accuracy.failureRate, ece: calibration.ece, brier_score: brier.score, drift: 0, sample_count: outcomes.length, bins: listJson(calibration.bins), computed_at: now });
    await recordAudit(client, gate.user.id, 'forecast.accuracy.recompute', 'overall', { sampleCount: outcomes.length });
    return { ok: true, data: { sampleCount: outcomes.length, ece: calibration.ece, brier: brier.score } };
  } catch (e) {
    return fail(e);
  }
}

export async function resolveWarningDal(id: string, status: 'acknowledged' | 'resolved', now: string): Promise<DbResult<{ id: string; status: string }>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'curator');
    if (!gate.ok) return gate;
    const { data: row, error } = await client.from('hsin_early_warning_alerts').select('id').eq('id', id).maybeSingle();
    if (error) return fail(error);
    if (!row) return { ok: false, error: 'Warning not found.', code: 'DB_ERROR' };
    await client.from('hsin_early_warning_alerts').update({ status, resolved_by: gate.user.id }).eq('id', id);
    await recordAudit(client, gate.user.id, `warning.${status}`, id, {});
    return { ok: true, data: { id, status } };
  } catch (e) {
    return fail(e);
  }
}

async function recordAudit(client: SupabaseClient, userId: string | null, action: string, entityId: string, extra?: JsonRecord): Promise<void> {
  try {
    await client.from('audit_logs').insert({ user_id: userId, action, metadata: { entity_type: 'forecasting', entity_id: entityId, ...(extra ?? {}) } });
  } catch {
    // best-effort.
  }
}

export { db as forecastingDbClient, requireRole as requireForecastingRole, recordToForecast, recordToScenario };
