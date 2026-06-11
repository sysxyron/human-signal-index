'use client';

// =============================================================================
// HSI Phase 17 — RecordHistoryButton. Curator/admin control that appends a trust
// snapshot for every tracked entity (append-only). Thin wrapper over
// recordTrustHistoryAction (role-gated server-side too). Demo is read-only.
// =============================================================================

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@hsi/ui';
import { History, Loader2, Sparkles } from 'lucide-react';
import { SignInPrompt, SuccessNotice } from '@/components/worldforge/PersistenceUI';
import { ErrorState } from '@/components/signals/states';
import { formatErrorMessage } from '@/lib/errors/format-error';

type DbResultLike = { ok: true } | { ok: false; error: string };

export function RecordHistoryButton({
  action,
  canRecord,
  demo = false,
}: {
  action: () => Promise<DbResultLike>;
  canRecord: boolean;
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
        <Sparkles className="h-3.5 w-3.5" /> Demo is read-only — connect Supabase to record history.
      </span>
    );
  }
  if (!canRecord) {
    return <SignInPrompt message="Sign in as a curator to record trust history" redirectedFrom={pathname} />;
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
      <Button variant="secondary" size="sm" onClick={onClick} disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <History className="h-4 w-4" />}
        {pending ? 'Recording…' : 'Record snapshot'}
      </Button>
      {done ? <SuccessNotice message="Trust snapshot appended for every tracked entity." /> : null}
      {error ? <ErrorState title="Could not record history" message={error} /> : null}
    </div>
  );
}
