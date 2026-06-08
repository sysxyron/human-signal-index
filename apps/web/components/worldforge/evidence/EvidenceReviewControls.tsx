'use client';

import { useState, useTransition } from 'react';
import { usePathname } from 'next/navigation';
import { Button, Textarea } from '@hsi/ui';
import { Check, X, RotateCcw, FilePlus2 } from 'lucide-react';
import { reviewEvidenceAction } from '@/app/dashboard/worldforge/research/evidence-actions';
import type {
  EvidenceReviewStatus,
  UiReviewStatus,
} from '@/lib/worldforge/evidence-view';
import { normalizeQueueStatus } from '@/lib/worldforge/evidence-intel-view';
import { EvidenceStatusBadge } from './EvidenceStatusBadge';
import { SignInPrompt, ErrorCard } from '@/components/worldforge/PersistenceUI';

export interface EvidenceReviewControlsProps {
  evidenceSourceId: string;
  /** Current persisted status (defaults to 'pending'/'unreviewed'). */
  status: string;
  /** Whether the viewer may act (reviewers/admins). */
  canReview: boolean;
  /** Whether the viewer is signed in at all. */
  isAuthenticated: boolean;
  className?: string;
}

interface Action {
  value: EvidenceReviewStatus;
  label: string;
  icon: typeof Check;
  variant: 'primary' | 'danger' | 'secondary' | 'ghost';
}

// Maps directly to the spec verdicts:
//   Approve → validated, Reject → rejected,
//   Needs Review → pending, Needs More Sources → needs_more.
const ACTIONS: Action[] = [
  { value: 'validated', label: 'Approve', icon: Check, variant: 'primary' },
  { value: 'rejected', label: 'Reject', icon: X, variant: 'danger' },
  { value: 'pending', label: 'Needs Review', icon: RotateCcw, variant: 'ghost' },
  { value: 'needs_more', label: 'Needs More Sources', icon: FilePlus2, variant: 'secondary' },
];

/**
 * Per-row reviewer controls for the evidence review queue. Four verdict buttons
 * plus a notes textarea, calling reviewEvidenceAction in a transition with full
 * loading / error / auth states. Signed-out → sign-in prompt; non-reviewers →
 * read-only status only.
 */
export function EvidenceReviewControls({
  evidenceSourceId,
  status,
  canReview,
  isAuthenticated,
  className = '',
}: EvidenceReviewControlsProps) {
  const pathname = usePathname();
  const [current, setCurrent] = useState<UiReviewStatus>(
    normalizeQueueStatus(status),
  );
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [authExpired, setAuthExpired] = useState(false);
  const [savedAt, setSavedAt] = useState<EvidenceReviewStatus | null>(null);
  const [pending, startTransition] = useTransition();

  // Signed-out: prompt to sign in.
  if (!isAuthenticated) {
    return (
      <div className={`space-y-2 ${className}`}>
        <EvidenceStatusBadge status={current} />
        <SignInPrompt
          message="Sign in to review evidence"
          redirectedFrom={pathname}
        />
      </div>
    );
  }

  // Signed in but not a reviewer: read-only with a note.
  if (!canReview) {
    return (
      <div className={`space-y-1.5 ${className}`}>
        <EvidenceStatusBadge status={current} />
        <p className="text-[11px] text-text-muted">
          Read-only — reviewer or admin role required to change this verdict.
        </p>
      </div>
    );
  }

  const submit = (next: EvidenceReviewStatus) => {
    if (pending) return;
    setError(null);
    setSavedAt(null);
    const prev = current;
    setCurrent(normalizeQueueStatus(next));
    startTransition(async () => {
      const res = await reviewEvidenceAction(
        evidenceSourceId,
        next,
        notes.trim() || undefined,
      );
      if (res.ok) {
        setCurrent(normalizeQueueStatus((res.data.status as string) ?? next));
        setSavedAt(next);
      } else if (res.code === 'AUTH_REQUIRED') {
        setCurrent(prev);
        setAuthExpired(true);
      } else {
        setCurrent(prev);
        setError(res.error);
      }
    });
  };

  if (authExpired) {
    return (
      <div className={`space-y-2 ${className}`}>
        <EvidenceStatusBadge status={current} />
        <p className="text-[11px] text-text-muted">
          Your session expired. Sign in again to review.
        </p>
        <SignInPrompt message="Sign in to review" redirectedFrom={pathname} />
      </div>
    );
  }

  return (
    <div className={`space-y-2.5 ${className}`}>
      <div className="flex items-center gap-2">
        <EvidenceStatusBadge status={current} />
        {savedAt ? (
          <span className="text-[11px] font-medium text-verified">Saved</span>
        ) : null}
      </div>

      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Review notes (optional)…"
        rows={2}
        disabled={pending}
        className="text-caption"
      />

      <div className="flex flex-wrap gap-1.5">
        {ACTIONS.map((a) => {
          const Icon = a.icon;
          const active = current === a.value;
          return (
            <Button
              key={a.value}
              size="sm"
              variant={a.variant}
              disabled={pending}
              onClick={() => submit(a.value)}
              className={active ? 'ring-1 ring-electric/60' : ''}
              title={a.label}
            >
              <Icon className="h-3.5 w-3.5" />
              {a.label}
            </Button>
          );
        })}
      </div>

      {error ? <ErrorCard message={error} title="Review failed" /> : null}
    </div>
  );
}
