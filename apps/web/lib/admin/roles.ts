// =============================================================================
// HSI Phase 24B — IAM roles DAL. SERVER-ONLY. Admin-only.
//
// Role assignment writes public.user_roles (NEVER the JWT, NEVER user_metadata).
// The DB RLS helpers + middleware continue to read user_roles → roles, so app and
// DB stay in agreement (Phase 22A).
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { adminFail, recordSecurityAudit, requireAdmin, supabaseConfigured, notConfigured, type DbResult } from './guard';

const KNOWN_ROLES = ['viewer', 'researcher', 'reviewer', 'curator', 'admin'];

/** List assignable role names (from public.roles, falling back to the ladder). */
export async function listRoles(): Promise<DbResult<string[]>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    if (!supabaseConfigured()) return notConfigured();
    const { data } = await gate.ctx.db.from('roles').select('name').limit(50);
    const names = (data ?? []).map((r) => String((r as { name?: unknown }).name ?? '')).filter(Boolean);
    return { ok: true, data: names.length > 0 ? names : KNOWN_ROLES };
  } catch (e) {
    return adminFail(e);
  }
}

/** Resolve a role name to its id (server-side helper for other DAL files). */
export async function roleIdByName(db: SupabaseClient, name: string): Promise<string | null> {
  const { data } = await db.from('roles').select('id').eq('name', name).maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

/**
 * Assign a single role to a user (replaces any existing roles). Writes
 * public.user_roles. Admin-only. Audited ROLE_ASSIGNED.
 */
export async function assignRole(userId: string, roleName: string): Promise<DbResult<{ userId: string; role: string }>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    if (!supabaseConfigured()) return notConfigured();
    if (!KNOWN_ROLES.includes(roleName)) return { ok: false, error: `Unknown role '${roleName}'.`, code: 'DB_ERROR' };
    const { db } = gate.ctx;
    const roleId = await roleIdByName(db, roleName);
    if (!roleId) return { ok: false, error: `Role '${roleName}' is not seeded in public.roles.`, code: 'DB_ERROR' };
    // Replace: clear existing assignments, then set the chosen role.
    const del = await db.from('user_roles').delete().eq('user_id', userId);
    if (del.error) return adminFail(del.error);
    const ins = await db.from('user_roles').insert({ user_id: userId, role_id: roleId });
    if (ins.error) return adminFail(ins.error);
    await recordSecurityAudit(db, { actorId: gate.ctx.user.id, eventType: 'ROLE_ASSIGNED', message: `Assigned role '${roleName}'`, metadata: { userId, role: roleName } });
    return { ok: true, data: { userId, role: roleName } };
  } catch (e) {
    return adminFail(e);
  }
}
