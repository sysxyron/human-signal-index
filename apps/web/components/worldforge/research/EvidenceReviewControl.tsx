'use client';

import { useState, useTransition } from 'react';
import { usePathname } from 'next/navigation';
import { reviewEvidenceAction } from '@/app/dashboard/worldforge/research/evidence-actions';
import {
  reviewStatusStyle,
  REVIEW_STATUS_ICON,
  type EvidenceReviewStatus,
  type UiReviewStatus,
} from '@/lib/worldforge/evidence-view';
import { SignInPrompt } from '@/components/worldforge/PersistenceUI';

export interface EvidenceReviewControlProps {
  evidenceSourceId: string;
  /** Current persisted reviewer status (defaults to 'unreviewed'). */
  status: UiReviewStatus;
  /** Whether the viewer may take a reviewer action. */
  canReview: boolean;
  className?: string;
}

/** The reviewer verdicts a curator may set (canonical EvidenceReviewStatus). */
const REVIEW_OPTIONS: { value: EvidenceReviewStatus; label: string }[] = [
  { value: 'validated', label: 'Validate' },
  { value: 'rejected', label: 'Reject' },
  { value: 'needs_more', label: 'More' },
];

export function EvidenceReviewControl({
  evidenceSourceId,
  status,
  canReview,
  className = '',
}: EvidenceReviewControlProps) {
  const pathname = usePathname();
  const [current, setCurrent] = useState<UiReviewStatus>(status);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const s = reviewStatusStyle(current);
  const Icon = REVIEW_STATUS_ICON[current] ?? REVIEW_STATUS_ICON.unreviewed;

  const chip = (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ backgroundColor: s.soft, color: s.color, border: `1px solid ${s.border}` }}
      title={`Reviewer status: ${s.label}`}
    >
      <Icon className="h-3 w-3" />
      {s.label}
    </span>
  );

  // Role unknown / not a reviewer → just show the status (per spec).
  if (!canReview) {
    return <span className={className}>{chip}</span>;
  }

  const onSelect = (next: EvidenceReviewStatus) => {
    if (next === current || pending) return;
    setError(null);
    const prev = current;
    setCurrent(next);
    startTransition(async () => {
      const res = await reviewEvidenceAction(evidenceSourceId, next);
      if (res.ok) {
        setCurrent((res.data.status as UiReviewStatus) ?? next);
      } else if (res.code === 'AUTH_REQUIRED') {
        setCurrent(prev);
        setError('auth');
      } else {
        setCurrent(prev);
        setError(res.error);
      }
    });
  };

  if (error === 'auth') {
    return (
      <span className={className}>
        <SignInPrompt message="Sign in to review" redirectedFrom={pathname} />
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {chip}
      <span className="inline-flex overflow-hidden rounded-full border border-border">
        {REVIEW_OPTIONS.map((opt) => {
          const os = reviewStatusStyle(opt.value);
          const active = current === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={pending}
              onClick={() => onSelect(opt.value)}
              className="px-2 py-0.5 text-[10px] font-semibold transition disabled:opacity-50"
              style={{
                backgroundColor: active ? os.soft : 'transparent',
                color: active ? os.color : '#94A3B8',
              }}
              title={`Mark ${os.label.toLowerCase()}`}
            >
              {opt.label}
            </button>
          );
        })}
      </span>
      {error && error !== 'auth' ? (
        <span className="text-[10px] text-risk" title={error}>
          failed
        </span>
      ) : null}
    </span>
  );
}
