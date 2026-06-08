'use client';

import { useState, useTransition } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@hsi/ui';
import { ClipboardCheck, ArrowRight } from 'lucide-react';
import { createReviewQueueAction } from '@/app/dashboard/review/actions';
import { roleAtLeast, type ReviewEntityType } from '@/lib/governance/view';
import { ErrorCard, SignInPrompt, SuccessNotice } from '@/components/worldforge/PersistenceUI';

/**
 * Submit an entity (e.g. a research_run) into the human-review queue via
 * createReviewQueueAction. Shown to researchers+ (role gate). Minimal additive
 * control with loading / success (link to the created queue item) / error /
 * auth / forbidden states.
 */
export function SubmitForReviewButton({
  entityType,
  entityId,
  role,
  isAuthenticated,
  className = '',
}: {
  entityType: ReviewEntityType;
  entityId: string;
  role: string | null;
  isAuthenticated: boolean;
  className?: string;
}) {
  const pathname = usePathname();
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [authExpired, setAuthExpired] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!isAuthenticated) {
    return (
      <div className={className}>
        <SignInPrompt message="Sign in to submit for review" redirectedFrom={pathname} />
      </div>
    );
  }

  const canSubmit = roleAtLeast(role, 'researcher');
  if (!canSubmit) {
    return (
      <p className={`text-caption text-text-muted ${className}`}>
        Submitting for review requires a researcher role or higher.
      </p>
    );
  }

  if (createdId) {
    return (
      <div className={`space-y-2 ${className}`}>
        <SuccessNotice message="Submitted to the human-review queue." />
        <Link
          href={`/dashboard/review/${createdId}`}
          className="inline-flex items-center gap-1 text-caption font-semibold text-electric hover:text-white"
        >
          Open review item <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    );
  }

  const submit = () => {
    setError(null);
    setForbidden(false);
    setAuthExpired(false);
    startTransition(async () => {
      const res = await createReviewQueueAction(entityType, entityId);
      if (res.ok) {
        setCreatedId(res.data.id);
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
    <div className={`space-y-2 ${className}`}>
      {error ? <ErrorCard message={error} title="Could not submit for review" /> : null}
      {forbidden ? (
        <ErrorCard title="Permission denied" message="Submitting requires a researcher role or higher." />
      ) : null}
      {authExpired ? (
        <SignInPrompt message="Sign in again" redirectedFrom={pathname} />
      ) : (
        <Button variant="secondary" onClick={submit} disabled={pending}>
          <ClipboardCheck className={`h-4 w-4 ${pending ? 'animate-pulse' : ''}`} />
          {pending ? 'Submitting…' : 'Submit for review'}
        </Button>
      )}
    </div>
  );
}
