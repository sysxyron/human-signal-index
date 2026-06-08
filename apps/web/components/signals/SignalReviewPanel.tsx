'use client';

// =============================================================================
// HSI Phase 7 — reviewer action panel for a signal detail page. Approve /
// Reject / Needs Research / Escalate + free-text notes via reviewSignalAction.
// Reviewer+ only; auth-gated; explainable (notes carried). Loading/error/success.
// =============================================================================

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button, Card, Textarea } from '@hsi/ui';
import { Check, X, Search, ArrowUpCircle, Gavel } from 'lucide-react';
import { reviewSignalAction } from '@/lib/signals/actions';
import type { HsinSignalDecision } from '@hsi/shared-types';
import { SignInPrompt, SuccessNotice } from '@/components/worldforge/PersistenceUI';
import { ErrorState } from './states';

const DECISIONS: {
  decision: HsinSignalDecision;
  label: string;
  icon: typeof Check;
  variant: 'primary' | 'secondary' | 'danger' | 'ghost';
}[] = [
  { decision: 'APPROVE', label: 'Approve', icon: Check, variant: 'primary' },
  { decision: 'REJECT', label: 'Reject', icon: X, variant: 'danger' },
  { decision: 'NEEDS_RESEARCH', label: 'Needs research', icon: Search, variant: 'secondary' },
  { decision: 'ESCALATE', label: 'Escalate', icon: ArrowUpCircle, variant: 'secondary' },
];

export function SignalReviewPanel({
  signalId,
  canReview,
  currentStatus,
  demo = false,
}: {
  signalId: string;
  canReview: boolean;
  currentStatus?: string;
  demo?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [notes, setNotes] = useState('');
  const [pending, startTransition] = useTransition();
  const [active, setActive] = useState<HsinSignalDecision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<HsinSignalDecision | null>(null);

  const submit = (decision: HsinSignalDecision) => {
    setError(null);
    setDone(null);
    setActive(decision);
    startTransition(async () => {
      const res = await reviewSignalAction(
        signalId,
        decision,
        notes.trim() || undefined,
      );
      setActive(null);
      if (res.ok) {
        setDone(decision);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <Card className="space-y-4" padded>
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <Gavel className="h-4 w-4 text-electric" /> Reviewer actions
        </h3>
        {currentStatus ? (
          <span className="text-caption text-text-muted">
            Current status: {currentStatus}
          </span>
        ) : null}
      </div>

      {demo ? (
        <p className="rounded-btn border border-warning/40 bg-warning/10 px-3 py-2 text-caption text-warning">
          Demo data is read-only — reviewer actions are disabled in the demo view.
        </p>
      ) : !canReview ? (
        <div className="space-y-2">
          <p className="text-caption text-text-secondary">
            Reviewing a signal records an auditable decision. Reviewer role
            required.
          </p>
          <SignInPrompt message="Sign in to review" redirectedFrom={pathname} />
        </div>
      ) : (
        <>
          <Textarea
            label="Review notes (recommended — decisions should be explainable)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Why this decision? Cite the signal content or watchlist match."
          />
          <div className="flex flex-wrap gap-2">
            {DECISIONS.map((d) => {
              const Icon = d.icon;
              return (
                <Button
                  key={d.decision}
                  variant={d.variant}
                  size="sm"
                  onClick={() => submit(d.decision)}
                  disabled={pending}
                >
                  <Icon className="h-4 w-4" />
                  {pending && active === d.decision ? 'Saving…' : d.label}
                </Button>
              );
            })}
          </div>
          {done ? (
            <SuccessNotice message={`Decision recorded: ${done}. Refreshing…`} />
          ) : null}
          {error ? (
            <ErrorState title="Could not record review" message={error} />
          ) : null}
        </>
      )}
    </Card>
  );
}
