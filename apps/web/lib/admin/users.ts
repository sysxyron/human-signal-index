// =============================================================================
// HSI Phase 24B — IAM users DAL. SERVER-ONLY. Admin-only.
//
// The user management console: list users (status/role/team/last-login), invite
// users (auth.admin.inviteUserByEmail, service-role, server-only), and run the
// approval lifecycle (pending → active → suspended → disabled). Every change is
// audited to security_audit_events. Role writes go to public.user_roles.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  adminFail, getServiceClient, notConfigured, recordSecurityAudit, requireAdmin,
  serviceRequired, supabaseConfigured, type DbResult,
} from './guard';
import { roleIdByName } from './roles';
import { highestRole } from '@/lib/auth/get-session-role';
import { appHref } from '@/lib/env/app-url';
import type { AdminUsersData, AdminUserRow, InviteStats, UserStatus } from '@hsi/shared-types';

type JsonRecord = Record<string, unknown>;
async function rows(db: SupabaseClient, table: string, build: (q: ReturnType<SupabaseClient['from']>) => unknown): Promise<JsonRecord[]> {
  try {
    const { data, error } = (await build(db.from(table))) as { data: JsonRecord[] | null; error: unknown };
    if (error) return [];
    return data ?? [];
  } catch {
    return [];
  }
}

const STATUS_VALUES: UserStatus[] = ['pending', 'active', 'suspended', 'disabled'];

/** Allowed status transitions (approval workflow). */
const TRANSITIONS: Record<UserStatus, UserStatus[]> = {
  pending: ['active', 'disabled'],
  active: ['suspended', 'disabled'],
  suspended: ['active', 'disabled'],
  disabled: ['active'],
};

/** Last-login map (auth.users.last_sign_in_at) via the service client, if present. */
async function lastLoginMap(): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  const svc = await getServiceClient();
  if (!svc) return map;
  try {
    const { data } = await svc.auth.admin.listUsers({ perPage: 1000 });
    for (const u of data?.users ?? []) map.set(u.id, (u.last_sign_in_at as string | undefined) ?? null);
  } catch {
    // best-effort.
  }
  return map;
}

/** Build the user-management console data. Admin-only. */
export async function listUsers(): Promise<DbResult<AdminUsersData>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    if (!supabaseConfigured()) return notConfigured();
    const { db } = gate.ctx;

    const [users, userRoles, roleRows, teams, teamMembers, logins] = await Promise.all([
      rows(db, 'users', (q) => q.select('id, email, name, status, created_at').order('created_at', { ascending: false }).limit(2000)),
      rows(db, 'user_roles', (q) => q.select('user_id, roles(name)').limit(10000)),
      rows(db, 'roles', (q) => q.select('name').limit(50)),
      rows(db, 'teams', (q) => q.select('id, key, name').limit(50)),
      rows(db, 'team_members', (q) => q.select('team_id, user_id, team_role').limit(10000)),
      lastLoginMap(),
    ]);

    const rolesByUser = new Map<string, string[]>();
    for (const ur of userRoles) {
      const uid = String(ur.user_id ?? '');
      const rel = ur.roles as { name?: unknown } | { name?: unknown }[] | null;
      const name = Array.isArray(rel) ? (rel[0] as { name?: unknown })?.name : rel?.name;
      if (uid && typeof name === 'string') rolesByUser.set(uid, [...(rolesByUser.get(uid) ?? []), name.toLowerCase()]);
    }
    const teamNameById = new Map<string, string>();
    for (const t of teams) teamNameById.set(String(t.id ?? ''), String(t.name ?? t.key ?? ''));
    const teamByUser = new Map<string, string>();
    for (const m of teamMembers) {
      const uid = String(m.user_id ?? '');
      if (uid && !teamByUser.has(uid)) teamByUser.set(uid, teamNameById.get(String(m.team_id ?? '')) ?? '');
    }

    const list: AdminUserRow[] = users.map((u) => {
      const id = String(u.id ?? '');
      const r = rolesByUser.get(id) ?? [];
      return {
        id, email: String(u.email ?? ''), name: u.name ? String(u.name) : null,
        status: (STATUS_VALUES.includes(String(u.status) as UserStatus) ? String(u.status) : 'active') as UserStatus,
        role: highestRole(r), roles: r, team: teamByUser.get(id) ?? null,
        createdAt: String(u.created_at ?? ''), lastLoginAt: logins.get(id) ?? null,
      };
    });

    const counts = { total: list.length, active: 0, pending: 0, suspended: 0, disabled: 0 };
    for (const u of list) counts[u.status] += 1;

    return {
      ok: true,
      data: {
        users: list,
        roleOptions: (roleRows.map((r) => String(r.name ?? '')).filter(Boolean)),
        teamOptions: teams.map((t) => ({ key: String(t.key ?? ''), name: String(t.name ?? t.key ?? '') })),
        counts,
      },
    };
  } catch (e) {
    return adminFail(e);
  }
}

/** Invite-statistics for the Launch Center (admin-only, read). */
export async function getInviteStats(): Promise<DbResult<InviteStats>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    if (!supabaseConfigured()) return notConfigured();
    const users = await rows(gate.ctx.db, 'users', (q) => q.select('status').limit(5000));
    const by = (s: string) => users.filter((u) => String(u.status) === s).length;
    return { ok: true, data: { totalTesters: users.length, activeTesters: by('active'), pendingInvitations: by('pending'), suspendedUsers: by('suspended') } };
  } catch (e) {
    return adminFail(e);
  }
}

/** Set a user's status, enforcing the approval transitions. Admin-only. Audited. */
export async function setUserStatus(userId: string, to: UserStatus): Promise<DbResult<{ userId: string; status: UserStatus }>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    if (!supabaseConfigured()) return notConfigured();
    if (!STATUS_VALUES.includes(to)) return { ok: false, error: `Invalid status '${to}'.`, code: 'DB_ERROR' };
    const { db } = gate.ctx;
    const { data: cur } = await db.from('users').select('status').eq('id', userId).maybeSingle();
    const from = ((cur as { status?: string } | null)?.status ?? 'active') as UserStatus;
    if (from === to) return { ok: false, error: `User is already ${to}.`, code: 'DB_ERROR' };
    if (!TRANSITIONS[from]?.includes(to)) return { ok: false, error: `Transition ${from} → ${to} is not allowed.`, code: 'DB_ERROR' };
    const { error } = await db.from('users').update({ status: to }).eq('id', userId);
    if (error) return adminFail(error);
    const eventType = to === 'active' && from === 'pending' ? 'USER_APPROVED' : to === 'active' ? 'USER_REACTIVATED' : to === 'suspended' ? 'USER_SUSPENDED' : 'USER_DISABLED';
    await recordSecurityAudit(db, { actorId: gate.ctx.user.id, eventType, message: `Status ${from} → ${to}`, metadata: { userId, from, to }, severity: to === 'disabled' ? 'warning' : 'info' });
    return { ok: true, data: { userId, status: to } };
  } catch (e) {
    return adminFail(e);
  }
}

/**
 * Invite a user by email (auth.admin.inviteUserByEmail, service-role, server-only),
 * mark them pending, assign the chosen role + team. Admin-only. Audited.
 */
export async function inviteUser(input: { email: string; role: string; team?: string; message?: string }): Promise<DbResult<{ userId: string; email: string }>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    const email = input.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'A valid email address is required.', code: 'DB_ERROR' };
    const svc = await getServiceClient();
    if (!svc) return serviceRequired();
    const { db } = gate.ctx;

    // Land the invitee on the app's auth callback (handles the invite hash flow).
    const redirectTo = appHref('/auth/callback');
    const { data, error } = await svc.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { invited_by: gate.ctx.user.email, invited_role: input.role, ...(input.message ? { invite_message: input.message } : {}) },
    });
    if (error || !data?.user?.id) return adminFail(error ?? new Error('Invitation returned no user.'));
    const userId = data.user.id;

    // The 0006 trigger has mirrored the auth user into public.users + granted
    // 'viewer'. Mark pending and set the chosen role/team (service role bypasses
    // RLS; this is server-only after the admin gate).
    await svc.from('users').update({ status: 'pending' }).eq('id', userId);

    const roleId = await roleIdByName(svc, input.role);
    if (roleId) {
      await svc.from('user_roles').delete().eq('user_id', userId);
      await svc.from('user_roles').insert({ user_id: userId, role_id: roleId });
    }
    if (input.team) {
      const { data: t } = await svc.from('teams').select('id').eq('key', input.team).maybeSingle();
      const teamId = (t as { id?: string } | null)?.id;
      if (teamId) await svc.from('team_members').insert({ team_id: teamId, user_id: userId, team_role: 'member' });
    }

    await recordSecurityAudit(db, { actorId: gate.ctx.user.id, eventType: 'USER_INVITED', message: `Invited ${email}`, metadata: { userId, email, role: input.role, team: input.team ?? null } });
    await recordSecurityAudit(db, { actorId: gate.ctx.user.id, eventType: 'ROLE_ASSIGNED', message: `Assigned role '${input.role}' on invite`, metadata: { userId, role: input.role } });
    if (input.team) await recordSecurityAudit(db, { actorId: gate.ctx.user.id, eventType: 'TEAM_ASSIGNED', message: `Assigned team '${input.team}' on invite`, metadata: { userId, team: input.team } });

    return { ok: true, data: { userId, email } };
  } catch (e) {
    return adminFail(e);
  }
}

/** Read the signed-in user's own account status (for the onboarding banner). */
export async function getMyStatus(): Promise<DbResult<{ status: UserStatus }>> {
  try {
    const user = await getUserSafe();
    if (!user) return { ok: false, error: 'Not signed in.', code: 'AUTH_REQUIRED' };
    if (!supabaseConfigured()) return notConfigured();
    const { createClient } = await import('@/lib/supabase/server');
    const db = createClient();
    const { data } = await db.from('users').select('status').eq('id', user.id).maybeSingle();
    const status = ((data as { status?: string } | null)?.status ?? 'active') as UserStatus;
    return { ok: true, data: { status } };
  } catch (e) {
    return adminFail(e);
  }
}

async function getUserSafe() {
  try {
    const { getUser } = await import('@/lib/supabase/server');
    return await getUser();
  } catch {
    return null;
  }
}
