'use client';

// =============================================================================
// Update password — set a new password (updateUser({ password })).
//
// Reached by a Supabase recovery (or invite) link. PKCE recovery links verify at
// the Auth server and redirect here with `?code=…`, which MUST be exchanged for a
// session (exchangeCodeForSession) BEFORE updateUser runs — otherwise Supabase
// returns "Auth session missing!". Older implicit links carry hash tokens
// (#access_token/#refresh_token → setSession). When /auth/callback already
// established the session it redirects here with ?flow=…, and we simply confirm
// the existing session.
//
// The password form is GATED on a confirmed session: while verifying we show a
// loader; if no session can be established we show an expired/invalid notice with
// NO usable form. On success the recovery session is signed out and the user is
// sent to sign in (invite flows keep the existing dashboard redirect).
//
// SECURITY: tokens are read from the URL only to establish the session; they are
// never logged, rendered, or stored manually. No service-role key (anon client).
// =============================================================================

import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Input } from '@hsi/ui';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { classifyRecoveryLink, INVALID_RECOVERY_LINK_MESSAGE, type RecoveryType } from '@/lib/auth/recovery-link';

type Phase = 'verifying' | 'ready' | 'invalid';

function UpdatePasswordInner() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('verifying');
  const [invalidMessage, setInvalidMessage] = useState(INVALID_RECOVERY_LINK_MESSAGE);
  const [flow, setFlow] = useState<RecoveryType | null>(null);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  // ---- establish the recovery session on load (before showing the form) ----
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const action = classifyRecoveryLink(window.location.search, window.location.hash);
      setFlow(action.type);

      let supabase;
      try {
        supabase = getBrowserSupabase();
      } catch {
        if (!cancelled) { setInvalidMessage(INVALID_RECOVERY_LINK_MESSAGE); setPhase('invalid'); }
        return;
      }

      if (action.kind === 'error') {
        if (!cancelled) { setInvalidMessage(action.message || INVALID_RECOVERY_LINK_MESSAGE); setPhase('invalid'); }
        return;
      }

      // The @supabase/ssr client may auto-detect the code/hash in the URL, so
      // check first; otherwise drive the exchange explicitly, then re-check.
      let session = (await supabase.auth.getSession()).data.session;

      if (!session) {
        try {
          if (action.kind === 'code') {
            await supabase.auth.exchangeCodeForSession(action.code);
          } else if (action.kind === 'hash') {
            await supabase.auth.setSession({ access_token: action.accessToken, refresh_token: action.refreshToken });
          }
        } catch {
          // A concurrent detectSessionInUrl may have consumed the token; the
          // getSession re-check below is authoritative.
        }
        session = (await supabase.auth.getSession()).data.session;
        if (!session) {
          // Give an in-flight detectSessionInUrl a brief moment to finish.
          await new Promise((r) => setTimeout(r, 350));
          session = (await supabase.auth.getSession()).data.session;
        }
      }

      if (cancelled) return;

      if (!session) {
        setInvalidMessage(INVALID_RECOVERY_LINK_MESSAGE);
        setPhase('invalid');
        return;
      }

      // Session confirmed — strip any code/tokens from the URL so they are not
      // left in the address bar or browser history.
      try {
        window.history.replaceState(null, '', window.location.pathname);
      } catch {
        /* noop */
      }
      setPhase('ready');
    };

    void run();
    return () => { cancelled = true; };
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password should be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      const supabase = getBrowserSupabase();
      // Guard: only update against a confirmed session.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError(INVALID_RECOVERY_LINK_MESSAGE);
        setLoading(false);
        setPhase('invalid');
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        // Supabase messages are user-readable (weak password, "New password
        // should be different from the old password", etc.) — surface directly.
        setError(updateError.message);
        setLoading(false);
        return;
      }

      setDone(true);
      setLoading(false);

      // Invite flows keep the existing behaviour (straight into the app). A
      // password RESET signs the recovery session out and returns to sign in so
      // the user authenticates with the new password.
      if (flow === 'invite') {
        setTimeout(() => { router.push('/dashboard/worldforge' as never); router.refresh(); }, 1200);
      } else {
        try { await supabase.auth.signOut(); } catch { /* noop */ }
        setTimeout(() => { router.push('/sign-in?reset=success' as never); router.refresh(); }, 1200);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed.');
      setLoading(false);
    }
  };

  // ---- verifying ----------------------------------------------------------
  if (phase === 'verifying') {
    return (
      <div className="flex items-center gap-2 text-body-sm text-text-secondary">
        <Loader2 className="h-4 w-4 animate-spin text-electric" />
        Verifying reset link…
      </div>
    );
  }

  // ---- invalid / expired link (no usable form) ----------------------------
  if (phase === 'invalid') {
    return (
      <>
        <div className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
          <AlertTriangle className="h-5 w-5 text-risk" />
          Reset link problem
        </div>
        <p className="text-body-sm leading-relaxed text-text-secondary">{invalidMessage}</p>
        <Link href="/reset-password">
          <Button variant="primary" className="w-full">Request a new reset link</Button>
        </Link>
        <p className="text-center text-caption text-text-secondary">
          <Link href="/sign-in" className="font-semibold text-electric transition hover:text-white">
            Back to sign in
          </Link>
        </p>
      </>
    );
  }

  // ---- success ------------------------------------------------------------
  if (done) {
    return (
      <>
        <div className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
          <CheckCircle2 className="h-5 w-5 text-verified" />
          Password updated
        </div>
        <p className="text-body-sm leading-relaxed text-text-secondary">
          {flow === 'invite' ? 'Redirecting you to WorldForge…' : 'Redirecting you to sign in…'}
        </p>
      </>
    );
  }

  // ---- ready: password form -----------------------------------------------
  return (
    <>
      <div className="space-y-1.5">
        <h1 className="text-h5 font-semibold text-text-primary">Set a new password</h1>
        <p className="text-caption text-text-secondary">Choose a new password for your account.</p>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-btn border border-risk/40 bg-risk/10 px-3 py-2 text-caption text-risk">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-4">
        <Input
          id="password"
          type="password"
          label="New password"
          autoComplete="new-password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 6 characters"
        />
        <Input
          id="confirm"
          type="password"
          label="Confirm password"
          autoComplete="new-password"
          required
          minLength={6}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Re-enter password"
        />
        <Button type="submit" variant="primary" className="w-full" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {loading ? 'Updating…' : 'Update password'}
        </Button>
      </form>

      <p className="text-center text-caption text-text-secondary">
        <Link href="/sign-in" className="font-semibold text-electric transition hover:text-white">
          Back to sign in
        </Link>
      </p>
    </>
  );
}

export default function UpdatePasswordPage() {
  return (
    <Suspense fallback={null}>
      <UpdatePasswordInner />
    </Suspense>
  );
}
