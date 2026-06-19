// =============================================================================
// HSI Phase 67 — Forecast engine (SERVER-ONLY). Records forecasts (immutable),
// records outcomes, evaluates against reality DETERMINISTICALLY, scores, and
// recomputes calibration + a performance snapshot. Emits Phase 62 alerts. This is
// VALIDATION only — it never creates predictions or forecasts autonomously. NEVER
// throws.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { evaluatePrediction } from './evaluation';
import { buildCalibrationCurve, calibrationScore, performanceMetrics } from './calibration';
import * as dal from './persistence';
import type { CreateForecastInput } from './persistence';
import type { ForecastAlertType, ForecastSeverity } from './types';

async function emitAlert(writer: SupabaseClient, forecastId: string | null, type: ForecastAlertType, severity: ForecastSeverity, reason: string, evidence: Record<string, unknown>, actorId: string | null): Promise<void> {
  const alertId = await dal.insertAlertDal(writer, forecastId, type, severity, reason, evidence);
  const recipients = await dal.listAdminUserIds(writer);
  const targets = recipients.length ? recipients : (actorId ? [actorId] : []);
  let first: string | null = null;
  for (const r of targets) { const id = await dal.emitNotification(writer, r, actorId, severity, reason, reason, { forecastId, alertType: type, ...evidence }); if (id && !first) first = id; }
  if (alertId && first) await dal.linkAlertNotification(writer, alertId, first);
}

export async function createForecast(writer: SupabaseClient, actorId: string, input: CreateForecastInput): Promise<dal.DbResult<{ id: string }>> {
  if (!input.title?.trim()) return { ok: false, error: 'A forecast title is required.', code: 'DB_ERROR' };
  return dal.insertForecast(writer, input, actorId);
}

export async function recordOutcome(writer: SupabaseClient, actorId: string, id: string, input: { actualValue: Record<string, unknown>; outcomeLabel?: string; note?: string }): Promise<dal.DbResult<{ id: string }>> {
  const fc = await dal.getForecastDal(writer, id);
  if (!fc) return { ok: false, error: 'Forecast not found.', code: 'DB_ERROR' };
  return dal.recordOutcomeDal(writer, id, input, actorId);
}

/** Evaluate a forecast against its recorded outcome → result + score (immutable). */
export async function evaluateForecast(writer: SupabaseClient, actorId: string | null, id: string): Promise<dal.DbResult<{ result: string }>> {
  const fc = await dal.getForecastDal(writer, id);
  if (!fc) return { ok: false, error: 'Forecast not found.', code: 'DB_ERROR' };
  const prediction = await dal.getPredictionDal(writer, id);
  if (!prediction) return { ok: false, error: 'Forecast has no prediction to evaluate.', code: 'DB_ERROR' };
  const outcome = await dal.getOutcomeDal(writer, id);

  const verdict = evaluatePrediction(prediction.predictionType, prediction.predictedValue, outcome?.actualValue ?? null);
  await dal.insertEvaluation(writer, id, verdict, actorId);

  if (verdict.result === 'unresolved') return { ok: true, data: { result: 'unresolved' } };

  const accuracy = verdict.result === 'correct' ? 1 : verdict.result === 'partial' ? 0.5 : 0;
  const brier = prediction.predictionType === 'probability' && verdict.score != null ? Math.round((1 - verdict.score) * 1000) / 1000 : null;
  const error = fc.confidence != null ? Math.round(Math.abs(fc.confidence - accuracy) * 1000) / 1000 : null;
  await dal.upsertScore(writer, id, { brierScore: brier, accuracy, confidence: fc.confidence, error, result: verdict.result });
  await dal.setStatus(writer, id, 'resolved', outcome?.outcomeLabel ?? verdict.result);

  const missed = verdict.result === 'incorrect';
  await emitAlert(writer, id, missed ? 'FORECAST_MISSED' : 'FORECAST_RESOLVED', missed ? 'WARNING' : 'NOTICE', `Forecast ${missed ? 'missed' : 'resolved'}: ${fc.title} (${verdict.result}).`, { result: verdict.result, score: verdict.score }, actorId);
  await recomputeCalibration(writer, actorId);
  return { ok: true, data: { result: verdict.result } };
}

/** Manual resolve (admin) = evaluate against the recorded outcome. */
export async function resolveForecast(writer: SupabaseClient, actorId: string, id: string): Promise<dal.DbResult<{ result: string }>> {
  const outcome = await dal.getOutcomeDal(writer, id);
  if (!outcome) return { ok: false, error: 'Record an outcome before resolving.', code: 'DB_ERROR' };
  return evaluateForecast(writer, actorId, id);
}

export async function expireForecast(writer: SupabaseClient, actorId: string, id: string): Promise<dal.DbResult<{ id: string }>> {
  const fc = await dal.getForecastDal(writer, id);
  if (!fc) return { ok: false, error: 'Forecast not found.', code: 'DB_ERROR' };
  await dal.insertEvaluation(writer, id, { result: 'expired', score: null, rationale: 'Resolution date passed without a recorded outcome.' }, actorId);
  await dal.upsertScore(writer, id, { brierScore: null, accuracy: null, confidence: fc.confidence, error: null, result: 'expired' });
  await dal.setStatus(writer, id, 'expired');
  await emitAlert(writer, id, 'FORECAST_EXPIRED', 'NOTICE', `Forecast expired: ${fc.title}.`, {}, actorId);
  await recomputeCalibration(writer, actorId);
  return { ok: true, data: { id } };
}

/** Recompute the global calibration curve + a performance snapshot; alert on drops. */
export async function recomputeCalibration(writer: SupabaseClient, actorId: string | null): Promise<void> {
  const records = await dal.readEvalRecords(writer);
  const buckets = buildCalibrationCurve(records);
  await dal.replaceCalibration(writer, buckets);
  const perf = performanceMetrics(records);
  const prevSnaps = await dal.getSnapshotsDal(writer, 2);
  const prev = prevSnaps.length ? prevSnaps[prevSnaps.length - 1] : null;
  await dal.insertSnapshot(writer, { active: records.filter((r) => r.status === 'active').length, resolved: perf.resolved, expired: perf.expired, accuracy: perf.accuracy, calibrationScore: perf.calibrationScore, volume: perf.volume });
  if (prev) {
    if (perf.calibrationScore < prev.calibrationScore - 15) await emitAlert(writer, null, 'FORECAST_CALIBRATION_DROP', 'WARNING', `Calibration dropped ${prev.calibrationScore}→${perf.calibrationScore}.`, { from: prev.calibrationScore, to: perf.calibrationScore }, actorId);
    else if (Math.abs(perf.accuracy - prev.accuracy) >= 20) await emitAlert(writer, null, 'FORECAST_PERFORMANCE_CHANGE', 'NOTICE', `Accuracy changed ${prev.accuracy}%→${perf.accuracy}%.`, { from: prev.accuracy, to: perf.accuracy }, actorId);
  }
}

export interface ValidationSummary { due: number; evaluated: number; flagged: number }

/** Agent entry point: evaluate due forecasts with outcomes, flag the rest. */
export async function validateDueForecasts(writer: SupabaseClient, nowIso: string, actorId: string | null): Promise<ValidationSummary> {
  const due = await dal.dueForecastsDal(writer, nowIso);
  let evaluated = 0; let flagged = 0;
  for (const fc of due) {
    const outcome = await dal.getOutcomeDal(writer, fc.id);
    if (outcome) { const r = await evaluateForecast(writer, actorId, fc.id); if (r.ok) evaluated += 1; }
    else { await emitAlert(writer, fc.id, 'FORECAST_DUE', 'NOTICE', `Forecast due (no outcome recorded): ${fc.title}.`, { resolutionDate: fc.resolutionDate }, actorId); flagged += 1; }
  }
  if (due.length === 0) await recomputeCalibration(writer, actorId);
  return { due: due.length, evaluated, flagged };
}
