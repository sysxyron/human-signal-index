'use server';

// =============================================================================
// HSI Phase 25 — role APPLICATION workflow (Deliverables 2 & 3). The governed
// path from viewer to a trusted role.
//
// GOVERNANCE: a user may APPLY (insert own pending row) and WITHDRAW; they can
// NEVER self-approve or self-assign a role (RLS forbids it; requested_role
// excludes admin). Admins review and, on approval, assign a role ONLY via the
// existing IAM (assignRole) + optionally a team — every action is audited. The
// admin role is never assignable here.
// =============================================================================

import type { RoleApplicationRow } from '@hsi/shared-types';
import { createClient, getUser } from '@/lib/supabase/server';
import { requireAdmin, recordSecurityAudit, supabaseConfigured, notConfigured, adminFail, type DbResult } from '@/lib/admin/guard';
import { assignRole } from '@/lib/admin/roles';
import { addTeamMember } from '@/lib/admin/teams';
import { ensureCurrentAppUser, ACCOUNT_NOT_READY_MESSAGE } from '@/lib/auth/ensure-app-user';
import { toUserMessage } from '@/lib/errors/domain-error';
import { logError } from '@/lib/errors/format-error';
import { purposeOption, buildRoleApplicationInsert, type ContribResult } from './options';

const ASSIGNABLE_ROLES = new Set(['contributor', 'researcher', 'reviewer', 'curator']);

function mapRow(r: Record<string, unknown>): RoleApplicationRow {
  return {
    id: String(r.id), userId: String(r.user_id), requestedPath: String(r.requested_path),
    requestedRole: (r.requested_role as string) ?? null,
    experienceSummary: (r.experience_summary as string) ?? null, reason: (r.reason as string) ?? null,
    organization: (r.organization as string) ?? null, status: r.status as RoleApplicationRow['status'],
    reviewedBy: (r.reviewed_by as string) ?? null, reviewedAt: (r.reviewed_at as string) ?? null,
    reviewNotes: (r.review_notes as string) ?? null,
    createdAt: String(r.created_at), updatedAt: (r.updated_at as string) ?? null,
  };
}

/** Any signed-in user applies for a path. Always created as pending (RLS-enforced). */
export async function applyForRoleAction(input: {
  path: string; experienceSummary?: string; reason?: string; organization?: string;
}): Promise<ContribResult<{ id: string }>> {
  if (!supabaseConfigured()) return { ok: false, code: 'NOT_CONFIGURED' };
  try {
    const user = await getUser();
    if (!user) return { ok: false, code: 'AUTH_REQUIRED' };
    const opt = purposeOption(input.path);
    if (!opt) return { ok: false, code: 'DB_ERROR', error: 'Unknown purpose path.' };

    // Identity sync: guarantee a public.users row (FK target) before insert.
    const appUser = await ensureCurrentAppUser();
    if (!appUser.ok || !appUser.id) return { ok: false, code: 'DB_ERROR', error: ACCOUNT_NOT_READY_MESSAGE };

    const db = createClient();
    const { data, error } = await db.from('role_applications')
      .insert(buildRoleApplicationInsert(appUser.id, opt, input))
      .select('id').single();
    if (error) {
      logError('contributor/applyForRole', error); // full detail server-side only
      // Centralised, non-leaking domain message (identity FK → account-not-ready,
      // unique → duplicate). Raw SQL/constraint text is never returned.
      return { ok: false, code: 'DB_ERROR', error: toUserMessage(error, { duplicate: 'You have already applied for this path.' }) };
    }
    return { ok: true, data: { id: String((data as { id: string }).id) } };
  } catch {
    return { ok: false, code: 'DB_ERROR' };
  }
}

/** A user withdraws their own pending application. */
export async function withdrawApplicationAction(id: string): Promise<ContribResult<{ id: string }>> {
  if (!supabaseConfigured()) return { ok: false, code: 'NOT_CONFIGURED' };
  try {
    const user = await getUser();
    if (!user) return { ok: false, code: 'AUTH_REQUIRED' };
    const db = createClient();
    const { error } = await db.from('role_applications').update({ status: 'withdrawn' }).eq('id', id).eq('user_id', user.id);
    if (error) return { ok: false, code: 'DB_ERROR', error: error.message };
    return { ok: true, data: { id } };
  } catch {
    return { ok: false, code: 'DB_ERROR' };
  }
}

/** The signed-in user's own applications. */
export async function listMyApplicationsAction(): Promise<ContribResult<RoleApplicationRow[]>> {
  if (!supabaseConfigured()) return { ok: false, code: 'NOT_CONFIGURED' };
  try {
    const user = await getUser();
    if (!user) return { ok: false, code: 'AUTH_REQUIRED' };
    const db = createClient();
    const { data, error } = await db.from('role_applications').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    if (error) return { ok: false, code: 'DB_ERROR', error: error.message };
    return { ok: true, data: (data ?? []).map((r) => mapRow(r as Record<string, unknown>)) };
  } catch {
    return { ok: false, code: 'DB_ERROR' };
  }
}

export interface AdminApplicationRow extends RoleApplicationRow { email: string | null }

/** ADMIN: list applications (optionally filtered by status), with applicant email. */
export async function listApplicationsAction(status?: string): Promise<DbResult<AdminApplicationRow[]>> {
  if (!supabaseConfigured()) return notConfigured();
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  try {
    // role_applications has TWO FKs to users (user_id + reviewed_by), so the embed
    // must name the relationship explicitly (the applicant), else PostgREST throws
    // PGRST201. The embedded resource still arrives under the `users` key.
    let q = gate.ctx.db
      .from('role_applications')
      .select('*, users!role_applications_user_id_fkey(email)')
      .order('created_at', { ascending: false });
    if (status && status !== 'all') q = q.eq('status', status);
    const { data, error } = await q;
    if (error) return adminFail(error);
    const rows = (data ?? []).map((r) => {
      const rec = r as Record<string, unknown>;
      const rel = rec.users as { email?: string } | { email?: string }[] | null;
      const email = Array.isArray(rel) ? rel[0]?.email ?? null : rel?.email ?? null;
      return { ...mapRow(rec), email };
    });
    return { ok: true, data: rows };
  } catch (e) {
    return adminFail(e);
  }
}

export type ApplicationDecision = 'approved' | 'rejected' | 'needs_more_info';

/**
 * ADMIN: review an application. On 'approved' with an assignRole, performs the
 * REAL role assignment via IAM (never admin) and optional team add. Audited.
 */
export async function reviewApplicationAction(input: {
  id: string;
  decision: ApplicationDecision;
  notes?: string;
  assignRole?: string;
  assignTeamId?: string;
}): Promise<DbResult<{ id: string; status: ApplicationDecision; assignedRole?: string }>> {
  if (!supabaseConfigured()) return notConfigured();
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const { db, user } = gate.ctx;
  try {
    // Load the application to find the applicant.
    const { data: app, error: loadErr } = await db.from('role_applications').select('id, user_id, requested_role').eq('id', input.id).single();
    if (loadErr || !app) return adminFail(loadErr ?? new Error('Application not found.'));
    const applicantId = String((app as { user_id: string }).user_id);

    let assignedRole: string | undefined;
    if (input.decision === 'approved' && input.assignRole) {
      const role = input.assignRole;
      if (role === 'admin' || !ASSIGNABLE_ROLES.has(role)) {
        return { ok: false, error: 'Only contributor/researcher/reviewer/curator may be assigned from an application.', code: 'FORBIDDEN' };
      }
      // 'contributor' is a viewer-path RANK, not an RBAC role — keep DB role at viewer.
      if (role !== 'contributor') {
        const res = await assignRole(applicantId, role);
        if (!res.ok) return res;
        assignedRole = role;
      } else {
        assignedRole = 'contributor (rank)';
      }
      if (input.assignTeamId) {
        const t = await addTeamMember(input.assignTeamId, applicantId);
        if (!t.ok) return t;
      }
    }

    const { error: updErr } = await db.from('role_applications').update({
      status: input.decision,
      review_notes: input.notes ?? null,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    }).eq('id', input.id);
    if (updErr) return adminFail(updErr);

    await recordSecurityAudit(db, {
      actorId: user.id,
      eventType: 'role_application_review',
      severity: input.decision === 'approved' ? 'warning' : 'info',
      message: `Application ${input.id} ${input.decision}${assignedRole ? ` → ${assignedRole}` : ''}`,
      metadata: { applicationId: input.id, applicantId, decision: input.decision, assignedRole: assignedRole ?? null },
    });

    return { ok: true, data: { id: input.id, status: input.decision, assignedRole } };
  } catch (e) {
    return adminFail(e);
  }
}
