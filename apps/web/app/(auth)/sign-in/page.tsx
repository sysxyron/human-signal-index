'use client';

// =============================================================================
// Sign in — email + password (signInWithPassword). On success, push to the
// `redirectedFrom` param (set by middleware) or /dashboard/worldforge.
// Env-tolerant: the browser client construction never throws; the submit only
// makes a real network call on the deploy where Supabase env is set.
// =============================================================================

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button, Input } from '@hsi/ui';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { translateAuthError, isCloudflareChallenge } from '@/lib/auth/auth-errors';

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectedFrom = searchParams.get('redirectedFrom');
  const urlError = searchParams.get('error');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(urlError);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = getBrowserSupabase();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        // Translate GoTrue/network errors into a readable message (PURE — no
        // server-only imports). Surfaces "Invalid email or password.", "Email
        // not confirmed.", "Cannot reach Supabase Auth endpoint.", a Cloudflare
        // challenge notice, etc. instead of a bare "Failed to fetch".
        if (isCloudflareChallenge(signInError)) {
          // Best-effort client log so the challenge is visible in the console.
          // eslint-disable-next-line no-console
          console.warn('[sign-in] Cloudflare challenge detected on /auth route.');
        }
        const translated = translateAuthError(signInError, { route: '/auth' });
        setError(
          translated.hint
            ? `${translated.message} ${translated.hint}`
            : translated.message,
        );
        setLoading(false);
        return;
      }
      const dest =
        redirectedFrom && redirectedFrom.startsWith('/')
          ? redirectedFrom
          : '/dashboard/worldforge';
      router.push(dest as never);
      router.refresh();
    } catch (err) {
      // A thrown error (e.g. a network failure or a Cloudflare challenge page —
      // translateAuthError detects the challenge HTML internally) also goes
      // through the pure translator so the user never sees a raw "Failed to
      // fetch" / "[object Object]".
      const translated = translateAuthError(err, { route: '/auth' });
      setError(
        translated.hint
          ? `${translated.message} ${translated.hint}`
          : translated.message,
      );
      setLoading(false);
    }
  };

  return (
    <>
      <div className="space-y-1.5">
        <h1 className="text-h5 font-semibold text-text-primary">Sign in</h1>
        <p className="text-caption text-text-secondary">
          Access your private worlds and simulations.
        </p>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-btn border border-risk/40 bg-risk/10 px-3 py-2 text-caption text-risk">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-4">
        <Input
          id="email"
          type="email"
          label="Email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
        <Input
          id="password"
          type="password"
          label="Password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
        <Button type="submit" variant="primary" className="w-full" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <div className="flex items-center justify-between text-caption">
        <Link
          href="/reset-password"
          className="text-text-secondary transition hover:text-electric"
        >
          Forgot password?
        </Link>
        <Link
          href="/sign-up"
          className="font-semibold text-electric transition hover:text-white"
        >
          Create an account
        </Link>
      </div>
    </>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}
