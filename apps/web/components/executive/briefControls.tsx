'use client';

// =============================================================================
// HSI Phase 22 — PersistBriefButton. Curator+ persists a governance brief
// snapshot from the live system state. Thin wrapper over the role-gated server
// action. Demo is read-only. The brief is never auto-sent or auto-published.
// =============================================================================

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@hsi/ui';
import { Loader2, Save, Sparkles } from 'lucide-react';
import { SignInPrompt, SuccessNotice } from '@/components/worldforge/PersistenceUI';
import { ErrorState } from '@/components/signals/states';
import { formatErrorMessage } from '@/lib/errors/format-error';

type DbResultLike = { ok: true } | { ok: false; error: string };

export function PersistBriefButton({
  action, canAct, demo = false,
}: {
  action: () => Promise<DbResultLike>;
  canAct: boolean;
  demo?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (demo) return <span className="inline-flex items-center gap-1.5 text-caption text-warning"><Sparkles className="h-3.5 w-3.5" /> Demo is read-only.</span>;
  if (!canAct) return <SignInPrompt message="Sign in as a curator to persist a governance brief" redirectedFrom={pathname} />;

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button variant="secondary" size="sm" disabled={pending} onClick={() => {
        setError(null); setDone(false);
        start(async () => {
          const res = await action();
          if (res.ok) { setDone(true); router.refresh(); } else setError(formatErrorMessage(res.error));
        });
      }}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save governance brief
      </Button>
      {done ? <SuccessNotice message="Governance brief saved." /> : null}
      {error ? <ErrorState title="Could not save" message={error} /> : null}
    </div>
  );
}
