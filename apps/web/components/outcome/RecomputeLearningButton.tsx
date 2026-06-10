'use client';

// =============================================================================
// HSI Phase 15 — RecomputeLearningButton. Reviewer+ control that re-runs the
// confidence-learning step over the recorded outcome history (re-calibrating the
// learned confidence per intervention type). Thin wrapper over learnFromOutcomes-
// Action (role-gated server-side too). useTransition; loading / error / success
// states. Demo is read-only.
// =============================================================================

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@hsi/ui';
import { Brain, Loader2, Sparkles } from 'lucide-react';
import { SignInPrompt, SuccessNotice } from '@/components/worldforge/PersistenceUI';
import { ErrorState } from '@/components/signals/states';
import { formatErrorMessage } from '@/lib/errors/format-error';

type DbResultLike = { ok: true } | { ok: false; error: string };

export function RecomputeLearningButton({
  action,
  canRecompute,
  demo = false,
}: {
  action: () => Promise<DbResultLike>;
  canRecompute: boolean;
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
        <Sparkles className="h-3.5 w-3.5" /> Demo is read-only — connect Supabase to
        recompute learning.
      </span>
    );
  }

  if (!canRecompute) {
    return (
      <SignInPrompt
        message="Sign in as a reviewer to recompute learning"
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
      <Button variant="secondary" size="sm" onClick={onClick} disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
        {pending ? 'Recomputing…' : 'Recompute learning'}
      </Button>
      {done ? (
        <SuccessNotice message="Learning recomputed — calibrated confidence per intervention type refreshed." />
      ) : null}
      {error ? <ErrorState title="Could not recompute learning" message={error} /> : null}
    </div>
  );
}
