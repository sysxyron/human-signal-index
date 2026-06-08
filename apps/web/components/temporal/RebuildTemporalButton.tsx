'use client';

// =============================================================================
// HSI Phase 10 — RebuildTemporalButton. Researcher+ control that re-runs the
// temporal intelligence pipeline (snapshots → evolution → genealogy → influence
// → forecast). Thin wrapper over the supplied server action (bound at the page,
// role-gated server-side too). useTransition; loading / error / success states.
// Demo is read-only.
// =============================================================================

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@hsi/ui';
import { RefreshCw, Loader2, History } from 'lucide-react';
import { SignInPrompt, SuccessNotice } from '@/components/worldforge/PersistenceUI';
import { ErrorState } from '@/components/signals/states';
import { formatErrorMessage } from '@/lib/errors/format-error';

type DbResultLike = { ok: true } | { ok: false; error: string };

export function RebuildTemporalButton({
  action,
  canRebuild,
  demo = false,
}: {
  action: () => Promise<DbResultLike>;
  canRebuild: boolean;
  demo?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (demo) {
    return (
      <span className="inline-flex items-center gap-1.5 text-caption text-warning">
        <History className="h-3.5 w-3.5" /> Demo is read-only — connect Supabase to rebuild.
      </span>
    );
  }

  if (!canRebuild) {
    return (
      <SignInPrompt
        message="Sign in as a researcher to rebuild temporal intelligence"
        redirectedFrom={pathname}
      />
    );
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
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
        {pending ? 'Rebuilding…' : 'Rebuild temporal intelligence'}
      </Button>
      {done ? (
        <SuccessNotice message="Temporal intelligence rebuilt from the narrative graph." />
      ) : null}
      {error ? <ErrorState title="Could not rebuild" message={error} /> : null}
    </div>
  );
}
