// =============================================================================
// HSI Phase 67 — Forecast DAL (SERVER-ONLY). Reads/writes the forecast tables via
// the caller's RLS client (reviewer+ read, admin manage). Forecasts are immutable
// once active (the engine enforces that); evaluations are append-only. Reuses the
// Phase 62 notification DAL for alerts. Never throws; degrades to empty.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { insertNotificationDal, getPreferencesDal } from '@/lib/notifications/persistence';
import { shouldDeliver, type NotificationSeverity } from '@/lib/notifications/types';
import {
  type Forecast, type ForecastPrediction, type ForecastOutcome, type ForecastEvaluation,
  type ForecastScore, type CalibrationBucket, type PredictionType, type PredictionValue,
  type ForecastStatus, type EvaluationResult, type ForecastAlertType,
  isForecastStatus, isPredictionType,
} from './types';
import type { EvalRecord } from './calibration';

export type DbResultCode = 'AUTH_REQUIRED' | 'FORBIDDEN' | 'NOT_CONFIGURED' | 'DB_ERROR';
export type DbResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: DbResultCode };

function fail(e: unknown): { ok: false; error: string; code: DbResultCode } {
  return { ok: false, error: e instanceof Error ? e.message : 'Operation failed.', code: 'DB_ERROR' };
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fmt(iso?: string | null): string { if (!iso) return '—'; const d = new Date(iso); return Number.isNaN(d.getTime()) ? '—' : `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`; }

const FC_COLS = 'id, title, description, prediction_type, status, confidence, forecast_date, resolution_date, outcome, source, agent_id, narrative_id, graph_node_id, created_at, updated_at';
function mapForecast(r: Record<string, unknown>): Forecast {
  return {
    id: r.id as string, title: (r.title as string) ?? 'Forecast', description: (r.description as string) ?? null,
    predictionType: (isPredictionType(r.prediction_type) ? r.prediction_type : 'binary') as PredictionType,
    status: (isForecastStatus(r.status) ? r.status : 'draft') as ForecastStatus,
    confidence: (r.confidence as number) ?? null, forecastDate: r.forecast_date as string,
    resolutionDate: (r.resolution_date as string) ?? null, outcome: (r.outcome as string) ?? null,
    source: (r.source as string) ?? null, agentId: (r.agent_id as string) ?? null,
    narrativeId: (r.narrative_id as string) ?? null, graphNodeId: (r.graph_node_id as string) ?? null,
    createdAt: r.created_at as string, updatedAt: (r.updated_at as string) ?? null,
  };
}

// ---- forecast CRUD ----------------------------------------------------------

export interface CreateForecastInput {
  title: string; description?: string; predictionType: PredictionType; confidence?: number | null;
  resolutionDate?: string | null; source?: string; agentId?: string | null; narrativeId?: string | null;
  graphNodeId?: string | null; predictedValue: PredictionValue; status?: ForecastStatus;
}

export async function insertForecast(writer: SupabaseClient, input: CreateForecastInput, actorId: string): Promise<DbResult<{ id: string }>> {
  try {
    const { data, error } = await writer.from('forecasts').insert({
      title: input.title, description: input.description ?? null, prediction_type: input.predictionType,
      status: input.status ?? 'active', confidence: input.confidence ?? null, resolution_date: input.resolutionDate ?? null,
      source: input.source ?? null, agent_id: input.agentId ?? null, narrative_id: input.narrativeId ?? null,
      graph_node_id: input.graphNodeId ?? null, created_by: actorId,
    }).select('id').single();
    if (error || !data) return fail(error ?? new Error('insert failed'));
    const id = (data as { id: string }).id;
    await writer.from('forecast_predictions').insert({ forecast_id: id, prediction_type: input.predictionType, predicted_value: input.predictedValue }).then(() => undefined, () => undefined);
    return { ok: true, data: { id } };
  } catch (e) { return fail(e); }
}

export async function getForecastDal(db: SupabaseClient, id: string): Promise<Forecast | null> {
  try {
    const { data } = await db.from('forecasts').select(FC_COLS).eq('id', id).maybeSingle();
    return data ? mapForecast(data as Record<string, unknown>) : null;
  } catch { return null; }
}

export async function listForecastsDal(db: SupabaseClient, opts: { status?: ForecastStatus; limit?: number } = {}): Promise<Forecast[]> {
  try {
    let q = db.from('forecasts').select(FC_COLS);
    if (opts.status) q = q.eq('status', opts.status);
    const { data } = await q.order('created_at', { ascending: false }).limit(opts.limit ?? 200);
    return ((data ?? []) as Array<Record<string, unknown>>).map(mapForecast);
  } catch { return []; }
}

export async function searchForecastsDal(db: SupabaseClient, q: string, limit = 25): Promise<Forecast[]> {
  try {
    let query = db.from('forecasts').select(FC_COLS);
    if (q.trim()) query = query.ilike('title', `%${q.trim()}%`);
    const { data } = await query.order('created_at', { ascending: false }).limit(limit);
    return ((data ?? []) as Array<Record<string, unknown>>).map(mapForecast);
  } catch { return []; }
}

export async function setStatus(writer: SupabaseClient, id: string, status: ForecastStatus, outcome?: string | null): Promise<void> {
  try {
    const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (outcome !== undefined) patch.outcome = outcome;
    await writer.from('forecasts').update(patch).eq('id', id);
  } catch { /* best-effort */ }
}

// ---- predictions / outcomes -------------------------------------------------

export async function getPredictionDal(db: SupabaseClient, id: string): Promise<ForecastPrediction | null> {
  try {
    const { data } = await db.from('forecast_predictions').select('prediction_type, predicted_value').eq('forecast_id', id).order('created_at', { ascending: true }).limit(1).maybeSingle();
    if (!data) return null;
    const r = data as { prediction_type: string; predicted_value: PredictionValue };
    return { predictionType: (isPredictionType(r.prediction_type) ? r.prediction_type : 'binary') as PredictionType, predictedValue: r.predicted_value ?? {} };
  } catch { return null; }
}

export async function recordOutcomeDal(writer: SupabaseClient, id: string, input: { actualValue: PredictionValue; outcomeLabel?: string; note?: string }, actorId: string): Promise<DbResult<{ id: string }>> {
  try {
    const { error } = await writer.from('forecast_outcomes').insert({ forecast_id: id, actual_value: input.actualValue, outcome_label: input.outcomeLabel ?? null, note: input.note ?? null, recorded_by: actorId });
    if (error) return fail(error);
    return { ok: true, data: { id } };
  } catch (e) { return fail(e); }
}

export async function getOutcomeDal(db: SupabaseClient, id: string): Promise<ForecastOutcome | null> {
  try {
    const { data } = await db.from('forecast_outcomes').select('actual_value, outcome_label, note, recorded_at').eq('forecast_id', id).order('recorded_at', { ascending: false }).limit(1).maybeSingle();
    if (!data) return null;
    const r = data as { actual_value: PredictionValue; outcome_label: string | null; note: string | null; recorded_at: string };
    return { actualValue: r.actual_value ?? {}, outcomeLabel: r.outcome_label, note: r.note, recordedAt: r.recorded_at };
  } catch { return null; }
}

// ---- evaluations (append-only) ---------------------------------------------

export async function insertEvaluation(writer: SupabaseClient, id: string, ev: { result: EvaluationResult; score: number | null; rationale: string }, actorId: string | null): Promise<void> {
  try { await writer.from('forecast_evaluations').insert({ forecast_id: id, result: ev.result, score: ev.score, rationale: ev.rationale, evaluated_by: actorId }); } catch { /* best-effort */ }
}

export async function getEvaluationsDal(db: SupabaseClient, id: string): Promise<ForecastEvaluation[]> {
  try {
    const { data } = await db.from('forecast_evaluations').select('result, score, rationale, evaluated_at').eq('forecast_id', id).order('evaluated_at', { ascending: false }).limit(50);
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({ result: r.result as EvaluationResult, score: (r.score as number) ?? null, rationale: (r.rationale as string) ?? null, evaluatedAt: r.evaluated_at as string }));
  } catch { return []; }
}

export async function upsertScore(writer: SupabaseClient, id: string, sc: { brierScore: number | null; accuracy: number | null; confidence: number | null; error: number | null; result: string }): Promise<void> {
  try { await writer.from('forecast_scores').upsert({ forecast_id: id, brier_score: sc.brierScore, accuracy: sc.accuracy, confidence: sc.confidence, error: sc.error, result: sc.result, computed_at: new Date().toISOString() }, { onConflict: 'forecast_id' }); } catch { /* best-effort */ }
}

export async function getScoreDal(db: SupabaseClient, id: string): Promise<ForecastScore | null> {
  try {
    const { data } = await db.from('forecast_scores').select('brier_score, accuracy, confidence, error, result').eq('forecast_id', id).maybeSingle();
    if (!data) return null;
    const r = data as Record<string, unknown>;
    return { brierScore: (r.brier_score as number) ?? null, accuracy: (r.accuracy as number) ?? null, confidence: (r.confidence as number) ?? null, error: (r.error as number) ?? null, result: (r.result as string) ?? null };
  } catch { return null; }
}

// ---- calibration / snapshots ------------------------------------------------

export async function replaceCalibration(writer: SupabaseClient, buckets: CalibrationBucket[]): Promise<void> {
  try {
    await writer.from('forecast_calibration').delete().not('id', 'is', null);
    if (buckets.length) await writer.from('forecast_calibration').insert(buckets.map((b) => ({ bucket: b.bucket, predicted_confidence: b.predictedConfidence, actual_accuracy: b.actualAccuracy, count: b.count })));
  } catch { /* best-effort */ }
}

export async function getCalibrationDal(db: SupabaseClient): Promise<CalibrationBucket[]> {
  try {
    const { data } = await db.from('forecast_calibration').select('bucket, predicted_confidence, actual_accuracy, count').order('bucket', { ascending: true });
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({ bucket: r.bucket as string, predictedConfidence: (r.predicted_confidence as number) ?? 0, actualAccuracy: (r.actual_accuracy as number) ?? 0, count: (r.count as number) ?? 0 }));
  } catch { return []; }
}

export interface SnapshotInput { active: number; resolved: number; expired: number; accuracy: number; calibrationScore: number; volume: number }
export async function insertSnapshot(writer: SupabaseClient, s: SnapshotInput): Promise<void> {
  try { await writer.from('forecast_snapshots').insert({ active: s.active, resolved: s.resolved, expired: s.expired, accuracy: s.accuracy, calibration_score: s.calibrationScore, volume: s.volume }); } catch { /* best-effort */ }
}
export interface SnapshotRow { accuracy: number; calibrationScore: number; volume: number; resolved: number; snapshotAt: string }
export async function getSnapshotsDal(db: SupabaseClient, limit = 60): Promise<SnapshotRow[]> {
  try {
    const { data } = await db.from('forecast_snapshots').select('accuracy, calibration_score, volume, resolved, snapshot_at').order('snapshot_at', { ascending: false }).limit(limit);
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({ accuracy: (r.accuracy as number) ?? 0, calibrationScore: (r.calibration_score as number) ?? 0, volume: (r.volume as number) ?? 0, resolved: (r.resolved as number) ?? 0, snapshotAt: r.snapshot_at as string })).reverse();
  } catch { return []; }
}

// ---- eval records for performance (forecasts ⨝ scores) ---------------------

export async function readEvalRecords(db: SupabaseClient): Promise<EvalRecord[]> {
  try {
    const { data: fc } = await db.from('forecasts').select('id, status, prediction_type, confidence').limit(5000);
    const { data: sc } = await db.from('forecast_scores').select('forecast_id, brier_score, result').limit(5000);
    const scoreById = new Map<string, { brier: number | null; result: string | null }>();
    for (const r of (sc ?? []) as Array<{ forecast_id: string; brier_score: number | null; result: string | null }>) scoreById.set(r.forecast_id, { brier: r.brier_score, result: r.result });
    return ((fc ?? []) as Array<{ id: string; status: string; prediction_type: string; confidence: number | null }>).map((r) => {
      const s = scoreById.get(r.id);
      return {
        status: (isForecastStatus(r.status) ? r.status : 'draft') as ForecastStatus,
        result: (s?.result as EvaluationResult) ?? null,
        confidence: r.confidence, brier: s?.brier ?? null,
        predictionType: (isPredictionType(r.prediction_type) ? r.prediction_type : 'binary') as PredictionType,
      };
    });
  } catch { return []; }
}

export async function countByStatusDal(db: SupabaseClient): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  try { const { data } = await db.from('forecasts').select('status').limit(5000); for (const r of (data ?? []) as Array<{ status: string }>) out[r.status] = (out[r.status] ?? 0) + 1; } catch { /* ignore */ }
  return out;
}

/** Active forecasts whose resolution date has passed (due for evaluation). */
export async function dueForecastsDal(db: SupabaseClient, nowIso: string, limit = 500): Promise<Forecast[]> {
  try {
    const { data } = await db.from('forecasts').select(FC_COLS).eq('status', 'active').lte('resolution_date', nowIso).limit(limit);
    return ((data ?? []) as Array<Record<string, unknown>>).map(mapForecast);
  } catch { return []; }
}

// ---- alerts + notifications -------------------------------------------------

export async function insertAlertDal(writer: SupabaseClient, forecastId: string | null, alertType: ForecastAlertType, severity: NotificationSeverity, reason: string, evidence: Record<string, unknown>): Promise<string | null> {
  try {
    const { data, error } = await writer.from('forecast_alerts').insert({ forecast_id: forecastId, alert_type: alertType, severity, reason, evidence }).select('id').single();
    if (error || !data) return null;
    return (data as { id: string }).id;
  } catch { return null; }
}
export async function linkAlertNotification(writer: SupabaseClient, alertId: string, notificationId: string): Promise<void> {
  try { await writer.from('forecast_alerts').update({ notification_id: notificationId }).eq('id', alertId); } catch { /* best-effort */ }
}

export interface AlertRow { id: string; forecastId: string | null; alertType: string; severity: string; reason: string | null; createdAt: string; createdLabel: string; notificationId: string | null }
export async function getAlertsDal(db: SupabaseClient, forecastId: string | null, limit = 50): Promise<AlertRow[]> {
  try {
    let q = db.from('forecast_alerts').select('id, forecast_id, alert_type, severity, reason, created_at, notification_id');
    if (forecastId) q = q.eq('forecast_id', forecastId);
    const { data } = await q.order('created_at', { ascending: false }).limit(limit);
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({ id: r.id as string, forecastId: (r.forecast_id as string) ?? null, alertType: r.alert_type as string, severity: r.severity as string, reason: (r.reason as string) ?? null, createdAt: r.created_at as string, createdLabel: fmt(r.created_at as string), notificationId: (r.notification_id as string) ?? null }));
  } catch { return []; }
}

export async function listAdminUserIds(writer: SupabaseClient): Promise<string[]> {
  const ids = new Set<string>();
  try {
    const { data } = await writer.from('user_roles').select('user_id, roles(name)').limit(5000);
    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      const rel = row.roles;
      const names: string[] = Array.isArray(rel) ? rel.map((r) => String((r as { name?: unknown }).name ?? '').toLowerCase()) : rel && typeof rel === 'object' ? [String((rel as { name?: unknown }).name ?? '').toLowerCase()] : [];
      if (names.includes('admin') && typeof row.user_id === 'string') ids.add(row.user_id);
    }
  } catch { /* ignore */ }
  return Array.from(ids);
}

export async function emitNotification(writer: SupabaseClient, recipientId: string, actorId: string | null, severity: NotificationSeverity, title: string, body: string, metadata: Record<string, unknown>): Promise<string | null> {
  try {
    const prefs = await getPreferencesDal(writer, recipientId);
    if (!shouldDeliver(prefs, 'FORECAST_TRIGGER', severity)) return null;
    const r = await insertNotificationDal(writer, { userId: recipientId, type: 'FORECAST_TRIGGER', severity, title, body, link: '/dashboard/forecast-validation', entityType: 'forecast', metadata }, actorId ?? recipientId);
    return r.ok ? r.data.id : null;
  } catch { return null; }
}

export interface ScoredForecast { id: string; title: string; result: string | null; brier: number | null; accuracy: number | null; confidence: number | null }
export async function scoredForecastsDal(db: SupabaseClient, limit = 200): Promise<ScoredForecast[]> {
  try {
    const { data: fc } = await db.from('forecasts').select('id, title').eq('status', 'resolved').limit(limit);
    const rows = (fc ?? []) as Array<{ id: string; title: string | null }>;
    if (rows.length === 0) return [];
    const { data: sc } = await db.from('forecast_scores').select('forecast_id, result, brier_score, accuracy, confidence').in('forecast_id', rows.map((r) => r.id));
    const byId = new Map<string, { result: string | null; brier: number | null; accuracy: number | null; confidence: number | null }>();
    for (const r of (sc ?? []) as Array<{ forecast_id: string; result: string | null; brier_score: number | null; accuracy: number | null; confidence: number | null }>) byId.set(r.forecast_id, { result: r.result, brier: r.brier_score, accuracy: r.accuracy, confidence: r.confidence });
    return rows.map((r) => ({ id: r.id, title: r.title ?? 'Forecast', ...(byId.get(r.id) ?? { result: null, brier: null, accuracy: null, confidence: null }) }));
  } catch { return []; }
}

export { fail };
