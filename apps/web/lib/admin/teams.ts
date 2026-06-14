// =============================================================================
// HSI Phase 24B — IAM teams DAL. SERVER-ONLY. Admin-only.
//
// Team membership management on the EXISTING public.team_members table (Phase 24,
// migration 0027) — add/remove members and assign a team lead. Schema unchanged.
// Every change is audited to security_audit_events.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { adminFail, notConfigured, recordSecurityAudit, requireAdmin, supabaseConfigured, type DbResult } from './guard';
import type { AdminTeamsData, AdminTeamRow } from '@hsi/shared-types';

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

/** List teams with members for the admin teams console. Admin-only. */
export async function listAdminTeams(): Promise<DbResult<AdminTeamsData>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    if (!supabaseConfigured()) return notConfigured();
    const { db } = gate.ctx;
    const [teams, members, users] = await Promise.all([
      rows(db, 'teams', (q) => q.select('id, key, name, description').limit(50)),
      rows(db, 'team_members', (q) => q.select('team_id, user_id, team_role').limit(10000)),
      rows(db, 'users', (q) => q.select('id, email, name').order('email', { ascending: true }).limit(2000)),
    ]);
    const userById = new Map<string, { email: string; name: string | null }>();
    for (const u of users) userById.set(String(u.id ?? ''), { email: String(u.email ?? ''), name: u.name ? String(u.name) : null });
    const membersByTeam = new Map<string, AdminTeamRow['members']>();
    for (const m of members) {
      const tid = String(m.team_id ?? '');
      const uid = String(m.user_id ?? '');
      const u = userById.get(uid);
      if (!tid || !u) continue;
      const arr = membersByTeam.get(tid) ?? [];
      arr.push({ userId: uid, email: u.email, name: u.name, teamRole: String(m.team_role) === 'lead' ? 'lead' : 'member' });
      membersByTeam.set(tid, arr);
    }
    const teamRows: AdminTeamRow[] = teams.map((t) => {
      const m = membersByTeam.get(String(t.id ?? '')) ?? [];
      return { id: String(t.id ?? ''), key: String(t.key ?? ''), name: String(t.name ?? ''), description: t.description ? String(t.description) : null, members: m, memberCount: m.length };
    });
    return { ok: true, data: { teams: teamRows, assignableUsers: users.map((u) => ({ id: String(u.id ?? ''), email: String(u.email ?? ''), name: u.name ? String(u.name) : null })) } };
  } catch (e) {
    return adminFail(e);
  }
}

export async function addTeamMember(teamId: string, userId: string): Promise<DbResult<{ teamId: string; userId: string }>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    if (!supabaseConfigured()) return notConfigured();
    const { db } = gate.ctx;
    const { error } = await db.from('team_members').insert({ team_id: teamId, user_id: userId, team_role: 'member' });
    if (error) return adminFail(error);
    await recordSecurityAudit(db, { actorId: gate.ctx.user.id, eventType: 'TEAM_ASSIGNED', message: 'Added team member', metadata: { teamId, userId } });
    return { ok: true, data: { teamId, userId } };
  } catch (e) {
    return adminFail(e);
  }
}

export async function removeTeamMember(teamId: string, userId: string): Promise<DbResult<{ teamId: string; userId: string }>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    if (!supabaseConfigured()) return notConfigured();
    const { db } = gate.ctx;
    const { error } = await db.from('team_members').delete().eq('team_id', teamId).eq('user_id', userId);
    if (error) return adminFail(error);
    await recordSecurityAudit(db, { actorId: gate.ctx.user.id, eventType: 'TEAM_REMOVED', message: 'Removed team member', metadata: { teamId, userId } });
    return { ok: true, data: { teamId, userId } };
  } catch (e) {
    return adminFail(e);
  }
}

export async function assignTeamLead(teamId: string, userId: string): Promise<DbResult<{ teamId: string; userId: string }>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    if (!supabaseConfigured()) return notConfigured();
    const { db } = gate.ctx;
    // Demote any current lead, promote the chosen member (insert if not present).
    await db.from('team_members').update({ team_role: 'member' }).eq('team_id', teamId).eq('team_role', 'lead');
    const { data: existing } = await db.from('team_members').select('id').eq('team_id', teamId).eq('user_id', userId).maybeSingle();
    if (existing) {
      await db.from('team_members').update({ team_role: 'lead' }).eq('team_id', teamId).eq('user_id', userId);
    } else {
      await db.from('team_members').insert({ team_id: teamId, user_id: userId, team_role: 'lead' });
    }
    await recordSecurityAudit(db, { actorId: gate.ctx.user.id, eventType: 'TEAM_ASSIGNED', message: 'Assigned team lead', metadata: { teamId, userId, role: 'lead' } });
    return { ok: true, data: { teamId, userId } };
  } catch (e) {
    return adminFail(e);
  }
}
