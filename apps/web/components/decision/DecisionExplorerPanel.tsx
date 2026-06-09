'use client';

// =============================================================================
// HSI Phase 13 — DecisionExplorerPanel. Interactive, client-driven decision
// explorer: pick a narrative + an intervention type → exploreDecisionAction →
// show the expected effect, risk score, a PROMINENT confidence band, the grounded
// reasoning, and explicit limitations. Explored interventions accumulate into a
// side-by-side comparison strip so a reviewer can weigh a couple of levers at
// once. A "Generate full recommendation" link runs the full decision pipeline.
// Demo is read-only (a labeled demo result is shown). useTransition; loading /
// error / auth / permission states. Decision-aid framing throughout — confidence
// + limitations are NEVER hidden.
// =============================================================================

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button, Card, Select } from '@hsi/ui';
import { Compass, Loader2, Sparkles, X, ArrowRight } from 'lucide-react';
import type {
  DecisionExplorerResult,
  HsinNarrativeRecord,
} from '@hsi/shared-types';
import type { InterventionType } from '@hsi/decision-intelligence';
import { SignInPrompt } from '@/components/worldforge/PersistenceUI';
import { ErrorState } from '@/components/signals/states';
import { formatErrorMessage } from '@/lib/errors/format-error';
import { InterventionTypeBadge, ConfidenceBandBadge } from './badges';
import { ReasoningList } from './ReasoningList';
import { LimitationsPanel } from './LimitationsPanel';
import {
  allInterventionTypes,
  bandFromConfidence,
  demoExplorerResult,
  effectTone,
  formatEffect,
  formatRisk,
  interventionDecor,
  riskTone,
  toneColor,
} from '@/lib/decision/view';

type DbErrorCode = 'AUTH_REQUIRED' | 'FORBIDDEN' | 'NOT_CONFIGURED' | 'DB_ERROR';

type ExploreResult =
  | { ok: true; data: DecisionExplorerResult }
  | { ok: false; error: string; code?: DbErrorCode };

function ExplorerResultCard({
  result,
  narrativeName,
  onRemove,
}: {
  result: DecisionExplorerResult;
  narrativeName?: string;
  onRemove?: () => void;
}) {
  const decor = interventionDecor(result.interventionType);
  return (
    <Card className="space-y-3" padded>
      <div className="flex flex-wrap items-center gap-2">
        <InterventionTypeBadge type={result.interventionType} />
        <ConfidenceBandBadge
          band={bandFromConfidence(result.confidence)}
          confidence={result.confidence}
          prominent
        />
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className="ml-auto rounded-btn p-1 text-text-muted transition hover:bg-surface-2 hover:text-text-primary"
            aria-label="Remove from comparison"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      <p className="text-caption text-text-secondary">{decor.framing}</p>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-card border border-border bg-surface-2/40 p-3">
          <p className="text-label text-text-muted">Expected effect</p>
          <p
            className="text-xl font-bold tabular-nums"
            style={{ color: toneColor(effectTone(result.expectedEffect)) }}
          >
            {formatEffect(result.expectedEffect)}
          </p>
          <p className="text-caption text-text-muted">on trajectory (−100…100)</p>
        </div>
        <div className="rounded-card border border-border bg-surface-2/40 p-3">
          <p className="text-label text-text-muted">Risk score</p>
          <p
            className="text-xl font-bold tabular-nums"
            style={{ color: toneColor(riskTone(result.riskScore)) }}
          >
            {formatRisk(result.riskScore)}
            <span className="text-caption font-normal text-text-muted">/100</span>
          </p>
          <p className="text-caption text-text-muted">
            {narrativeName ?? result.narrativeId}
          </p>
        </div>
      </div>

      <ReasoningList reasoning={result.reasoning} />
      <LimitationsPanel limitations={result.limitations} />
    </Card>
  );
}

export function DecisionExplorerPanel({
  narratives,
  action,
  canRun,
  demo = false,
}: {
  narratives: HsinNarrativeRecord[];
  action: (
    narrativeId: string,
    interventionType: InterventionType,
  ) => Promise<ExploreResult>;
  canRun: boolean;
  demo?: boolean;
}) {
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const interventionOptions = allInterventionTypes();
  const [narrativeId, setNarrativeId] = useState(narratives[0]?.id ?? '');
  const [interventionType, setInterventionType] = useState<string>(
    interventionOptions[0]?.type ?? 'reduce_amplification',
  );
  const [results, setResults] = useState<DecisionExplorerResult[]>([]);
  const [error, setError] = useState<{ message: string; code?: DbErrorCode } | null>(
    null,
  );

  const nameOf = new Map(narratives.map((n) => [n.id, n.name]));

  const addResult = (r: DecisionExplorerResult) => {
    setResults((prev) => {
      // Replace an existing entry for the same narrative+intervention; cap at 4.
      const filtered = prev.filter(
        (p) =>
          !(p.narrativeId === r.narrativeId && p.interventionType === r.interventionType),
      );
      return [r, ...filtered].slice(0, 4);
    });
  };

  const onExplore = () => {
    if (!narrativeId) {
      setError({ message: 'Pick a narrative to explore.' });
      return;
    }
    setError(null);
    if (demo) {
      addResult(demoExplorerResult(narrativeId, interventionType));
      return;
    }
    startTransition(async () => {
      const res = await action(narrativeId, interventionType as InterventionType);
      if (res.ok) {
        addResult(res.data);
      } else {
        setError({ message: formatErrorMessage(res.error), code: res.code });
      }
    });
  };

  const blocked = !demo && !canRun;

  return (
    <div className="space-y-5">
      <Card className="space-y-3" padded>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
            label="Intervention to explore"
            value={interventionType}
            onChange={(e) => setInterventionType(e.target.value)}
            disabled={pending}
          >
            {interventionOptions.map((o) => (
              <option key={o.type} value={o.type}>
                {o.decor.label}
              </option>
            ))}
          </Select>
          <div className="flex items-end">
            {blocked ? (
              <SignInPrompt
                message="Sign in as a researcher to explore"
                redirectedFrom={pathname}
              />
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={onExplore}
                disabled={pending || !narrativeId}
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Compass className="h-4 w-4" />
                )}
                {pending ? 'Exploring…' : 'Explore intervention'}
              </Button>
            )}
          </div>
        </div>

        <p className="rounded-card border border-electric/30 bg-electric/5 px-3 py-2 text-caption italic text-text-secondary">
          {interventionDecor(interventionType).framing}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {demo ? (
            <span className="inline-flex items-center gap-1.5 text-caption text-warning">
              <Sparkles className="h-3.5 w-3.5" /> Demo — explored results are labeled
              offline estimates.
            </span>
          ) : null}
          <Link
            href={'/dashboard/intelligence/decisions' as never}
            className="ml-auto inline-flex items-center gap-1.5 text-caption font-semibold text-electric hover:text-white"
          >
            Generate full recommendation <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {error ? (
          <ErrorState
            title="Could not explore intervention"
            message={error.message}
            code={error.code}
            redirectedFrom={pathname}
          />
        ) : null}
      </Card>

      {results.length === 0 ? (
        <p className="text-caption text-text-muted">
          Explore an intervention above to see its expected effect, risk, confidence,
          reasoning, and limitations. Explore a couple to compare them side by side.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {results.map((r, i) => (
            <ExplorerResultCard
              key={`${r.narrativeId}-${r.interventionType}-${i}`}
              result={r}
              narrativeName={nameOf.get(r.narrativeId)}
              onRemove={() =>
                setResults((prev) => prev.filter((_, idx) => idx !== i))
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
