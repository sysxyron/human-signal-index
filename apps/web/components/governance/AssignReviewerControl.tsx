'use client';

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button, Card, Input } from '@hsi/ui';
import { UserPlus } from 'lucide-react';
import { assignReviewerAction } from '@/app/dashboard/review/actions';
import { roleAtLeast } from '@/lib/governance/view';
import { ErrorCard, SignInPrompt, SuccessNotice } from '@/components/worldforge/PersistenceUI';

/**
 * Curator/admin control to (re)assign a reviewer to a queue item via
 * assignReviewerAction. Accepts a reviewer id/email. useTransition with full
 * loading / success / error / auth / forbidden handling.
 */
export function AssignReviewerControl({
  queueId,
  role,
  isAuthenticated,
  currentReviewer,
}: {
  queueId: string;
  role: string | null;
  isAuthenticated: boolean;
  currentReviewer?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [reviewerId, setReviewerId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [authExpired, setAuthExpired] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canAssign = isAuthenticated && roleAtLeast(role, 'curator');
  if (!canAssign) return null;

  const submit = () => {
    if (!reviewerId.trim()) return;
    setError(null);
    setForbidden(false);
    setAuthExpired(false);
    setSuccess(null);
    startTransition(async () => {
      const res = await assignReviewerAction(queueId, reviewerId.trim());
      if (res.ok) {
        setSuccess(`Reviewer assigned.`);
        setReviewerId('');
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
    <Card className="space-y-3" padded>
      <div className="flex items-center gap-2">
        <UserPlus className="h-4 w-4 text-electric" />
        <h3 className="text-h6 font-semibold text-text-primary">Assign reviewer</h3>
      </div>
      {currentReviewer ? (
        <p className="text-caption text-text-muted">
          Currently assigned: <span className="text-text-secondary">{currentReviewer}</span>
        </p>
      ) : null}

      {success ? <SuccessNotice message={success} /> : null}
      {error ? <ErrorCard message={error} title="Could not assign reviewer" /> : null}
      {forbidden ? (
        <ErrorCard
          title="Permission denied"
          message="Assigning reviewers requires a curator role or higher."
        />
      ) : null}
      {authExpired ? (
        <SignInPrompt message="Sign in again" redirectedFrom={pathname} />
      ) : null}

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Input
            label="Reviewer id or email"
            value={reviewerId}
            placeholder="reviewer@example.com"
            onChange={(e) => setReviewerId(e.target.value)}
            disabled={pending}
          />
        </div>
        <Button onClick={submit} disabled={pending || !reviewerId.trim()}>
          {pending ? 'Assigning…' : 'Assign'}
        </Button>
      </div>
    </Card>
  );
}
