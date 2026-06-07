'use client';

// =============================================================================
// Update password — set a new password (updateUser({ password })). Reached after
// a recovery link: /auth/callback exchanges the code for a session, redirects
// here, and this form updates the password against that recovery session.
// On success -> redirect to /dashboard/worldforge.
// =============================================================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Input } from '@hsi/ui';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { getBrowserSupabase } from '@/lib/supabase/client';

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const supabase = getBrowserSupabase();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        setLoading(false);
        return;
      }
      setDone(true);
      setLoading(false);
      setTimeout(() => {
        router.push('/dashboard/worldforge' as never);
        router.refresh();
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed.');
      setLoading(false);
    }
  };

  if (done) {
    return (
      <>
        <div className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
          <CheckCircle2 className="h-5 w-5 text-verified" />
          Password updated
        </div>
        <p className="text-body-sm leading-relaxed text-text-secondary">
          Redirecting you to WorldForge…
        </p>
      </>
    );
  }

  return (
    <>
      <div className="space-y-1.5">
        <h1 className="text-h5 font-semibold text-text-primary">Set a new password</h1>
        <p className="text-caption text-text-secondary">
          Choose a new password for your account.
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
        <Link
          href="/sign-in"
          className="font-semibold text-electric transition hover:text-white"
        >
          Back to sign in
        </Link>
      </p>
    </>
  );
}
