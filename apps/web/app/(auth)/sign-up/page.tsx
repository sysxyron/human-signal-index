'use client';

// =============================================================================
// Sign up — email + password (+ optional name -> options.data.name).
// signUp with emailRedirectTo = ${origin}/auth/callback. On success shows a
// "check your email to confirm" state. Env-tolerant browser client.
// =============================================================================

import { useState } from 'react';
import Link from 'next/link';
import { Button, Input } from '@hsi/ui';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { getBrowserSupabase } from '@/lib/supabase/client';

export default function SignUpPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${origin}/auth/callback`,
          data: name.trim() ? { name: name.trim() } : undefined,
        },
      });
      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }
      setDone(true);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign up failed.');
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
          We sent a confirmation link to <strong>{email}</strong>. Click it to
          activate your account, then sign in.
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
        <h1 className="text-h5 font-semibold text-text-primary">Create account</h1>
        <p className="text-caption text-text-secondary">
          Save private worlds, simulations, and analyses.
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
          id="name"
          type="text"
          label="Name (optional)"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ada Lovelace"
        />
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
          autoComplete="new-password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 6 characters"
        />
        <Button type="submit" variant="primary" className="w-full" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {loading ? 'Creating account…' : 'Create account'}
        </Button>
      </form>

      <p className="text-center text-caption text-text-secondary">
        Already have an account?{' '}
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
