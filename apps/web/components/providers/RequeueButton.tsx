'use client';

// =============================================================================
// HSI Phase 9 — RequeueButton. Curator+ re-drives a dead-lettered job back onto
// the live queue via requeueDeadLetterAction. useTransition; full loading / error
// / success states. Demo is read-only. Auth/permission gated server-side too.
// =============================================================================

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@hsi/ui';
import { RotateCw, Loader2, Check } from 'lucide-react';
import { requeueDeadLetterAction } from '@/lib/operations/actions';
import { SignInPrompt } from '@/components/worldforge/PersistenceUI';
import { formatErrorMessage } from '@/lib/errors/format-error';

export function RequeueButton({
  jobId,
  canRequeue,
  demo = false,
}: {
  jobId: string;
  canRequeue: boolean;
  demo?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (demo) {
    return (
      <Button variant="secondary" size="sm" disabled title="Demo data is read-only">
        <RotateCw className="h-3.5 w-3.5" /> Requeue
      </Button>
    );
  }

  if (!canRequeue) {
    return (
      <SignInPrompt message="Sign in as a curator to requeue" redirectedFrom={pathname} />
    );
  }

  if (done) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-btn border border-verified/40 bg-verified/10 px-2.5 py-1.5 text-caption font-semibold text-verified">
        <Check className="h-3.5 w-3.5" /> Requeued
      </span>
    );
  }

  const onClick = () => {
    setError(null);
    startTransition(async () => {
      const res = await requeueDeadLetterAction(jobId);
      if (res.ok) {
        setDone(true);
        router.refresh();
      } else {
        setError(formatErrorMessage(res.error));
      }
    });
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <Button variant="secondary" size="sm" onClick={onClick} disabled={pending}>
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
        {pending ? 'Requeuing…' : 'Requeue'}
      </Button>
      {error ? <span className="max-w-[220px] text-[11px] text-risk">{error}</span> : null}
    </div>
  );
}
