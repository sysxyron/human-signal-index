// =============================================================================
// Root middleware — Supabase session refresh + route protection.
//
// On every matched request we first refresh the Supabase session cookie via
// updateSession() (so server components / actions see a valid, non-expired
// session), then apply deliberate route protection.
//
// ROUTE PROTECTION RULES (reconciling "public worlds are viewable" with
// "the rest of the dashboard requires a session"):
//
//   * /dashboard/worldforge/**  -> PUBLIC. Anonymous visitors may VIEW public
//     worlds and all read-only analysis. We do NOT redirect. Every WRITE is
//     gated server-side in the DAL (auth.getUser() + RLS owner policy), and the
//     UI shows "Sign in to …" prompts, so leaving reads open is safe.
//
//   * All other /dashboard/**   -> REQUIRE a session. If there is no user we
//     redirect to /sign-in?redirectedFrom=<pathname>.
//
//   * /sign-in, /sign-up, /reset-password, /update-password, /auth/**, and the
//     public marketing site -> always allowed. An ALREADY-authenticated user who
//     hits /sign-in or /sign-up is bounced to /dashboard/worldforge.
//
// The matcher excludes _next, static assets, images and favicon (standard).
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const AUTH_PAGES = ['/sign-in', '/sign-up'];

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isAuthed = Boolean(user);

  // Authenticated users have no business on the sign-in / sign-up forms.
  if (isAuthed && AUTH_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
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

  // Default: pass through with refreshed session cookies attached.
  return response;
}

export const config = {
  // Match everything except Next internals, static assets, and common image
  // file extensions. (Standard @supabase/ssr matcher.)
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
