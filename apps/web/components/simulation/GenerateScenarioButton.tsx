'use client';

// =============================================================================
// HSI Phase 12 — GenerateScenarioButton. Researcher+ control to materialize a
// WorldForge scenario from an existing counterfactual run
// (generateWorldforgeScenarioAction(counterfactualRunId)). Demo is read-only.
// useTransition; loading / error / auth / permission states; refreshes on
// success so the new scenario appears.
// =============================================================================

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@hsi/ui';
import { Globe2, Loader2, Sparkles } from 'lucide-react';
import { SignInPrompt, SuccessNotice } from '@/components/worldforge/PersistenceUI';
import { ErrorState } from '@/components/signals/states';
import { formatErrorMessage } from '@/lib/errors/format-error';

type GenResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string; code?: 'AUTH_REQUIRED' | 'FORBIDDEN' | 'NOT_CONFIGURED' | 'DB_ERROR' };

export function GenerateScenarioButton({
  counterfactualRunId,
  action,
  canGenerate,
  demo = false,
  size = 'sm',
}: {
  counterfactualRunId: string;
  action: (counterfactualRunId: string) => Promise<GenResult>;
  canGenerate: boolean;
  demo?: boolean;
  size?: 'sm' | 'md';
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [done, setDone] = useState(false);

  if (demo) {
    return (
      <span className="inline-flex items-center gap-1.5 text-caption text-warning">
        <Sparkles className="h-3.5 w-3.5" /> Demo is read-only — connect Supabase to
        generate scenarios.
      </span>
    );
  }

  if (!canGenerate) {
    return (
      <SignInPrompt
        message="Sign in as a researcher to generate a scenario"
        redirectedFrom={pathname}
      />
    );
  }

  const onClick = () => {
    setError(null);
    setDone(false);
    startTransition(async () => {
      const res = await action(counterfactualRunId);
      if (res.ok) {
        setDone(true);
        router.refresh();
      } else {
        setError({ message: formatErrorMessage(res.error), code: res.code });
      }
    });
  };

  return (
    <div className="space-y-1.5">
      <Button variant="secondary" size={size} onClick={onClick} disabled={pending}>
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Globe2 className="h-4 w-4" />
        )}
        {pending ? 'Generating…' : 'Generate WorldForge scenario'}
      </Button>
      {done ? <SuccessNotice message="Alternative-timeline scenario generated." /> : null}
      {error ? (
        <ErrorState
          title="Could not generate scenario"
          message={error.message}
          code={error.code as never}
          redirectedFrom={pathname}
        />
      ) : null}
    </div>
  );
}
