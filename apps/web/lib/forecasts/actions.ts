'use server';

// =============================================================================
// HSI Phase 67 — Forecast server actions. Admin mutations (create / record
// outcome / resolve / expire / recompute) reuse the IAM guard for audit; the
// RBAC-enforcing service does the work. Return DbResult; never throw. SERVER-ONLY.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { requireAdmin, recordSecurityAudit } from '@/lib/admin/guard';
import * as svc from './service';
import type { DbResult, CreateForecastInput } from './persistence';

const ROUTE = '/dashboard/forecast-validation';
function rev(): void { try { revalidatePath(ROUTE); } catch { /* best-effort */ } }

export async function createForecastAction(input: CreateForecastInput): Promise<DbResult<{ id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const r = await svc.createForecast(input);
  if (r.ok) { await recordSecurityAudit(gate.ctx.db, { actorId: gate.ctx.user.id, eventType: 'FORECAST_CREATED', message: `Forecast created: ${input.title}.`, metadata: { id: r.data.id, type: input.predictionType } }); rev(); }
  return r;
}

export async function recordOutcomeAction(id: string, input: { actualValue: Record<string, unknown>; outcomeLabel?: string; note?: string }): Promise<DbResult<{ id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const r = await svc.recordOutcome(id, input);
  if (r.ok) { await recordSecurityAudit(gate.ctx.db, { actorId: gate.ctx.user.id, eventType: 'FORECAST_OUTCOME_RECORDED', message: `Outcome recorded for forecast ${id}.`, metadata: { id } }); rev(); }
  return r;
}

export async function resolveForecastAction(id: string): Promise<DbResult<{ result: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const r = await svc.resolveForecast(id);
  if (r.ok) { await recordSecurityAudit(gate.ctx.db, { actorId: gate.ctx.user.id, eventType: 'FORECAST_RESOLVED', message: `Forecast ${id} resolved: ${r.data.result}.`, metadata: { id, result: r.data.result } }); rev(); }
  return r;
}

export async function expireForecastAction(id: string): Promise<DbResult<{ id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const r = await svc.expireForecast(id);
  if (r.ok) rev();
  return r;
}

export async function recomputeCalibrationAction(): Promise<DbResult<{ ok: true }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const r = await svc.recomputeCalibration();
  if (r.ok) rev();
  return r;
}
