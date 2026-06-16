'use client';

// =============================================================================
// HSI Phase 41B — reviewer triage control for the signal submission queue.
// =============================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Select } from '@hsi/ui';
import { setSubmissionStatusAction } from '@/lib/signals/submission-actions';
import type { SignalSubmissionRecord } from '@/lib/signals/submission-persistence';

const STATUSES: SignalSubmissionRecord['status'][] = ['pending', 'reviewing', 'accepted', 'rejected'];

export function SubmissionStatusSelect({ id, current }: { id: string; current: SignalSubmissionRecord['status'] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-1">
      <Select value={current} disabled={pending} onChange={(e) => {
        setError(null);
        const next = e.target.value as SignalSubmissionRecord['status'];
        start(async () => {
          const res = await setSubmissionStatusAction(id, next);
          if (res.ok) router.refresh();
          else setError(res.error ?? 'Failed');
        });
      }}>
        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </Select>
      {error ? <span className="text-caption text-risk" title={error}>!</span> : null}
    </span>
  );
}
