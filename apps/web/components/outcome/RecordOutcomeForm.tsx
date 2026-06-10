'use client';

// =============================================================================
// HSI Phase 15 — RecordOutcomeForm. Reviewer+ control to record the OBSERVED
// outcome of a past recommendation: pick a decision run + recommendation id, enter
// the observed metrics (signal delta %, amplification delta, optional forecast
// state), then recordOutcomeAction(decisionRunId, recommendationId, observed) →
// on success navigate to the new outcome's detail + audit trail. Demo is read-only.
// useTransition; loading / error / auth / permission states. The output is framed
// honestly as an outcome verdict (success + confidence + explanation), never a
// certainty. Role is re-checked server-side.
// =============================================================================

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button, Input, Select } from '@hsi/ui';
import { ClipboardCheck, Loader2, Sparkles } from 'lucide-react';
import { SignInPrompt } from '@/components/worldforge/PersistenceUI';
import { ErrorState } from '@/components/signals/states';
import { formatErrorMessage } from '@/lib/errors/format-error';

type DbErrorCode = 'AUTH_REQUIRED' | 'FORBIDDEN' | 'NOT_CONFIGURED' | 'DB_ERROR';

/** What the caller observed after the recommendation was followed. */
export interface ObservedInput {
  signalDeltaPct?: number;
  amplificationDelta?: number;
  forecastState?: string;
  capturedAt: string;
}

type RecordResult =
  | { ok: true; data: { outcomeId: string } }
  | { ok: false; error: string; code?: DbErrorCode };

/** A pickable recommendation (from recent decision runs / demo fixtures). */
export interface RecommendationOption {
  recommendationId: string;
  decisionRunId: string;
  action: string;
  interventionType?: string;
}

export function RecordOutcomeForm({
  options,
  action,
  canRecord,
  demo = false,
}: {
  options: RecommendationOption[];
  action: (
    decisionRunId: string,
    recommendationId: string,
    observed: ObservedInput,
  ) => Promise<RecordResult>;
  canRecord: boolean;
  demo?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [recId, setRecId] = useState(options[0]?.recommendationId ?? '');
  const [runId, setRunId] = useState('');
  const [signalDelta, setSignalDelta] = useState('');
  const [ampDelta, setAmpDelta] = useState('');
  const [forecast, setForecast] = useState('');
  const [error, setError] = useState<{ message: string; code?: DbErrorCode } | null>(null);

  if (demo) {
    return (
      <div className="flex items-center gap-1.5 text-caption text-warning">
        <Sparkles className="h-3.5 w-3.5" /> Demo is read-only — connect Supabase to
        record observed outcomes.
      </div>
    );
  }

  if (!canRecord) {
    return (
      <SignInPrompt
        message="Sign in as a reviewer to record an outcome"
        redirectedFrom={pathname}
      />
    );
  }

  const selected = options.find((o) => o.recommendationId === recId);
  const effectiveRunId = runId.trim() || selected?.decisionRunId || '';

  const onSubmit = () => {
    if (!recId.trim()) {
      setError({ message: 'Pick (or enter) a recommendation id to record an outcome for.' });
      return;
    }
    if (!effectiveRunId) {
      setError({ message: 'A decision run id is required.' });
      return;
    }
    const observed: ObservedInput = { capturedAt: new Date().toISOString() };
    const sd = Number(signalDelta);
    const ad = Number(ampDelta);
    if (signalDelta.trim() !== '' && !Number.isNaN(sd)) observed.signalDeltaPct = sd;
    if (ampDelta.trim() !== '' && !Number.isNaN(ad)) observed.amplificationDelta = ad;
    if (forecast.trim()) observed.forecastState = forecast.trim();

    if (observed.signalDeltaPct === undefined && observed.amplificationDelta === undefined) {
      setError({
        message:
          'Enter at least one observed metric (signal delta % or amplification delta) so the outcome can be evaluated.',
      });
      return;
    }

    setError(null);
    startTransition(async () => {
      const res = await action(effectiveRunId, recId.trim(), observed);
      if (res.ok) {
        router.push(`/dashboard/outcomes/${encodeURIComponent(res.data.outcomeId)}` as never);
        router.refresh();
      } else {
        setError({ message: formatErrorMessage(res.error), code: res.code });
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {options.length > 0 ? (
          <Select
            label="Recommendation"
            value={recId}
            onChange={(e) => {
              setRecId(e.target.value);
              setRunId('');
            }}
            disabled={pending}
          >
            {options.map((o) => (
              <option key={o.recommendationId} value={o.recommendationId}>
                {o.action} ({o.recommendationId})
              </option>
            ))}
          </Select>
        ) : (
          <Input
            label="Recommendation id"
            value={recId}
            onChange={(e) => setRecId(e.target.value)}
            placeholder="rec-…"
            disabled={pending}
          />
        )}
        <Input
          label="Decision run id"
          value={effectiveRunId}
          onChange={(e) => setRunId(e.target.value)}
          placeholder="run-…"
          disabled={pending}
        />
        <Input
          label="Observed signal delta (%)"
          value={signalDelta}
          onChange={(e) => setSignalDelta(e.target.value)}
          placeholder="e.g. -42"
          inputMode="decimal"
          disabled={pending}
        />
        <Input
          label="Observed amplification delta"
          value={ampDelta}
          onChange={(e) => setAmpDelta(e.target.value)}
          placeholder="e.g. -16"
          inputMode="decimal"
          disabled={pending}
        />
        <Input
          label="Observed forecast state (optional)"
          value={forecast}
          onChange={(e) => setForecast(e.target.value)}
          placeholder="e.g. declining"
          disabled={pending}
        />
        <div className="flex items-end">
          <Button variant="primary" size="sm" onClick={onSubmit} disabled={pending}>
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ClipboardCheck className="h-4 w-4" />
            )}
            {pending ? 'Recording outcome…' : 'Record outcome'}
          </Button>
        </div>
      </div>

      <p className="text-caption text-text-muted">
        Compares the observed data against the recommendation&apos;s prediction to
        produce a success score, a confidence update (before → after), an explanation,
        and explicit limitations — an aid for a human reviewer, never a certainty.
      </p>

      {error ? (
        <ErrorState
          title="Could not record outcome"
          message={error.message}
          code={error.code}
          redirectedFrom={pathname}
        />
      ) : null}
    </div>
  );
}
