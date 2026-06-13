// =============================================================================
// Server Supabase client (App Router, @supabase/ssr) — SERVER ONLY.
//
// NEVER import this from a 'use client' module: it uses next/headers `cookies()`.
// `createClient()` returns a per-request, RLS-enforced client wired to the
// request's auth cookie so policies evaluate `auth.uid()` for the signed-in user
// (or the anon role when there is no session). Env-tolerant: it never throws on
// import or construction even when Supabase env is empty (the sandbox); real
// network calls surface their error to the caller (the DAL wraps them).
// =============================================================================

import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { supabaseAnonKey, supabaseUrl } from './env';
import { loadHighestRole } from '../auth/get-session-role';

interface CookieToSet {
  name: string;
  value: string;
  options: CookieOptions;
}

/**
 * Create a per-request server client. Uses the getAll/setAll cookie adapter from
 * the official @supabase/ssr Next.js pattern. `setAll` is wrapped in try/catch
 * because Server Components cannot set cookies — the middleware refreshes the
 * session cookie on each request, so a no-op here is safe.
 */
export function createClient(): SupabaseClient {
  const cookieStore = cookies();
  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component — cookies are read-only here. The
          // middleware handles refreshing the session cookie, so ignore.
        }
      },
    },
  });
}

/**
 * Returns the authenticated user for the current request, or null. Never throws
 * (missing env / network errors degrade to null so anonymous read paths work).
 */
export async function getUser(): Promise<User | null> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user ?? null;
  } catch {
    return null;
  }
}

/**
 * Convenience: the signed-in user's HIGHEST app role, resolved from the canonical
 * DB chain public.user_roles → roles (NOT the nonexistent public.users.role
 * column). Returns null when anonymous / unavailable. Used by Server Components
 * for UI gating (e.g. showing curator/admin controls); the same resolver backs the
 * middleware route gate so the sidebar and middleware agree.
 */
export async function getSessionRole(): Promise<string | null> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    return await loadHighestRole(supabase, user.id);
  } catch {
    return null;
  }
}
