'use client';

// =============================================================================
// HSI Phase 16 — RecomputeCalibrationButton + RecomputeTrustButton. Curator/admin
// controls that re-run the calibration / trust computation over the recorded
// history. Thin wrappers over recomputeCalibrationAction / recomputeTrustAction
// (role-gated server-side too). useTransition; loading / error / success states.
// Demo is read-only; non-curators see a sign-in prompt. Shared implementation.
// =============================================================================

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@hsi/ui';
import { Gauge, Loader2, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { SignInPrompt, SuccessNotice } from '@/components/worldforge/PersistenceUI';
import { ErrorState } from '@/components/signals/states';
import { formatErrorMessage } from '@/lib/errors/format-error';

type DbResultLike = { ok: true } | { ok: false; error: string };

function RecomputeButton({
  action,
  canRecompute,
  demo,
  label,
  pendingLabel,
  successMessage,
  icon: Icon,
}: {
  action: () => Promise<DbResultLike>;
  canRecompute: boolean;
  demo: boolean;
  label: string;
  pendingLabel: string;
  successMessage: string;
  icon: typeof Gauge;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (demo) {
    return (
      <span className="inline-flex items-center gap-1.5 text-caption text-warning">
        <Sparkles className="h-3.5 w-3.5" /> Demo is read-only — connect Supabase to {label.toLowerCase()}.
      </span>
    );
  }

  if (!canRecompute) {
    return (
      <SignInPrompt
        message={`Sign in as a curator to ${label.toLowerCase()}`}
        redirectedFrom={pathname}
      />
    );
  }

  const onClick = () => {
    setError(null);
    setDone(false);
    startTransition(async () => {
      const res = await action();
      if (res.ok) {
        setDone(true);
        router.refresh();
      } else {
        setError(formatErrorMessage(res.error));
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button variant="secondary" size="sm" onClick={onClick} disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
        {pending ? pendingLabel : label}
      </Button>
      {done ? <SuccessNotice message={successMessage} /> : null}
      {error ? <ErrorState title={`Could not ${label.toLowerCase()}`} message={error} /> : null}
    </div>
  );
}

export function RecomputeCalibrationButton({
  action,
  canRecompute,
  demo = false,
}: {
  action: () => Promise<DbResultLike>;
  canRecompute: boolean;
  demo?: boolean;
}) {
  return (
    <RecomputeButton
      action={action}
      canRecompute={canRecompute}
      demo={demo}
      label="Recompute calibration"
      pendingLabel="Recomputing…"
      successMessage="Calibration recomputed — reliability, Brier, and drift refreshed."
      icon={Gauge}
    />
  );
}

export function RecomputeTrustButton({
  action,
  canRecompute,
  demo = false,
}: {
  action: () => Promise<DbResultLike>;
  canRecompute: boolean;
  demo?: boolean;
}) {
  return (
    <RecomputeButton
      action={action}
      canRecompute={canRecompute}
      demo={demo}
      label="Recompute trust"
      pendingLabel="Recomputing…"
      successMessage="Trust recomputed across all tracked entities."
      icon={ShieldCheck}
    />
  );
}

/** Re-exported generic refresh icon so callers can reuse the aesthetic. */
export { RefreshCw };
