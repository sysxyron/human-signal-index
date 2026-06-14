'use client';

// =============================================================================
// Auth callback — /auth/callback (CLIENT).
//
// Establishes the session for EVERY Supabase auth redirect format, then routes:
//
//   1. ?code=…                 PKCE / OAuth          → exchangeCodeForSession
//   2. ?token_hash=…&type=…    server email confirm  → verifyOtp
//   3. #access_token=…&type=…  implicit / INVITE /   → setSession (the hash never
//      &refresh_token=…        recovery / magiclink     reaches the server, which is
//                                                       why the old server route
//                                                       failed for invites)
//   4. ?error / #error         expired / invalid     → friendly sign-in message
//
// Invite + recovery sessions land on /update-password so the user sets a password;
// everything else goes to `next` (or /dashboard/worldforge). The @supabase/ssr
// browser client persists the session to cookies the server + middleware read.
//
// SECURITY: tokens are read from the URL only to establish the session; they are
// never logged or rendered. No service-role key is involved (client = anon key).
// =============================================================================

import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, AlertTriangle } from 'lucide-react';
import { getBrowserSupabase } from '@/lib/supabase/client';

type OtpType = 'invite' | 'recovery' | 'signup' | 'magiclink' | 'email' | 'email_change';

function safeNext(value: string | null): string | null {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : null;
}

function CallbackInner() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const finish = (path: string) => {
      if (cancelled) return;
      router.replace(path as never);
      router.refresh();
    };
    const failTo = (msg: string) => finish(`/sign-in?error=${encodeURIComponent(msg)}`);

    const run = async () => {
      // Snapshot the URL synchronously — @supabase/ssr may clear the hash while
      // auto-detecting the session, so capture type/tokens/errors first.
      const query = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));

      // 1) Provider/verification errors (query or hash) → readable message.
      const errDesc = query.get('error_description') || hash.get('error_description');
      const errCode = query.get('error') || hash.get('error');
      if (errDesc || errCode) {
        failTo(errDesc || 'This link is invalid or has expired. Please request a new one.');
        return;
      }

      const code = query.get('code');
      const tokenHash = query.get('token_hash');
      const type = (query.get('type') || hash.get('type')) as OtpType | null;
      const accessToken = hash.get('access_token');
      const refreshToken = hash.get('refresh_token');
      const next = safeNext(query.get('next'));

      let supabase;
      try {
        supabase = getBrowserSupabase();
      } catch {
        failTo('Sign-in is not available right now. Please try again later.');
        return;
      }

      // Establish the session. detectSessionInUrl may have already handled the
      // hash/code, so check first, then drive explicitly, then re-check.
      let session = (await supabase.auth.getSession()).data.session;

      if (!session) {
        try {
          if (code) {
            await supabase.auth.exchangeCodeForSession(code);
          } else if (tokenHash && type) {
            await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as never });
          } else if (accessToken && refreshToken) {
            await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          }
        } catch {
          // Ignore here — a concurrent detectSessionInUrl may have consumed the
          // token; the getSession re-check below is authoritative.
        }
        session = (await supabase.auth.getSession()).data.session;
        if (!session) {
          // Give an in-flight detectSessionInUrl a brief moment to finish.
          await new Promise((r) => setTimeout(r, 350));
          session = (await supabase.auth.getSession()).data.session;
        }
      }

      if (!session) {
        failTo('This sign-in link is invalid or has expired. Please request a new one.');
        return;
      }

      // Invited / recovery users must set a password before continuing.
      if (type === 'invite' || type === 'recovery') {
        finish(`/update-password?flow=${type}`);
        return;
      }
      finish(next ?? '/dashboard/worldforge');
    };

    void run().catch(() => {
      if (!cancelled) setError('Authentication failed. Please try signing in again.');
    });

    return () => { cancelled = true; };
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-3 rounded-card border border-border bg-surface/60 p-6 text-center">
        {error ? (
          <>
            <AlertTriangle className="mx-auto h-6 w-6 text-risk" />
            <p className="text-body-sm text-text-secondary">{error}</p>
            <a href="/sign-in" className="text-caption font-semibold text-electric hover:text-white">Back to sign in</a>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-electric" />
            <p className="text-body-sm text-text-secondary">Completing sign-in…</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <CallbackInner />
    </Suspense>
  );
}
