'use client';

// =============================================================================
// HSI Phase 15 — GovernanceReviewControls. Reviewer+ (reviewer / curator / admin)
// controls for the governance workflow over one outcome: Validate / Approve /
// Reject / Escalate with optional notes → reviewOutcomeAction(outcomeId, decision,
// notes). useTransition; loading / error / auth / permission states. Validation is
// re-gated server-side via getSessionRole — non-authorised users see a read-only
// permission notice instead of the action buttons. NOT an auto-action: a human
// makes the call.
// =============================================================================

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button, Textarea, cn } from '@hsi/ui';
import { Loader2, Sparkles, ShieldCheck, ShieldX } from 'lucide-react';
import { SignInPrompt, SuccessNotice } from '@/components/worldforge/PersistenceUI';
import { ErrorState } from '@/components/signals/states';
import { formatErrorMessage } from '@/lib/errors/format-error';
import { GOVERNANCE_ACTIONS } from '@/lib/outcome/view';

type DbErrorCode = 'AUTH_REQUIRED' | 'FORBIDDEN' | 'NOT_CONFIGURED' | 'DB_ERROR';

/** Mirror of GovernanceDecision (client-local, no server import). */
type ReviewDecision = 'pending' | 'approved' | 'rejected' | 'escalated' | 'validated';

type ReviewResult =
  | { ok: true }
  | { ok: false; error: string; code?: DbErrorCode };

export function GovernanceReviewControls({
  outcomeId,
  action,
  canReview,
  authenticated,
  demo = false,
}: {
  outcomeId: string;
  action: (
    outcomeId: string,
    decision: ReviewDecision,
    notes?: string,
  ) => Promise<ReviewResult>;
  canReview: boolean;
  authenticated: boolean;
  demo?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState<ReviewDecision | null>(null);
  const [error, setError] = useState<{ message: string; code?: DbErrorCode } | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (demo) {
    return (
      <p className="flex items-center gap-1.5 text-caption text-warning">
        <Sparkles className="h-3.5 w-3.5" /> Demo is read-only — connect Supabase to run
        the governance workflow.
      </p>
    );
  }

  if (!authenticated) {
    return (
      <SignInPrompt
        message="Sign in as a reviewer to action this outcome"
        redirectedFrom={pathname}
      />
    );
  }

  if (!canReview) {
    return (
      <div className="flex items-start gap-2 rounded-card border border-warning/40 bg-warning/5 px-3 py-2.5 text-caption text-warning">
        <ShieldX className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Read-only — governance validation requires a reviewer, curator, or admin
          role. You can view the queue and review history but cannot record a verdict.
        </span>
      </div>
    );
  }

  const submit = (decision: ReviewDecision) => {
    setError(null);
    setDone(null);
    setBusy(decision);
    startTransition(async () => {
      const res = await action(outcomeId, decision, notes.trim() || undefined);
      setBusy(null);
      if (res.ok) {
        setDone(decision);
        setNotes('');
        router.refresh();
      } else {
        setError({ message: formatErrorMessage(res.error), code: res.code });
      }
    });
  };

  return (
    <div className="space-y-2.5">
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Review notes (optional) — recorded with your verdict."
        rows={2}
        disabled={pending}
      />
      <div className="flex flex-wrap items-center gap-2">
        {GOVERNANCE_ACTIONS.map(({ decision, decor }) => {
          const isBusy = pending && busy === decision;
          return (
            <button
              key={decision}
              type="button"
              onClick={() => submit(decision)}
              disabled={pending}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-btn border px-3 py-1.5 text-caption font-semibold transition disabled:opacity-50',
              )}
              style={{
                backgroundColor: `${decor.color}1f`,
                color: decor.color,
                borderColor: `${decor.color}55`,
              }}
              title={decor.description}
            >
              {isBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : decision === 'validated' ? (
                <ShieldCheck className="h-3.5 w-3.5" />
              ) : null}
              {decor.label}
            </button>
          );
        })}
      </div>
      {done ? (
        <SuccessNotice message={`Outcome marked ${done} — recorded in the review history.`} />
      ) : null}
      {error ? (
        <ErrorState
          title="Could not record review"
          message={error.message}
          code={error.code}
          redirectedFrom={pathname}
        />
      ) : null}
    </div>
  );
}

export type { ReviewDecision };
