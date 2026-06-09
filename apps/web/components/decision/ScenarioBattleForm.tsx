'use client';

// =============================================================================
// HSI Phase 13 — ScenarioBattleForm. Researcher+ war-gaming control: pick a
// narrative, name and define Scenario A's interventions and Scenario B's
// interventions (multi-select of the 12 intervention types), then
// compareScenariosAction(narrativeId, scenarioA, scenarioB). On success the
// resulting comparison is rendered in place by the parent (via onResult). Demo is
// read-only. useTransition; loading / error / auth / permission states. An empty
// plan = "do nothing" baseline (a valid war-game side).
// =============================================================================

import { useState, useTransition } from 'react';
import { usePathname } from 'next/navigation';
import { Button, Card, Input, Select, cn } from '@hsi/ui';
import { Swords, Loader2, Sparkles } from 'lucide-react';
import type { HsinNarrativeRecord } from '@hsi/shared-types';
import type {
  InterventionType,
  ScenarioBattleResult,
} from '@hsi/decision-intelligence';
import { SignInPrompt } from '@/components/worldforge/PersistenceUI';
import { ErrorState } from '@/components/signals/states';
import { formatErrorMessage } from '@/lib/errors/format-error';
import { allInterventionTypes } from '@/lib/decision/view';

type DbErrorCode = 'AUTH_REQUIRED' | 'FORBIDDEN' | 'NOT_CONFIGURED' | 'DB_ERROR';

interface ScenarioSpec {
  name: string;
  interventions: InterventionType[];
}

/** The compare action returns the engine battle plus its persistence ids. */
export interface CompareScenariosData {
  decisionRunId: string;
  comparisonId: string;
  battle: ScenarioBattleResult;
}

type CompareResult =
  | { ok: true; data: CompareScenariosData }
  | { ok: false; error: string; code?: DbErrorCode };

function InterventionMultiSelect({
  selected,
  onToggle,
  accent,
  disabled,
}: {
  selected: string[];
  onToggle: (type: string) => void;
  accent: string;
  disabled: boolean;
}) {
  const options = allInterventionTypes();
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(({ type, decor }) => {
        const on = selected.includes(type);
        return (
          <button
            key={type}
            type="button"
            disabled={disabled}
            onClick={() => onToggle(type)}
            title={decor.framing}
            className={cn(
              'rounded-full px-2.5 py-1 text-caption font-semibold transition disabled:opacity-50',
              on
                ? 'text-white'
                : 'border border-border bg-surface-2/40 text-text-secondary hover:text-text-primary',
            )}
            style={
              on
                ? { backgroundColor: `${accent}26`, color: accent, border: `1px solid ${accent}` }
                : undefined
            }
          >
            {decor.label}
          </button>
        );
      })}
    </div>
  );
}

export function ScenarioBattleForm({
  narratives,
  action,
  canRun,
  demo = false,
  onResult,
}: {
  narratives: HsinNarrativeRecord[];
  action: (
    narrativeId: string,
    scenarioA: ScenarioSpec,
    scenarioB: ScenarioSpec,
  ) => Promise<CompareResult>;
  canRun: boolean;
  demo?: boolean;
  onResult?: (data: CompareScenariosData) => void;
}) {
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [narrativeId, setNarrativeId] = useState(narratives[0]?.id ?? '');
  const [nameA, setNameA] = useState('Scenario A');
  const [nameB, setNameB] = useState('Scenario B');
  const [interventionsA, setInterventionsA] = useState<string[]>(['reduce_amplification']);
  const [interventionsB, setInterventionsB] = useState<string[]>([]);
  const [error, setError] = useState<{ message: string; code?: DbErrorCode } | null>(
    null,
  );

  if (demo) {
    return (
      <div className="flex items-center gap-1.5 text-caption text-warning">
        <Sparkles className="h-3.5 w-3.5" /> Demo is read-only — connect Supabase to
        war-game scenarios. A labeled demo battle is shown below.
      </div>
    );
  }

  if (!canRun) {
    return (
      <SignInPrompt
        message="Sign in as a researcher to war-game scenarios"
        redirectedFrom={pathname}
      />
    );
  }

  const toggle = (
    list: string[],
    setList: (v: string[]) => void,
    type: string,
  ) => {
    setList(list.includes(type) ? list.filter((t) => t !== type) : [...list, type]);
  };

  const onSubmit = () => {
    if (!narrativeId) {
      setError({ message: 'Pick a narrative to war-game against.' });
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await action(
        narrativeId,
        {
          name: nameA.trim() || 'Scenario A',
          interventions: interventionsA as InterventionType[],
        },
        {
          name: nameB.trim() || 'Scenario B',
          interventions: interventionsB as InterventionType[],
        },
      );
      if (res.ok) {
        onResult?.(res.data);
      } else {
        setError({ message: formatErrorMessage(res.error), code: res.code });
      }
    });
  };

  return (
    <div className="space-y-4">
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 border-[#06B6D455] bg-[#06B6D40d]" padded>
          <Input
            label="Scenario A name"
            value={nameA}
            onChange={(e) => setNameA(e.target.value)}
            disabled={pending}
          />
          <div className="space-y-1.5">
            <span className="block text-label text-text-secondary">
              Scenario A interventions
            </span>
            <InterventionMultiSelect
              selected={interventionsA}
              onToggle={(t) => toggle(interventionsA, setInterventionsA, t)}
              accent="#06B6D4"
              disabled={pending}
            />
            {interventionsA.length === 0 ? (
              <p className="text-caption italic text-text-muted">
                No levers — Scenario A is a &ldquo;do nothing&rdquo; baseline.
              </p>
            ) : null}
          </div>
        </Card>

        <Card className="space-y-3 border-[#8B5CF655] bg-[#8B5CF60d]" padded>
          <Input
            label="Scenario B name"
            value={nameB}
            onChange={(e) => setNameB(e.target.value)}
            disabled={pending}
          />
          <div className="space-y-1.5">
            <span className="block text-label text-text-secondary">
              Scenario B interventions
            </span>
            <InterventionMultiSelect
              selected={interventionsB}
              onToggle={(t) => toggle(interventionsB, setInterventionsB, t)}
              accent="#8B5CF6"
              disabled={pending}
            />
            {interventionsB.length === 0 ? (
              <p className="text-caption italic text-text-muted">
                No levers — Scenario B is a &ldquo;do nothing&rdquo; baseline.
              </p>
            ) : null}
          </div>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          size="sm"
          onClick={onSubmit}
          disabled={pending || !narrativeId}
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Swords className="h-4 w-4" />
          )}
          {pending ? 'War-gaming…' : 'Run scenario battle'}
        </Button>
        <span className="text-caption text-text-muted">
          Head-to-head estimate with a confidence, reasoning, and limitations — ties
          are reported honestly, never forced.
        </span>
      </div>

      {error ? (
        <ErrorState
          title="Could not run scenario battle"
          message={error.message}
          code={error.code}
          redirectedFrom={pathname}
        />
      ) : null}
    </div>
  );
}
