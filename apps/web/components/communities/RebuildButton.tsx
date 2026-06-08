'use client';

// =============================================================================
// HSI Phase 9 — RebuildButton. Generic researcher+ rebuild control reused by the
// communities + amplification pages. Calls the supplied server action (bound at
// the page), refreshes on success. useTransition; full loading / error / success
// states. Demo is read-only; permission gated server-side too.
// =============================================================================

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@hsi/ui';
import { RefreshCw, Loader2 } from 'lucide-react';
import { SignInPrompt, SuccessNotice } from '@/components/worldforge/PersistenceUI';
import { ErrorState } from '@/components/signals/states';
import { formatErrorMessage } from '@/lib/errors/format-error';

type DbResultLike = { ok: true } | { ok: false; error: string };

export function RebuildButton({
  action,
  canRebuild,
  demo = false,
  label = 'Rebuild',
  pendingLabel = 'Rebuilding…',
  successMessage = 'Rebuilt.',
  signInMessage = 'Sign in as a researcher to rebuild',
}: {
  action: () => Promise<DbResultLike>;
  canRebuild: boolean;
  demo?: boolean;
  label?: string;
  pendingLabel?: string;
  successMessage?: string;
  signInMessage?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (demo) {
    return (
      <span className="text-caption text-warning">Demo is read-only — connect Supabase to rebuild.</span>
    );
  }

  if (!canRebuild) {
    return <SignInPrompt message={signInMessage} redirectedFrom={pathname} />;
  }

  const onClick = () => {
    setError(null);
    setDone(false);
    startTransition(async () => {
      const res = await action();
      if (res.ok) {
        setDone(true);
        router.refresh();
      } else {
        setError(formatErrorMessage(res.error));
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button variant="primary" size="sm" onClick={onClick} disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        {pending ? pendingLabel : label}
      </Button>
      {done ? <SuccessNotice message={successMessage} /> : null}
      {error ? <ErrorState title="Could not rebuild" message={error} /> : null}
    </div>
  );
}
