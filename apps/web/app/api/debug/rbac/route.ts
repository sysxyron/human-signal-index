// =============================================================================
// /api/debug/rbac — RBAC diagnostic (Phase 22A; hardened Phase 23).
//
// Returns the resolved SessionRole for the current request so you can confirm the
// app sees the same role the database assigns. Reads the canonical chain
// public.user_roles → roles (the same source as middleware + RLS).
//
// SECURITY (defense-in-depth):
//   1. Responds 404 in PRODUCTION — the endpoint does not exist there.
//   2. Even in non-production, requires the caller to be an ADMIN (404 otherwise,
//      so it doesn't reveal its own existence to non-admins).
//   3. Never returns tokens, cookies, or secrets — only id, email, role names,
//      and the resolution source.
// =============================================================================

import { NextResponse } from 'next/server';
import { getSessionRoleFrom } from '@/lib/auth/get-session-role';
import { createClient } from '@/lib/supabase/server';
import { hasRole } from '@/lib/security/rbac-audit';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse('Not found', { status: 404 });
  }

  try {
    const session = await getSessionRoleFrom(createClient());
    // Admin-only: non-admins get a 404 (no existence disclosure, no role leakage).
    if (!hasRole(session.highestRole ?? undefined, 'admin')) {
      return new NextResponse('Not found', { status: 404 });
    }
    return NextResponse.json({
      email: session.email,
      userId: session.userId,
      roles: session.roles,
      highestRole: session.highestRole,
      source: 'public.user_roles',
      note:
        'Identity is read from the JWT (auth.users); the role is decided by the DB chain user_roles → roles. If highestRole is wrong here, the DB assignment — not the JWT — is the source to check.',
    });
  } catch {
    return NextResponse.json(
      { error: 'Could not resolve session role.', source: 'public.user_roles' },
      { status: 200 },
    );
  }
}
