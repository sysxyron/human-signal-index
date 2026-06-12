'use client';

// =============================================================================
// HSI Phase 18 — OpportunityDecisionControl. The curator/admin governance action
// for a PROPOSED research opportunity: ACCEPT (spawns a run) or REJECT, each with
// an optional reason. Proposals never auto-act. Thin wrapper over
// decideOpportunityAction (role-gated server-side too). Demo is read-only.
// =============================================================================

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@hsi/ui';
import { Check, Loader2, Sparkles, X } from 'lucide-react';
import { SignInPrompt, SuccessNotice } from '@/components/worldforge/PersistenceUI';
import { ErrorState } from '@/components/signals/states';
import { formatErrorMessage } from '@/lib/errors/format-error';

type DbResultLike = { ok: true } | { ok: false; error: string };

export function OpportunityDecisionControl({
  opportunityId,
  status,
  action,
  canDecide,
  demo = false,
}: {
  opportunityId: string;
  status?: string;
  action: (id: string, decision: 'accepted' | 'rejected', reason?: string) => Promise<DbResultLike>;
  canDecide: boolean;
  demo?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (status && status !== 'proposed') {
    return <span className="text-caption text-text-muted">Already {status}.</span>;
  }
  if (demo) {
    return (
      <span className="inline-flex items-center gap-1.5 text-caption text-warning">
        <Sparkles className="h-3.5 w-3.5" /> Demo is read-only.
      </span>
    );
  }
  if (!canDecide) {
    return <SignInPrompt message="Sign in as a curator to triage opportunities" redirectedFrom={pathname} />;
  }

  const decide = (decision: 'accepted' | 'rejected') => {
    setError(null);
    setDone(null);
    startTransition(async () => {
      const res = await action(opportunityId, decision, reason.trim() || undefined);
      if (res.ok) {
        setDone(decision === 'accepted' ? 'Accepted — a research run was created.' : 'Rejected.');
        setReason('');
        router.refresh();
      } else {
        setError(formatErrorMessage(res.error));
      }
    });
  };

  return (
    <div className="space-y-2">
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (optional, logged)…"
        className="w-full rounded-card border border-border bg-surface px-3 py-1.5 text-caption text-text-primary placeholder:text-text-muted focus:border-electric focus:outline-none"
      />
      <div className="flex items-center gap-2">
        <Button variant="primary" size="sm" onClick={() => decide('accepted')} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Accept
        </Button>
        <Button variant="secondary" size="sm" onClick={() => decide('rejected')} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} Reject
        </Button>
      </div>
      {done ? <SuccessNotice message={done} /> : null}
      {error ? <ErrorState title="Could not record the decision" message={error} /> : null}
    </div>
  );
}
