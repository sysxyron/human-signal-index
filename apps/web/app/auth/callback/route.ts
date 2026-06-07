// =============================================================================
// Auth callback — GET /auth/callback
// Exchanges the `code` (from email confirmation / recovery / OAuth) for a
// session using a server client, then redirects to the `next` param (defaults
// to /dashboard/worldforge). Errors redirect to /sign-in?error=...
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const nextParam = searchParams.get('next');
  const next =
    nextParam && nextParam.startsWith('/') ? nextParam : '/dashboard/worldforge';

  if (!code) {
    return NextResponse.redirect(
      `${origin}/sign-in?error=${encodeURIComponent('Missing authorization code.')}`,
    );
  }

  try {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        `${origin}/sign-in?error=${encodeURIComponent(error.message)}`,
      );
    }
    return NextResponse.redirect(`${origin}${next}`);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Authentication failed.';
    return NextResponse.redirect(
      `${origin}/sign-in?error=${encodeURIComponent(message)}`,
    );
  }
}
