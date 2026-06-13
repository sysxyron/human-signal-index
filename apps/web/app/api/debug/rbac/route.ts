// =============================================================================
// /api/debug/rbac — DEVELOPMENT-ONLY RBAC diagnostic (Phase 22A).
//
// Returns the resolved SessionRole for the current request so you can confirm the
// app sees the same role the database assigns. Reads the canonical chain
// public.user_roles → roles (the same source as middleware + RLS).
//
// SECURITY: responds 404 in production (the endpoint effectively does not exist
// there). Never returns tokens, cookies, or secrets — only the user's id, email,
// role names, and the resolution source.
// =============================================================================

import { NextResponse } from 'next/server';
import { getSessionRoleFrom } from '@/lib/auth/get-session-role';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse('Not found', { status: 404 });
  }

  try {
    const session = await getSessionRoleFrom(createClient());
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
