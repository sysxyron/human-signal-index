// =============================================================================
// HSI Phase 67 — Forecast service API (SERVER-ONLY). RBAC: reviewer+ reads, admin
// mutations. Writes prefer the service-role client (admin alert fan-out). Forecasts
// are immutable once created (only outcome/status transitions). RLS is the real
// boundary. Never throws.
// =============================================================================

import { createClient, getUser } from '@/lib/supabase/server';
import { loadHighestRole } from '@/lib/auth/get-session-role';
import { hasRole } from '@/lib/security/rbac-audit';
import { getServiceClient } from '@/lib/admin/guard';
import * as dal from './persistence';
import type { DbResult, CreateForecastInput } from './persistence';
import * as engine from './engine';
import type {
  Forecast, ForecastPrediction, ForecastOutcome, ForecastEvaluation, ForecastScore,
  CalibrationBucket, ForecastStatus,
} from './types';

async function ctx() {
  const user = await getUser();
  if (!user) return { ok: false as const, error: 'Sign in to use forecasts.', code: 'AUTH_REQUIRED' as const };
  const db = createClient();
  const role = await loadHighestRole(db, user.id).catch(() => null);
  return { ok: true as const, userId: user.id, db, isReviewer: hasRole(role ?? undefined, 'reviewer'), isAdmin: hasRole(role ?? undefined, 'admin') };
}
async function reviewerCtx() {
  const c = await ctx();
  if (!c.ok) return c;
  if (!c.isReviewer) return { ok: false as const, error: 'Forecasts are restricted to reviewers and admins.', code: 'FORBIDDEN' as const };
  return c;
}
async function adminWriter() {
  const c = await ctx();
  if (!c.ok) return c;
  if (!c.isAdmin) return { ok: false as const, error: 'This action is admin-only.', code: 'FORBIDDEN' as const };
  return { ok: true as const, userId: c.userId, writer: (await getServiceClient()) ?? c.db };
}

// ---- mutations (admin) ------------------------------------------------------

export async function createForecast(input: CreateForecastInput): Promise<DbResult<{ id: string }>> {
  const a = await adminWriter();
  if (!a.ok) return a;
  return engine.createForecast(a.writer, a.userId, input);
}
export async function recordOutcome(id: string, input: { actualValue: Record<string, unknown>; outcomeLabel?: string; note?: string }): Promise<DbResult<{ id: string }>> {
  const a = await adminWriter();
  if (!a.ok) return a;
  return engine.recordOutcome(a.writer, a.userId, id, input);
}
export async function resolveForecast(id: string): Promise<DbResult<{ result: string }>> {
  const a = await adminWriter();
  if (!a.ok) return a;
  return engine.resolveForecast(a.writer, a.userId, id);
}
export async function expireForecast(id: string): Promise<DbResult<{ id: string }>> {
  const a = await adminWriter();
  if (!a.ok) return a;
  return engine.expireForecast(a.writer, a.userId, id);
}
export async function recomputeCalibration(): Promise<DbResult<{ ok: true }>> {
  const a = await adminWriter();
  if (!a.ok) return a;
  await engine.recomputeCalibration(a.writer, a.userId);
  return { ok: true, data: { ok: true } };
}

// ---- reads (reviewer+) ------------------------------------------------------

export async function getForecast(id: string): Promise<DbResult<Forecast>> {
  const c = await reviewerCtx();
  if (!c.ok) return c;
  const fc = await dal.getForecastDal(c.db, id);
  return fc ? { ok: true, data: fc } : { ok: false, error: 'Forecast not found.', code: 'DB_ERROR' };
}
export async function getForecasts(status?: ForecastStatus): Promise<DbResult<Forecast[]>> {
  const c = await reviewerCtx();
  if (!c.ok) return c;
  return { ok: true, data: await dal.listForecastsDal(c.db, status ? { status } : {}) };
}
export async function searchForecasts(q: string): Promise<DbResult<Forecast[]>> {
  const c = await reviewerCtx();
  if (!c.ok) return c;
  return { ok: true, data: await dal.searchForecastsDal(c.db, q) };
}
export async function getPrediction(id: string): Promise<DbResult<ForecastPrediction | null>> {
  const c = await reviewerCtx();
  if (!c.ok) return c;
  return { ok: true, data: await dal.getPredictionDal(c.db, id) };
}
export async function getOutcome(id: string): Promise<DbResult<ForecastOutcome | null>> {
  const c = await reviewerCtx();
  if (!c.ok) return c;
  return { ok: true, data: await dal.getOutcomeDal(c.db, id) };
}
/** Alias per the spec (Deliverable 5). */
export const getForecastOutcome = getOutcome;

export async function getEvaluations(id: string): Promise<DbResult<ForecastEvaluation[]>> {
  const c = await reviewerCtx();
  if (!c.ok) return c;
  return { ok: true, data: await dal.getEvaluationsDal(c.db, id) };
}
export async function getScore(id: string): Promise<DbResult<ForecastScore | null>> {
  const c = await reviewerCtx();
  if (!c.ok) return c;
  return { ok: true, data: await dal.getScoreDal(c.db, id) };
}
export async function getCalibration(): Promise<DbResult<CalibrationBucket[]>> {
  const c = await reviewerCtx();
  if (!c.ok) return c;
  return { ok: true, data: await dal.getCalibrationDal(c.db) };
}
export async function getAlerts(id: string): Promise<DbResult<dal.AlertRow[]>> {
  const c = await reviewerCtx();
  if (!c.ok) return c;
  return { ok: true, data: await dal.getAlertsDal(c.db, id, 30) };
}
