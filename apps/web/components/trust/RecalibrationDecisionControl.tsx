'use client';

// =============================================================================
// HSI Phase 17 — RecalibrationDecisionControl. The curator/admin governance
// action for a recalibration proposal: APPROVE or REJECT, each REQUIRING a
// non-blank reason. Approval applies the change (reversible + audited); rejection
// leaves the state unchanged. Thin wrapper over decideRecalibrationProposalAction
// (role-gated server-side too). Demo is read-only; non-curators see a prompt.
// =============================================================================

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@hsi/ui';
import { Check, Loader2, Sparkles, X } from 'lucide-react';
import { SignInPrompt, SuccessNotice } from '@/components/worldforge/PersistenceUI';
import { ErrorState } from '@/components/signals/states';
import { formatErrorMessage } from '@/lib/errors/format-error';

type DbResultLike = { ok: true } | { ok: false; error: string };

export function RecalibrationDecisionControl({
  proposalId,
  status,
  action,
  canDecide,
  demo = false,
}: {
  proposalId: string;
  status?: string;
  action: (
    id: string,
    decision: 'approved' | 'rejected',
    reason: string,
  ) => Promise<DbResultLike>;
  canDecide: boolean;
  demo?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (status && status !== 'pending') {
    return (
      <p className="text-caption text-text-muted">
        This proposal is already <span className="font-semibold">{status}</span> — no further
        decision is possible (decisions are append-only and auditable).
      </p>
    );
  }

  if (demo) {
    return (
      <span className="inline-flex items-center gap-1.5 text-caption text-warning">
        <Sparkles className="h-3.5 w-3.5" /> Demo is read-only — connect Supabase to decide proposals.
      </span>
    );
  }
  if (!canDecide) {
    return <SignInPrompt message="Sign in as a curator to decide recalibration proposals" redirectedFrom={pathname} />;
  }

  const decide = (decision: 'approved' | 'rejected') => {
    setError(null);
    setDone(null);
    if (reason.trim().length === 0) {
      setError('A decision requires a non-blank reason — every governance action is recorded.');
      return;
    }
    startTransition(async () => {
      const res = await action(proposalId, decision, reason.trim());
      if (res.ok) {
        setDone(decision === 'approved' ? 'Approved — change applied (reversible) and audited.' : 'Rejected — state unchanged and audited.');
        setReason('');
        router.refresh();
      } else {
        setError(formatErrorMessage(res.error));
      }
    });
  };

  return (
    <div className="space-y-3">
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason for this decision (required — it is logged and shown in the audit trail)…"
        rows={2}
        className="w-full resize-none rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary placeholder:text-text-muted focus:border-electric focus:outline-none"
      />
      <div className="flex items-center gap-2">
        <Button variant="primary" size="sm" onClick={() => decide('approved')} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Approve
        </Button>
        <Button variant="secondary" size="sm" onClick={() => decide('rejected')} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
          Reject
        </Button>
      </div>
      {done ? <SuccessNotice message={done} /> : null}
      {error ? <ErrorState title="Could not record the decision" message={error} /> : null}
    </div>
  );
}
