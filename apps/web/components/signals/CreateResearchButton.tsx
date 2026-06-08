'use client';

// =============================================================================
// HSI Phase 7 — "Create Research Run" control. Spawns a WorldForge research run
// from a signal via createResearchFromSignalAction, then links to the new run.
// Researcher+ only; auth-gated; full loading / error / success states.
// =============================================================================

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@hsi/ui';
import { FlaskConical, ArrowRight } from 'lucide-react';
import { createResearchFromSignalAction } from '@/lib/signals/actions';
import { SignInPrompt } from '@/components/worldforge/PersistenceUI';
import { ErrorState } from './states';

export function CreateResearchButton({
  signalId,
  canCreate,
  demo = false,
  prominent = false,
  size = 'sm',
}: {
  signalId: string;
  canCreate: boolean;
  demo?: boolean;
  /** Larger primary styling for the signal-detail hero button. */
  prominent?: boolean;
  size?: 'sm' | 'md';
}) {
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);

  if (demo) {
    return (
      <Button
        variant={prominent ? 'primary' : 'secondary'}
        size={prominent ? 'md' : size}
        disabled
        title="Demo data is read-only — start with live data to create a research run"
      >
        <FlaskConical className="h-4 w-4" /> Create Research Run
      </Button>
    );
  }

  if (runId) {
    return (
      <Link
        href={`/dashboard/worldforge/research/${runId}` as never}
        className="inline-flex items-center gap-2 rounded-btn border border-verified/50 bg-verified/10 px-3.5 py-2 text-caption font-semibold text-verified transition hover:border-verified hover:text-white"
      >
        Research run created — open
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    );
  }

  if (!canCreate) {
    return (
      <SignInPrompt
        message="Sign in to create a research run"
        redirectedFrom={pathname}
      />
    );
  }

  const onClick = () => {
    setError(null);
    startTransition(async () => {
      const res = await createResearchFromSignalAction(signalId);
      if (res.ok) {
        // Action returns the new research run id (string) or a {id} shape.
        const id =
          typeof res.data === 'string'
            ? res.data
            : ((res.data as { id?: string } | null)?.id ?? null);
        setRunId(id);
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <div className="space-y-1.5">
      <Button
        variant={prominent ? 'primary' : 'secondary'}
        size={prominent ? 'md' : size}
        onClick={onClick}
        disabled={pending}
      >
        <FlaskConical className="h-4 w-4" />
        {pending ? 'Creating run…' : 'Create Research Run'}
      </Button>
      {error ? (
        <ErrorState title="Could not create research run" message={error} />
      ) : null}
    </div>
  );
}
