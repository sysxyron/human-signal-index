'use client';

// =============================================================================
// HSI Phase 12 — RunCounterfactualForm. Researcher+ control to launch a NEW
// counterfactual: pick a narrative + one of the 12 scenario types + a magnitude,
// then runCounterfactualAction(narrativeId, scenarioType, { magnitude, name }).
// On success it navigates to the counterfactual view for the new run. Demo is
// read-only. useTransition; loading / error / auth / permission states. The
// scenario picker shows the honest "what if?" framing for the chosen type.
// =============================================================================

import { useMemo, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button, Select, Input } from '@hsi/ui';
import { FlaskConical, Loader2, Sparkles } from 'lucide-react';
import type {
  CounterfactualScenarioType,
  HsinNarrativeRecord,
} from '@hsi/shared-types';
import { SignInPrompt } from '@/components/worldforge/PersistenceUI';
import { ErrorState } from '@/components/signals/states';
import { formatErrorMessage } from '@/lib/errors/format-error';
import { allScenarioTypes, scenarioDecor } from '@/lib/simulation/view';

type RunResult =
  | { ok: true; data: { runId: string } }
  | { ok: false; error: string; code?: 'AUTH_REQUIRED' | 'FORBIDDEN' | 'NOT_CONFIGURED' | 'DB_ERROR' };

export function RunCounterfactualForm({
  narratives,
  action,
  canRun,
  demo = false,
}: {
  narratives: HsinNarrativeRecord[];
  action: (
    narrativeId: string,
    scenarioType: CounterfactualScenarioType,
    params?: { targetEventId?: string; magnitude?: number; name?: string },
  ) => Promise<RunResult>;
  canRun: boolean;
  demo?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const scenarioOptions = useMemo(() => allScenarioTypes(), []);
  const [narrativeId, setNarrativeId] = useState(narratives[0]?.id ?? '');
  const [scenarioType, setScenarioType] = useState<CounterfactualScenarioType>(
    scenarioOptions[0]?.type ?? 'remove_event',
  );
  const [magnitude, setMagnitude] = useState('1');
  const [name, setName] = useState('');
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);

  const decor = scenarioDecor(scenarioType);

  if (demo) {
    return (
      <div className="flex items-center gap-1.5 text-caption text-warning">
        <Sparkles className="h-3.5 w-3.5" /> Demo is read-only — connect Supabase to run
        counterfactuals.
      </div>
    );
  }

  if (!canRun) {
    return (
      <SignInPrompt
        message="Sign in as a researcher to run counterfactuals"
        redirectedFrom={pathname}
      />
    );
  }

  const onSubmit = () => {
    if (!narrativeId) {
      setError({ message: 'Pick a narrative to run a counterfactual against.' });
      return;
    }
    setError(null);
    const mag = Number.parseFloat(magnitude);
    startTransition(async () => {
      const res = await action(narrativeId, scenarioType, {
        magnitude: Number.isFinite(mag) ? mag : undefined,
        name: name.trim() || undefined,
      });
      if (res.ok) {
        router.push(
          `/dashboard/simulation/counterfactual?runId=${encodeURIComponent(res.data.runId)}` as never,
        );
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

        <Select
          label="Scenario type"
          value={scenarioType}
          onChange={(e) => setScenarioType(e.target.value as CounterfactualScenarioType)}
          disabled={pending}
        >
          {scenarioOptions.map((s) => (
            <option key={s.type} value={s.type}>
              {s.decor.label}
            </option>
          ))}
        </Select>

        <Input
          label="Magnitude"
          type="number"
          min={0}
          step={0.5}
          value={magnitude}
          onChange={(e) => setMagnitude(e.target.value)}
          disabled={pending}
          hint="Intervention strength (1 = natural). Higher = stronger effect."
        />

        <Input
          label="Run name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={pending}
          placeholder={decor.whatIf}
        />
      </div>

      <p className="rounded-card border border-electric/30 bg-electric/5 px-3 py-2 text-caption italic text-text-secondary">
        {decor.whatIf}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" size="sm" onClick={onSubmit} disabled={pending || !narrativeId}>
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FlaskConical className="h-4 w-4" />
          )}
          {pending ? 'Running counterfactual…' : 'Run counterfactual'}
        </Button>
        <span className="text-caption text-text-muted">
          Produces a grounded estimate with confidence + limitations — never a certainty.
        </span>
      </div>

      {error ? (
        <ErrorState
          title="Could not run counterfactual"
          message={error.message}
          code={error.code as never}
          redirectedFrom={pathname}
        />
      ) : null}
    </div>
  );
}
