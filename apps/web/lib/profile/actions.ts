'use server';

// =============================================================================
// HSI Phase 24D — profile server action. Returns the signed-in user's own
// identity + role + status + team (read-only). Any signed-in user may read their
// own profile (RLS: users_self_read, user_roles_self_read). No writes; no service
// role; never changes RBAC.
// =============================================================================

import { createClient, getUser } from '@/lib/supabase/server';
import { loadHighestRole } from '@/lib/auth/get-session-role';

export interface MyProfile {
  userId: string | null;
  email: string | null;
  role: string | null;
  status: string;
  team: string | null;
}

export async function getMyProfileAction(): Promise<{ ok: true; data: MyProfile } | { ok: false; code: 'AUTH_REQUIRED' | 'NOT_CONFIGURED' | 'DB_ERROR' }> {
  try {
    const user = await getUser();
    if (!user) return { ok: false, code: 'AUTH_REQUIRED' };
    const db = createClient();

    const role = await loadHighestRole(db, user.id);

    let status = 'active';
    try {
      const { data } = await db.from('users').select('status').eq('id', user.id).maybeSingle();
      if (data && typeof (data as { status?: unknown }).status === 'string') status = (data as { status: string }).status;
    } catch { /* default active */ }

    let team: string | null = null;
    try {
      const { data } = await db.from('team_members').select('teams(name)').eq('user_id', user.id).limit(1);
      const rel = Array.isArray(data) && data[0] ? (data[0] as { teams?: unknown }).teams : null;
      const name = Array.isArray(rel) ? (rel[0] as { name?: unknown })?.name : (rel as { name?: unknown } | null)?.name;
      if (typeof name === 'string') team = name;
    } catch { /* team is best-effort (RLS may hide it from viewers) */ }

    return { ok: true, data: { userId: user.id, email: user.email ?? null, role, status, team } };
  } catch {
    return { ok: false, code: 'DB_ERROR' };
  }
}
