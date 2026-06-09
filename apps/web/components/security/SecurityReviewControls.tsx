'use client';

// =============================================================================
// HSI Phase 14 — SecurityReviewControls (optional admin). Lets an admin triage a
// security signal: set a review status + notes via upsertSecurityReviewAction in
// a transition. Surfaces DbResult errors (AUTH_REQUIRED → sign-in, FORBIDDEN →
// permission). No server-only imports.
// =============================================================================

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button, Card } from '@hsi/ui';
import { Check, ClipboardCheck } from 'lucide-react';
import type { SecurityReviewStatus } from '@hsi/shared-types';
import { upsertSecurityReviewAction } from '@/lib/security/actions';
import { ErrorState, type DbErrorCode } from '@/components/signals/states';

const STATUSES: SecurityReviewStatus[] = ['open', 'reviewed', 'dismissed', 'escalated'];

export function SecurityReviewControls({
  canReview,
  demo = false,
  defaultEventType,
  defaultRoute,
  reviewId,
}: {
  canReview: boolean;
  demo?: boolean;
  defaultEventType?: string;
  defaultRoute?: string;
  reviewId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<SecurityReviewStatus>('reviewed');
  const [notes, setNotes] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<{ message: string; code?: DbErrorCode } | null>(
    null,
  );

  const disabled = demo || !canReview;

  const onSubmit = () => {
    setError(null);
    setDone(false);
    startTransition(async () => {
      try {
        const res = await upsertSecurityReviewAction({
          id: reviewId,
          eventType: defaultEventType,
          route: defaultRoute,
          status,
          notes: notes.trim() || undefined,
        });
        if (res.ok) {
          setDone(true);
          setNotes('');
          router.refresh();
        } else {
          setError({ message: res.error, code: res.code });
        }
      } catch (e) {
        setError({ message: e instanceof Error ? e.message : String(e) });
      }
    });
  };

  return (
    <Card className="space-y-3" padded>
      <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
        <ClipboardCheck className="h-4 w-4 text-electric" /> Triage review
      </h3>
      <p className="text-caption text-text-muted">
        Record a triage decision over the security signals. Admin only.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-caption text-text-muted">
          Status
          <select
            value={status}
            disabled={disabled || pending}
            onChange={(e) => setStatus(e.target.value as SecurityReviewStatus)}
            className="rounded-btn border border-border bg-surface-2 px-3 py-1.5 text-body-sm text-text-primary disabled:opacity-50"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-caption text-text-muted">
          Notes
          <input
            type="text"
            value={notes}
            disabled={disabled || pending}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional triage notes"
            className="rounded-btn border border-border bg-surface-2 px-3 py-1.5 text-body-sm text-text-primary placeholder:text-text-muted disabled:opacity-50"
          />
        </label>
        <Button variant="primary" size="sm" onClick={onSubmit} disabled={disabled || pending}>
          {done ? <Check className="h-4 w-4 text-verified" /> : null}
          {pending ? 'Saving…' : done ? 'Saved' : 'Save review'}
        </Button>
      </div>

      {demo ? (
        <p className="text-caption text-warning">Demo data is read-only.</p>
      ) : !canReview ? (
        <p className="text-caption text-warning">
          Your role does not permit recording security reviews.
        </p>
      ) : null}

      {error ? (
        <ErrorState
          title="Could not save review"
          message={error.message}
          code={error.code}
          redirectedFrom={pathname}
        />
      ) : null}
    </Card>
  );
}
