'use client';

// =============================================================================
// HSI Phase 16 — TrustOverrideControl. Curator/admin-only control to manually
// OVERRIDE a computed trust score. A REASON is REQUIRED (the button is disabled
// until both a 0..100 score and a non-blank reason are supplied) — overrides are
// never silent. On submit it calls overrideTrustAction(entityType, entityId,
// newScore, reason); useTransition drives loading / error / success states. The
// control is explicit that overrides are LOGGED and shown on the entity. Demo is
// read-only; non-curators see a permission notice. Role is re-checked server-side.
// =============================================================================

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@hsi/ui';
import { Loader2, PencilLine, ShieldAlert } from 'lucide-react';
import type { TrustEntityType } from '@hsi/shared-types';
import { SignInPrompt, SuccessNotice } from '@/components/worldforge/PersistenceUI';
import { ErrorState } from '@/components/signals/states';
import { formatErrorMessage } from '@/lib/errors/format-error';

type DbResultLike = { ok: true } | { ok: false; error: string };

export function TrustOverrideControl({
  entityType,
  entityId,
  currentScore,
  action,
  canOverride,
  demo = false,
}: {
  entityType: TrustEntityType;
  entityId: string;
  currentScore: number;
  action: (
    entityType: TrustEntityType,
    entityId: string,
    newScore: number,
    reason: string,
  ) => Promise<DbResultLike>;
  canOverride: boolean;
  demo?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [score, setScore] = useState<string>(String(Math.round(currentScore)));
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const numericScore = Number(score);
  const scoreValid = Number.isFinite(numericScore) && numericScore >= 0 && numericScore <= 100;
  const reasonValid = reason.trim().length >= 3;
  const valid = scoreValid && reasonValid;

  if (demo) {
    return (
      <p className="text-caption text-warning">
        Demo is read-only — connect Supabase to override trust (curator / admin).
      </p>
    );
  }

  if (!canOverride) {
    return (
      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-caption text-text-muted">
          <ShieldAlert className="h-3.5 w-3.5 text-warning" />
          Overriding trust requires the curator or admin role.
        </p>
        <SignInPrompt message="Sign in as a curator to override" redirectedFrom={pathname} />
      </div>
    );
  }

  const onSubmit = () => {
    if (!valid) return;
    setError(null);
    setDone(false);
    startTransition(async () => {
      const res = await action(entityType, entityId, numericScore, reason.trim());
      if (res.ok) {
        setDone(true);
        router.refresh();
      } else {
        setError(formatErrorMessage(res.error));
      }
    });
  };

  return (
    <div className="space-y-3 rounded-card border border-warning/30 bg-warning/[0.05] p-3">
      <h4 className="flex items-center gap-2 text-caption font-semibold text-warning">
        <PencilLine className="h-4 w-4" /> Override trust score (curator / admin)
      </h4>
      <p className="text-caption leading-relaxed text-text-secondary">
        Manually set the trust score. A reason is required — every override is LOGGED
        with its author and reason, shown on this entity, and recorded in the score&apos;s
        limitations. It never silently replaces the computed signals.
      </p>

      <div className="space-y-2">
        <label className="block text-label text-text-muted" htmlFor="trust-override-score">
          New trust score (0–100)
        </label>
        <input
          id="trust-override-score"
          type="number"
          min={0}
          max={100}
          value={score}
          onChange={(e) => setScore(e.target.value)}
          disabled={pending}
          className="w-28 rounded-btn border border-border bg-surface px-2.5 py-1.5 text-body-sm text-text-primary outline-none focus:border-electric"
        />
        {!scoreValid ? (
          <p className="text-caption text-risk">Enter a number between 0 and 100.</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <label className="block text-label text-text-muted" htmlFor="trust-override-reason">
          Reason (required)
        </label>
        <textarea
          id="trust-override-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={pending}
          rows={3}
          placeholder="Why is this manual override warranted? This is logged and shown."
          className="w-full rounded-btn border border-border bg-surface px-2.5 py-1.5 text-body-sm text-text-primary outline-none focus:border-electric"
        />
        {!reasonValid && reason.length > 0 ? (
          <p className="text-caption text-risk">A reason of at least 3 characters is required.</p>
        ) : null}
      </div>

      <Button variant="secondary" size="sm" onClick={onSubmit} disabled={pending || !valid}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PencilLine className="h-4 w-4" />}
        {pending ? 'Applying override…' : 'Apply override'}
      </Button>

      {done ? (
        <SuccessNotice message="Trust override applied and logged with your reason." />
      ) : null}
      {error ? <ErrorState title="Could not apply override" message={error} /> : null}
    </div>
  );
}
