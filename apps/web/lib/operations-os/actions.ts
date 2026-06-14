'use server';

// =============================================================================
// HSI Phase 24 — Human Operations server actions. 'use server'. Thin wrappers
// over the DAL. Return DbResult; revalidate the operations dashboards; NEVER
// throw. Reads researcher+, writes reviewer+. No autonomous actions.
// =============================================================================

import { revalidatePath } from 'next/cache';
import {
  assignCaseDal,
  escalateCaseDal,
  getExecutiveOperations,
  getOperationsAlerts,
  getOperationsCenter,
  getOperationsHighlights,
  getTeams,
  getWorkloads,
  resolveAlertDal,
  transitionCaseDal,
  type DbResult,
} from './persistence';
import type { EscalationLevel, LifecycleState } from '@hsi/operations-engine';

const PATHS = ['/dashboard/operations-center', '/dashboard/workloads', '/dashboard/operations-alerts', '/dashboard/executive-operations', '/dashboard/teams', '/dashboard/my-work'];
function revalidate(): void {
  for (const p of PATHS) { try { revalidatePath(p); } catch { /* best-effort */ } }
}

// ---- reads ------------------------------------------------------------------
export async function getOperationsCenterAction() { return getOperationsCenter(); }
export async function getWorkloadsAction() { return getWorkloads(); }
export async function getOperationsAlertsAction() { return getOperationsAlerts(); }
export async function getTeamsAction() { return getTeams(); }
export async function getExecutiveOperationsAction() { return getExecutiveOperations(); }
export async function getOperationsHighlightsAction() { return getOperationsHighlights(); }

// ---- writes (reviewer+; validated + audited) --------------------------------
export async function assignCaseAction(input: { caseId: string; role: string; assignee: string; reason: string; notes?: string }): Promise<DbResult<{ assignmentId: string }>> {
  const r = await assignCaseDal(input, new Date().toISOString());
  if (r.ok) revalidate();
  return r;
}
export async function escalateCaseAction(input: { caseId: string; from: EscalationLevel | null; to: EscalationLevel; reason: string }): Promise<DbResult<{ level: EscalationLevel }>> {
  const r = await escalateCaseDal(input, new Date().toISOString());
  if (r.ok) revalidate();
  return r;
}
export async function transitionCaseAction(input: { caseId: string; from: LifecycleState; to: LifecycleState; reason: string }): Promise<DbResult<{ state: LifecycleState }>> {
  const r = await transitionCaseDal(input, new Date().toISOString());
  if (r.ok) revalidate();
  return r;
}
export async function resolveAlertAction(alertId: string): Promise<DbResult<{ id: string }>> {
  const r = await resolveAlertDal(alertId, new Date().toISOString());
  if (r.ok) revalidate();
  return r;
}

export type { DbResult, DbResultCode } from './persistence';
