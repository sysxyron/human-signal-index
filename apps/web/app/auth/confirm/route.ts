// =============================================================================
// Email confirmation — GET /auth/confirm
//
// Server-side handler for the Supabase email confirmation link. The hosted
// confirmation template (public/email-templates/confirmation.html) links to:
//
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard
//
// This route verifies the one-time token with verifyOtp using the per-request
// server client, which persists the session cookie (cookies are writable in a
// Route Handler), then redirects into the app. On any failure it redirects to a
// friendly /auth/error page rather than leaking the GoTrue error.
//
// This is intentionally separate from the existing CLIENT route /auth/callback,
// which still handles PKCE (?code), implicit/invite/recovery (#access_token), and
// magic-link flows. Both can coexist; do not remove /auth/callback.
//
// SECURITY: token_hash is read only to verify the OTP; it is never logged or
// rendered. Only the anon key is used (no service-role key). `next` is validated
// to be an internal path so this cannot be turned into an open redirect.
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { rateLimit, clientKeyFromHeaders, pruneRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const DEFAULT_NEXT = '/dashboard';

// Supabase email OTP types accepted on this route.
const EMAIL_OTP_TYPES: readonly EmailOtpType[] = [
  'email',
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
];

/** Allow only internal paths (`/foo`), never protocol-relative (`//evil.com`). */
function safeNext(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//')
    ? value
    : DEFAULT_NEXT;
}

function isEmailOtpType(value: string | null): value is EmailOtpType {
  return value != null && (EMAIL_OTP_TYPES as readonly string[]).includes(value);
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const next = safeNext(searchParams.get('next'));

  const errorRedirect = (reason: string) =>
    NextResponse.redirect(`${origin}/auth/error?reason=${reason}`);

  // Phase 56.1 — defense-in-depth rate limit on OTP verification (token brute
  // force / enumeration), on top of Supabase GoTrue's own server-side limits.
  pruneRateLimit();
  const rl = rateLimit(`confirm:${clientKeyFromHeaders(request.headers)}`, { limit: 10, windowMs: 60_000 });
  if (!rl.allowed) {
    return errorRedirect('rate-limited');
  }

  if (!tokenHash || !isEmailOtpType(type)) {
    return errorRedirect('missing-confirmation-token');
  }

  try {
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    if (error) {
      return errorRedirect('email-confirmation-failed');
    }
  } catch {
    return errorRedirect('email-confirmation-failed');
  }

  return NextResponse.redirect(`${origin}${next}`);
}
