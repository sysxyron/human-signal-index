'use client';

// =============================================================================
// AuthButton — shows the signed-in user's email + a Sign out button, or a
// "Sign in" link when anonymous. Stays live via getBrowserSupabase().auth
// .getUser() on mount + onAuthStateChange. Sign-out POSTs to /auth/sign-out so
// the server clears the session cookie and redirects.
// =============================================================================

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LogIn, LogOut, UserRound } from 'lucide-react';
import { getBrowserSupabase } from '@/lib/supabase/client';

export function AuthButton() {
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    let active = true;

    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (active) {
          setEmail(data.user?.email ?? null);
          setReady(true);
        }
      })
      .catch(() => {
        if (active) setReady(true);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
      setReady(true);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  if (!ready) {
    return (
      <div className="h-9 rounded-card border border-border bg-surface/40" aria-hidden />
    );
  }

  if (!email) {
    return (
      <Link href="/sign-in" className="block">
        <span className="flex items-center justify-center gap-2 rounded-card border border-border bg-surface/60 px-3 py-2 text-caption font-semibold text-text-secondary transition hover:border-electric hover:text-white">
          <LogIn className="h-3.5 w-3.5" />
          Sign in
        </span>
      </Link>
    );
  }

  return (
    <div className="space-y-2 rounded-card border border-border bg-surface/60 p-2.5">
      <div className="flex items-center gap-2 px-0.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-white">
          <UserRound className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 truncate text-caption font-medium text-text-primary" title={email}>
          {email}
        </span>
      </div>
      <form action="/auth/sign-out" method="post">
        <button
          type="submit"
          className="flex w-full items-center justify-center gap-2 rounded-btn border border-border bg-surface-2/60 px-3 py-1.5 text-caption font-semibold text-text-secondary transition hover:border-risk/50 hover:text-risk"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </form>
    </div>
  );
}
