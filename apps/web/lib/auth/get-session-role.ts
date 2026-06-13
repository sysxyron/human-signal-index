// =============================================================================
// Canonical session-role resolver (Phase 22A — RBAC root-cause repair).
//
// THE SINGLE SOURCE OF TRUTH for "what role does this signed-in user have?".
//
// Identity comes from the JWT (auth.users via supabase.auth.getUser()); ROLE
// comes from the DATABASE chain the rest of the platform already trusts:
//
//     auth.users.id  ==  public.users.id  →  public.user_roles.user_id
//                                          →  public.roles.name
//
// This is the EXACT source the DB's SECURITY DEFINER helpers (current_app_role(),
// has_role(), is_admin(), …) read, so the app layer and RLS now agree.
//
// ROOT CAUSE this replaces: middleware + DALs previously did
//   `from('users').select('role')`  — but public.users HAS NO `role` COLUMN, so
//   PostgREST returned an error and the code fell back to 'viewer' for EVERY user,
//   denying admins their own routes.
//
// RLS-safe: a signed-in user may read their own `user_roles` (user_roles_self_read:
// user_id = auth.uid()) and the `roles` reference list (roles_auth_read), so the
// per-request RLS client used here (and in middleware) can resolve roles without
// the service-role key. JWT proves identity; the DB decides permissions.
//
// EDGE-SAFE: this module statically imports ONLY types + the PURE rbac ladder. The
// server client (next/headers) is pulled in via a dynamic import inside the no-arg
// getSessionRole() so middleware (edge runtime) can import the client-taking
// helpers without dragging next/headers into the edge bundle.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { ROLE_RANK, type AppRole } from '../security/rbac-audit';

export interface SessionRole {
  userId: string | null;
  email: string | null;
  /** Every role name assigned to the user (lower-cased), e.g. ['admin']. */
  roles: string[];
  /** The highest role on the ladder, or null when none/anonymous. */
  highestRole: AppRole | null;
}

const EMPTY: SessionRole = { userId: null, email: null, roles: [], highestRole: null };

/**
 * Read the role NAMES assigned to `userId` from public.user_roles → roles.
 * Returns a de-duplicated, lower-cased list. Never throws (degrades to []).
 */
export async function loadUserRoles(client: SupabaseClient, userId: string): Promise<string[]> {
  try {
    const { data, error } = await client
      .from('user_roles')
      .select('roles(name)')
      .eq('user_id', userId);
    if (error || !Array.isArray(data)) return [];
    const names: string[] = [];
    for (const row of data as Array<Record<string, unknown>>) {
      const rel = row.roles;
      if (Array.isArray(rel)) {
        for (const r of rel) {
          const n = (r as { name?: unknown }).name;
          if (typeof n === 'string') names.push(n.toLowerCase());
        }
      } else if (rel && typeof rel === 'object') {
        const n = (rel as { name?: unknown }).name;
        if (typeof n === 'string') names.push(n.toLowerCase());
      }
    }
    return Array.from(new Set(names));
  } catch {
    return [];
  }
}

/** The highest-privilege role on the 5-level ladder, or null. Pure. */
export function highestRole(roles: string[]): AppRole | null {
  let best: AppRole | null = null;
  let bestRank = 0;
  for (const r of roles) {
    if (r in ROLE_RANK && ROLE_RANK[r as AppRole] > bestRank) {
      best = r as AppRole;
      bestRank = ROLE_RANK[r as AppRole];
    }
  }
  return best;
}

/**
 * The highest app role for an already-known user id. Used by middleware and the
 * DAL gates (they already hold the authenticated user). Reads user_roles → roles.
 */
export async function loadHighestRole(client: SupabaseClient, userId: string): Promise<AppRole | null> {
  return highestRole(await loadUserRoles(client, userId));
}

/**
 * Build the full SessionRole from an authenticated Supabase client (identity via
 * getUser(), roles via the DB chain). Never throws.
 */
export async function getSessionRoleFrom(client: SupabaseClient): Promise<SessionRole> {
  try {
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) return EMPTY;
    const roles = await loadUserRoles(client, user.id);
    return {
      userId: user.id,
      email: user.email ?? null,
      roles,
      highestRole: highestRole(roles),
    };
  } catch {
    return EMPTY;
  }
}

/**
 * Server-side convenience (App Router Server Components / route handlers): resolves
 * the current request's SessionRole. Dynamically imports the per-request server
 * client so THIS module stays edge-safe for middleware. Never throws.
 */
export async function getSessionRole(): Promise<SessionRole> {
  try {
    const { createClient } = await import('../supabase/server');
    return await getSessionRoleFrom(createClient());
  } catch {
    return EMPTY;
  }
}
