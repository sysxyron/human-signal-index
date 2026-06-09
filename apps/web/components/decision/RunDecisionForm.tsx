'use client';

// =============================================================================
// HSI Phase 13 — RunDecisionForm. Researcher+ control to generate a NEW decision
// run: pick a narrative → runDecisionAction(narrativeId). On success it navigates
// to the decision run view. Demo is read-only. useTransition; loading / error /
// auth / permission states. The output is framed honestly as a decision AID.
// =============================================================================

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button, Select } from '@hsi/ui';
import { Target, Loader2, Sparkles } from 'lucide-react';
import type { HsinNarrativeRecord } from '@hsi/shared-types';
import type { DecisionRun } from '@hsi/decision-intelligence';
import { SignInPrompt } from '@/components/worldforge/PersistenceUI';
import { ErrorState } from '@/components/signals/states';
import { formatErrorMessage } from '@/lib/errors/format-error';

type DbErrorCode = 'AUTH_REQUIRED' | 'FORBIDDEN' | 'NOT_CONFIGURED' | 'DB_ERROR';

type RunResult =
  | { ok: true; data: { decisionRunId: string; run: DecisionRun } }
  | { ok: false; error: string; code?: DbErrorCode };

export function RunDecisionForm({
  narratives,
  action,
  canRun,
  demo = false,
}: {
  narratives: HsinNarrativeRecord[];
  action: (narrativeId: string) => Promise<RunResult>;
  canRun: boolean;
  demo?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [narrativeId, setNarrativeId] = useState(narratives[0]?.id ?? '');
  const [error, setError] = useState<{ message: string; code?: DbErrorCode } | null>(
    null,
  );

  if (demo) {
    return (
      <div className="flex items-center gap-1.5 text-caption text-warning">
        <Sparkles className="h-3.5 w-3.5" /> Demo is read-only — connect Supabase to
        generate decision runs.
      </div>
    );
  }

  if (!canRun) {
    return (
      <SignInPrompt
        message="Sign in as a researcher to generate a decision"
        redirectedFrom={pathname}
      />
    );
  }

  const onSubmit = () => {
    if (!narrativeId) {
      setError({ message: 'Pick a narrative to generate a decision for.' });
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await action(narrativeId);
      if (res.ok) {
        router.push(
          `/dashboard/intelligence/decisions?runId=${encodeURIComponent(res.data.decisionRunId)}` as never,
        );
        router.refresh();
      } else {
        setError({ message: formatErrorMessage(res.error), code: res.code });
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label="Narrative"
          value={narrativeId}
          onChange={(e) => setNarrativeId(e.target.value)}
          disabled={pending}
        >
          {narratives.length === 0 ? (
            <option value="">No narratives available</option>
          ) : (
            narratives.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))
          )}
        </Select>
        <div className="flex items-end">
          <Button
            variant="primary"
            size="sm"
            onClick={onSubmit}
            disabled={pending || !narrativeId}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Target className="h-4 w-4" />
            )}
            {pending ? 'Generating decision…' : 'Generate recommendation'}
          </Button>
        </div>
      </div>

      <p className="text-caption text-text-muted">
        Produces a recommended action with a confidence band, a reasoning trail,
        explicit limitations, and a full audit — an aid for a human reviewer, never a
        command.
      </p>

      {error ? (
        <ErrorState
          title="Could not generate decision"
          message={error.message}
          code={error.code}
          redirectedFrom={pathname}
        />
      ) : null}
    </div>
  );
}
