'use client';

// =============================================================================
// HSI Phase 22 — executive governance client controls:
//   QueueReviewControl  — curator+ queue a strategic priority for executive review.
//   DecideReviewControl — curator+ approve / reject / archive a queued review
//                         (reviewer + reason REQUIRED; every decision reversible).
// Thin wrappers over the role-gated server actions. Demo is read-only. NEVER
// auto-approves, auto-acts, or auto-governs — every decision is a human decision.
// =============================================================================

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@hsi/ui';
import { Check, X, Archive, Loader2, Gavel, Sparkles } from 'lucide-react';
import { SignInPrompt, SuccessNotice } from '@/components/worldforge/PersistenceUI';
import { ErrorState } from '@/components/signals/states';
import { formatErrorMessage } from '@/lib/errors/format-error';

type DbResultLike = { ok: true } | { ok: false; error: string };

function Gate({ demo, canAct, what, children }: { demo: boolean; canAct: boolean; what: string; children: React.ReactNode }) {
  const pathname = usePathname();
  if (demo) return <span className="inline-flex items-center gap-1.5 text-caption text-warning"><Sparkles className="h-3.5 w-3.5" /> Demo is read-only.</span>;
  if (!canAct) return <SignInPrompt message={`Sign in as a curator to ${what}`} redirectedFrom={pathname} />;
  return <>{children}</>;
}

export function QueueReviewControl({
  priorityId, action, canAct, demo = false,
}: {
  priorityId: string;
  action: (priorityId: string) => Promise<DbResultLike>;
  canAct: boolean;
  demo?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  return (
    <Gate demo={demo} canAct={canAct} what="queue an executive review">
      <div className="flex flex-col items-start gap-1.5">
        <Button variant="secondary" size="sm" disabled={pending} onClick={() => {
          setError(null); setDone(false);
          start(async () => {
            const res = await action(priorityId);
            if (res.ok) { setDone(true); router.refresh(); } else setError(formatErrorMessage(res.error));
          });
        }}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gavel className="h-4 w-4" />} Queue for review
        </Button>
        {done ? <SuccessNotice message="Queued for executive review." /> : null}
        {error ? <ErrorState title="Could not queue" message={error} /> : null}
      </div>
    </Gate>
  );
}

export function DecideReviewControl({
  reviewId, action, canAct, demo = false,
}: {
  reviewId: string;
  action: (reviewId: string, decision: 'approved' | 'rejected' | 'archived', reviewer: string, reason: string) => Promise<DbResultLike>;
  canAct: boolean;
  demo?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reviewer, setReviewer] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const decide = (decision: 'approved' | 'rejected' | 'archived') => {
    setError(null); setDone(null);
    if (reviewer.trim().length === 0) { setError('An identified reviewer is required.'); return; }
    if (reason.trim().length === 0) { setError('A non-blank reason is required.'); return; }
    start(async () => {
      const res = await action(reviewId, decision, reviewer.trim(), reason.trim());
      if (res.ok) { setDone(`Decision recorded: ${decision}. Reversible.`); setReason(''); router.refresh(); }
      else setError(formatErrorMessage(res.error));
    });
  };

  return (
    <Gate demo={demo} canAct={canAct} what="decide an executive review">
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <input value={reviewer} onChange={(e) => setReviewer(e.target.value)} placeholder="Reviewer (you)…"
            className="min-w-[140px] flex-1 rounded-card border border-border bg-surface px-3 py-1.5 text-caption text-text-primary placeholder:text-text-muted focus:border-electric focus:outline-none" />
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required, logged)…"
            className="min-w-[200px] flex-[2] rounded-card border border-border bg-surface px-3 py-1.5 text-caption text-text-primary placeholder:text-text-muted focus:border-electric focus:outline-none" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" size="sm" onClick={() => decide('approved')} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve
          </Button>
          <Button variant="danger" size="sm" onClick={() => decide('rejected')} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} Reject
          </Button>
          <Button variant="ghost" size="sm" onClick={() => decide('archived')} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />} Archive
          </Button>
        </div>
        {done ? <SuccessNotice message={done} /> : null}
        {error ? <ErrorState title="Could not record decision" message={error} /> : null}
      </div>
    </Gate>
  );
}
