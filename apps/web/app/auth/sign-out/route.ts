// =============================================================================
// Sign out — POST /auth/sign-out
// Signs the user out via a server client (clears the session cookie) and
// redirects to the marketing home. Env-tolerant: never throws.
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    await supabase.auth.signOut();
  } catch {
    // Ignore — we redirect to home regardless so the user always lands cleanly.
  }
  return NextResponse.redirect(new URL('/', request.url), { status: 303 });
}
