'use server';

// =============================================================================
// HSI Phase 60 — Beta Launch server actions. THIN wrappers over the DAL. Admin
// writes are gated by requireAdmin (reusing the IAM guard) and audited; feedback
// submission is allowed for any signed-in user (own row, RLS-enforced). Actions
// return DbResult and NEVER throw. SERVER-ONLY.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { requireAdmin, recordSecurityAudit } from '@/lib/admin/guard';
import { getUser, createClient } from '@/lib/supabase/server';
import * as dal from './persistence';
import type { DbResult } from './persistence';

const ROUTE = '/dashboard/beta-launch';
function rev(): void {
  try { revalidatePath(ROUTE); } catch { /* best-effort */ }
}

export async function createCohortAction(input: { name: string; code?: string; description?: string }): Promise<DbResult<{ id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  if (!input.name?.trim()) return { ok: false, error: 'Cohort name is required.', code: 'DB_ERROR' };
  const r = await dal.createCohortDal(gate.ctx.db, input, gate.ctx.user.id);
  if (r.ok) { await recordSecurityAudit(gate.ctx.db, { actorId: gate.ctx.user.id, eventType: 'BETA_COHORT_CREATED', message: `Beta cohort created: ${input.name}` }); rev(); }
  return r;
}

export async function archiveCohortAction(id: string): Promise<DbResult<{ id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const r = await dal.archiveCohortDal(gate.ctx.db, id);
  if (r.ok) { await recordSecurityAudit(gate.ctx.db, { actorId: gate.ctx.user.id, eventType: 'BETA_COHORT_ARCHIVED', message: `Beta cohort archived: ${id}` }); rev(); }
  return r;
}

export async function assignUserToCohortAction(input: { cohortId: string; userId: string }): Promise<DbResult<{ ok: true }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const r = await dal.assignUserToCohortDal(gate.ctx.db, input, gate.ctx.user.id);
  if (r.ok) { await recordSecurityAudit(gate.ctx.db, { actorId: gate.ctx.user.id, eventType: 'BETA_COHORT_ASSIGN', message: `User ${input.userId} → cohort ${input.cohortId}` }); rev(); }
  return r;
}

export async function sendInviteAction(input: { email: string; role?: string; cohortId?: string }): Promise<DbResult<{ id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  if (!input.email?.includes('@')) return { ok: false, error: 'A valid email is required.', code: 'DB_ERROR' };
  const r = await dal.sendInviteDal(gate.ctx.db, input, gate.ctx.user.id);
  if (r.ok) { await recordSecurityAudit(gate.ctx.db, { actorId: gate.ctx.user.id, eventType: 'BETA_INVITE_SENT', message: `Beta invite tracked: ${input.email}` }); rev(); }
  return r;
}

export async function resendInviteAction(id: string): Promise<DbResult<{ id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const r = await dal.resendInviteDal(gate.ctx.db, id, gate.ctx.user.id);
  if (r.ok) rev();
  return r;
}

export async function revokeInviteAction(id: string): Promise<DbResult<{ id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const r = await dal.revokeInviteDal(gate.ctx.db, id, gate.ctx.user.id);
  if (r.ok) { await recordSecurityAudit(gate.ctx.db, { actorId: gate.ctx.user.id, eventType: 'BETA_INVITE_REVOKED', message: `Beta invite revoked: ${id}` }); rev(); }
  return r;
}

export async function setFeedbackStatusAction(id: string, status: string): Promise<DbResult<{ id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const r = await dal.setFeedbackStatusDal(gate.ctx.db, id, status);
  if (r.ok) rev();
  return r;
}

/** Feedback submission — any signed-in user (RLS owner-insert). Not admin-gated. */
export async function submitBetaFeedbackAction(input: { category: string; title: string; body?: string }): Promise<DbResult<{ id: string }>> {
  const user = await getUser();
  if (!user) return { ok: false, error: 'Sign in to submit feedback.', code: 'AUTH_REQUIRED' };
  if (!input.title?.trim()) return { ok: false, error: 'A short title is required.', code: 'DB_ERROR' };
  const db = createClient();
  const r = await dal.submitFeedbackDal(db, input, user.id);
  if (r.ok) rev();
  return r;
}
