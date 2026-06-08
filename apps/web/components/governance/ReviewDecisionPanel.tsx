'use client';

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Card, Textarea } from '@hsi/ui';
import { Check, X, FileQuestion, ArrowUpCircle, Gavel } from 'lucide-react';
import { submitReviewDecisionAction } from '@/app/dashboard/review/actions';
import {
  DECISIONS,
  decisionStyle,
  roleAtLeast,
  type ReviewDecisionType,
} from '@/lib/governance/view';
import { ErrorCard, SignInPrompt, SuccessNotice } from '@/components/worldforge/PersistenceUI';

const ICONS: Record<ReviewDecisionType, typeof Check> = {
  APPROVE: Check,
  REJECT: X,
  NEEDS_EVIDENCE: FileQuestion,
  ESCALATE: ArrowUpCircle,
};

/**
 * Reviewer action panel (reviewer+ role). Four verdicts — Approve / Reject /
 * Request more evidence / Escalate — plus a notes textarea, submitted via
 * submitReviewDecisionAction in a transition. Full loading / success / error /
 * auth / forbidden handling. On success it refreshes the route so the new
 * decision + status appear.
 */
export function ReviewDecisionPanel({
  queueId,
  role,
  isAuthenticated,
}: {
  queueId: string;
  role: string | null;
  isAuthenticated: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [notes, setNotes] = useState('');
  const [selected, setSelected] = useState<ReviewDecisionType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [authExpired, setAuthExpired] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canReview = isAuthenticated && roleAtLeast(role, 'reviewer');

  if (!isAuthenticated) {
    return (
      <Card className="space-y-2 border-electric/40 bg-electric/5" padded>
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-electric">
          <Gavel className="h-4 w-4" /> Sign in to review
        </h3>
        <p className="text-caption text-text-secondary">
          Recording a verdict requires a reviewer account.
        </p>
        <SignInPrompt message="Sign in to review" redirectedFrom={pathname} />
      </Card>
    );
  }

  if (!canReview) {
    return (
      <Card className="space-y-1.5 border-warning/40 bg-warning/5" padded>
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-warning">
          <Gavel className="h-4 w-4" /> Read-only access
        </h3>
        <p className="text-caption text-text-secondary">
          You don&apos;t have permission to record review decisions. This requires
          a <strong>reviewer</strong> role or higher.
        </p>
      </Card>
    );
  }

  const submit = (decision: ReviewDecisionType) => {
    setError(null);
    setForbidden(false);
    setAuthExpired(false);
    setSuccess(null);
    setSelected(decision);
    startTransition(async () => {
      const res = await submitReviewDecisionAction(queueId, decision, notes.trim() || undefined);
      if (res.ok) {
        setSuccess(`Decision recorded: ${decisionStyle(decision).label}.`);
        setNotes('');
        setSelected(null);
        router.refresh();
      } else if (res.code === 'AUTH_REQUIRED') {
        setAuthExpired(true);
      } else if (res.code === 'FORBIDDEN') {
        setForbidden(true);
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <Card className="space-y-4" padded>
      <div className="flex items-center gap-2">
        <Gavel className="h-4 w-4 text-electric" />
        <h3 className="text-h6 font-semibold text-text-primary">Reviewer decision</h3>
      </div>

      {success ? <SuccessNotice message={success} /> : null}
      {error ? <ErrorCard message={error} title="Could not record decision" /> : null}
      {forbidden ? (
        <ErrorCard
          title="Permission denied"
          message="You don't have permission to record this decision (reviewer role required)."
        />
      ) : null}
      {authExpired ? (
        <div className="space-y-2">
          <p className="text-caption text-text-secondary">
            Your session expired. Sign in again to record a decision.
          </p>
          <SignInPrompt message="Sign in again" redirectedFrom={pathname} />
        </div>
      ) : null}

      <Textarea
        label="Review notes (recorded with the decision)"
        rows={3}
        value={notes}
        placeholder="Explain your reasoning — cited evidence, contradictions, what is needed…"
        onChange={(e) => setNotes(e.target.value)}
        disabled={pending}
      />

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {DECISIONS.map((d) => {
          const Icon = ICONS[d.value];
          const s = decisionStyle(d.value);
          const isPending = pending && selected === d.value;
          return (
            <button
              key={d.value}
              type="button"
              disabled={pending}
              onClick={() => submit(d.value)}
              title={d.help}
              className="flex items-center gap-2 rounded-btn border px-3.5 py-2.5 text-left text-sm font-semibold transition hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundColor: s.soft, color: s.color, borderColor: s.border }}
            >
              <Icon className={`h-4 w-4 ${isPending ? 'animate-pulse' : ''}`} />
              {isPending ? 'Recording…' : d.label}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-text-muted">
        Decisions are immutable and recorded with your reviewer identity. Escalations
        and rejections are never hidden — they remain visible in the audit trail.
      </p>
    </Card>
  );
}
