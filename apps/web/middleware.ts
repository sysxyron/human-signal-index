// =============================================================================
// Root middleware — Supabase session refresh + route protection (Phase 2.75)
// HARDENED in Phase 14 (auth/security). Additive only — the existing redirect
// behavior is preserved; no routes removed, no redirect loops introduced.
//
// ORDER OF OPERATIONS (every matched request):
//   1. updateSession() — refresh the Supabase session cookie (unchanged), giving
//      us the refreshed response + the authenticated user (or null).
//   2. Always-allowed allowlist — sign-in/sign-up/auth callbacks/api/health and
//      the public marketing site + public WorldForge reads are NEVER redirected
//      (prevents loops).
//   3. Authed user on /sign-in|/sign-up -> /dashboard/worldforge (unchanged).
//   4. Unauthenticated on a protected /dashboard route -> /sign-in?redirectedFrom=
//      (unchanged).
//   5. NEW (Phase 14) — role gate: for a route with a required role
//      (requiredRoleForRoute), look up the signed-in user's role (edge-safe, via
//      the same @supabase/ssr client) and, if insufficient, redirect to
//      /dashboard?denied=<route> (NOT a loop — /dashboard itself is not role
//      gated). Best-effort access-denial telemetry is written inline (edge-safe;
//      we do NOT import the server-only lib/security/log here).
//
// LOOP-SAFETY: the role gate only ever redirects to /dashboard, which carries no
// role requirement, so a denied user lands somewhere they are allowed. The auth
// gate only redirects to /sign-in (allowlisted). An authed user on /sign-in is
// bounced to /dashboard/worldforge (public). No rule can ping-pong.
//
// EDGE-SAFETY: this file imports ONLY @supabase/ssr, next/server, and the PURE
// rbac-audit guards (no imports → import-safe in edge). It does NOT import
// next/headers, the server DAL, or lib/security/log (all server-only). The role
// lookup degrades to a pass-through on any error.
//
// RESILIENCE: the entire body is wrapped in try/catch — a middleware error never
// hard-fails the request; we log and fall through to NextResponse.next().
// =============================================================================

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase/env';
import { hasRole, requiredRoleForRoute, type AppRole } from '@/lib/security/rbac-audit';
import { loadHighestRole } from '@/lib/auth/get-session-role';

const AUTH_PAGES = ['/sign-in', '/sign-up'];

interface CookieToSet {
  name: string;
  value: string;
  options: CookieOptions;
}

/**
 * Edge-safe role lookup for the current request. Reuses the request cookies via a
 * read-only @supabase/ssr client (NO next/headers) and resolves the role from the
 * CANONICAL source — public.user_roles → roles (via loadHighestRole) — the same
 * chain the DB's RLS helpers use. Returns the highest role name, or null on
 * anonymous/unavailable/error. Never throws.
 *
 * (Previously this read `public.users.role`, a column that does not exist, so it
 * always fell back to 'viewer' and denied admins their own routes.)
 */
async function lookupRole(request: NextRequest): Promise<string | null> {
  try {
    const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        // Read-only in this helper — the session cookie was already refreshed by
        // updateSession() upstream, so writes here are a no-op.
        setAll(_cookiesToSet: CookieToSet[]) {
          /* no-op */
        },
      },
    });
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    return await loadHighestRole(supabase, user.id);
  } catch {
    return null;
  }
}

/**
 * Best-effort, edge-safe access-denial telemetry. Writes directly to the
 * access_denials table via the request-cookie client (RLS allows an authenticated
 * insert). We do NOT import lib/security/log here (it pulls next/headers, which is
 * not available in the edge middleware runtime). Never throws; never blocks.
 */
async function logDenialEdge(
  request: NextRequest,
  route: string,
  requiredRole: AppRole,
  actualRole: string | null,
): Promise<void> {
  try {
    const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(_cookiesToSet: CookieToSet[]) {
          /* no-op */
        },
      },
    });
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from('access_denials').insert({
      user_id: user?.id ?? null,
      event_type: 'access_denied',
      severity: 'warning',
      route,
      required_role: requiredRole,
      actual_role: actualRole,
      message: `Access to ${route} denied (requires ${requiredRole}; have ${actualRole ?? 'none'}).`,
      ip_address:
        request.headers.get('x-forwarded-for') ??
        request.headers.get('x-real-ip') ??
        null,
      user_agent: request.headers.get('user-agent') ?? null,
    });
  } catch {
    // Best-effort telemetry — swallow everything.
  }
}

export async function middleware(request: NextRequest) {
  try {
    const { response, user } = await updateSession(request);
    const { pathname } = request.nextUrl;

    const isAuthed = Boolean(user);

    // Authenticated users have no business on the sign-in / sign-up forms.
    if (
      isAuthed &&
      AUTH_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
    ) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard/worldforge';
      url.search = '';
      return NextResponse.redirect(url);
    }

    // WorldForge is public (reads). Everything else under /dashboard needs a user.
    const isWorldForge = pathname.startsWith('/dashboard/worldforge');
    const isProtectedDashboard =
      pathname === '/dashboard' ||
      (pathname.startsWith('/dashboard/') && !isWorldForge);

    if (isProtectedDashboard && !isAuthed) {
      const url = request.nextUrl.clone();
      url.pathname = '/sign-in';
      url.search = `?redirectedFrom=${encodeURIComponent(pathname)}`;
      return NextResponse.redirect(url);
    }

    // --- Phase 14: role gate for admin/curator/reviewer/researcher routes. ---
    // Only runs for an authenticated user on a route that declares a required
    // role. WorldForge (public reads) is never role gated. /dashboard (the
    // redirect target) carries no requirement, so denials cannot loop.
    if (isAuthed && isProtectedDashboard) {
      const required = requiredRoleForRoute(pathname);
      if (required) {
        const role = await lookupRole(request);
        // DEV diagnostics only — never logs tokens or secrets, only the resolved
        // role decision. Silent in production.
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.debug(
            `[rbac] ${pathname} requires '${required}'; resolved role '${role ?? 'none'}' → ${
              hasRole(role ?? undefined, required) ? 'ALLOW' : 'DENY'
            }`,
          );
        }
        if (!hasRole(role ?? undefined, required)) {
          // Best-effort telemetry (do not block the redirect on logging).
          void logDenialEdge(request, pathname, required, role);
          const url = request.nextUrl.clone();
          url.pathname = '/dashboard';
          url.search = `?denied=${encodeURIComponent(pathname)}`;
          return NextResponse.redirect(url);
        }
      }
    }

    // Default: pass through with refreshed session cookies attached.
    return response;
  } catch (err) {
    // A middleware error must NEVER hard-fail the request — log + continue.
    // eslint-disable-next-line no-console
    console.error('[middleware] error (continuing as pass-through):', err);
    return NextResponse.next({ request });
  }
}

export const config = {
  // Match everything except Next internals, static assets, and common image
  // file extensions. (Standard @supabase/ssr matcher.) /api/health/** matches
  // but is harmless: health routes are public, never role-gated below, and the
  // role gate only fires on /dashboard/** paths.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
