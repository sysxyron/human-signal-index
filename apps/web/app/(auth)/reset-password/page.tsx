'use client';

// =============================================================================
// Reset password — email -> resetPasswordForEmail(email, { redirectTo:
// ${origin}/update-password }). On success shows a confirmation message. The
// PKCE recovery link verifies at the Auth server and redirects back to
// /update-password?code=…, which exchanges the code for a session before the
// user sets a new password.
// =============================================================================

import { useState } from 'react';
import Link from 'next/link';
import { Button, Input } from '@hsi/ui';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { getBrowserSupabase } from '@/lib/supabase/client';

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = getBrowserSupabase();
      const origin = window.location.origin;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email,
        { redirectTo: `${origin}/update-password` },
      );
      if (resetError) {
        setError(resetError.message);
        setLoading(false);
        return;
      }
      setDone(true);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed.');
      setLoading(false);
    }
  };

  if (done) {
    return (
      <>
        <div className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
          <CheckCircle2 className="h-5 w-5 text-verified" />
          Check your email
        </div>
        <p className="text-body-sm leading-relaxed text-text-secondary">
          If an account exists for <strong>{email}</strong>, we sent a link to
          reset your password.
        </p>
        <Link href="/sign-in">
          <Button variant="secondary" className="w-full">
            Back to sign in
          </Button>
        </Link>
      </>
    );
  }

  return (
    <>
      <div className="space-y-1.5">
        <h1 className="text-h5 font-semibold text-text-primary">Reset password</h1>
        <p className="text-caption text-text-secondary">
          Enter your email and we&apos;ll send you a reset link.
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
        <Button type="submit" variant="primary" className="w-full" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {loading ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>

      <p className="text-center text-caption text-text-secondary">
        Remembered it?{' '}
        <Link
          href="/sign-in"
          className="font-semibold text-electric transition hover:text-white"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}
