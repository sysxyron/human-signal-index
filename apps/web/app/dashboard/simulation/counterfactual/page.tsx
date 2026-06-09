// =============================================================================
// HSI Phase 12 — Counterfactual View (/dashboard/simulation/counterfactual).
// Server Component, force-dynamic. Reads ?runId=; getCounterfactualRunAction().
// Renders the ORIGINAL vs COUNTERFACTUAL timeline side by side (two LineCharts of
// signals + amplification from results_json.original.frames vs .counterfactual.
// frames), the DIFFERENCES (deltas + event changes with action badges + impact +
// reasoning), the CONFIDENCE band (prominent), the grounded REASONING list, and
// the explicit LIMITATIONS (never hidden — these are estimates, not certainties).
// Offline (NOT_CONFIGURED) → labeled demo from counterfactualDemo() fixtures.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import Link from 'next/link';
import { GitCompareArrows, Info, ArrowLeft, FlaskConical } from 'lucide-react';
import type { CounterfactualRunView } from '@hsi/shared-types';
import { getCounterfactualRunAction } from '@/lib/simulation/actions';
import {
  demoCounterfactualRun,
  readCounterfactualResult,
  scenarioDecor,
} from '@/lib/simulation/view';
import { SimNav } from '@/components/simulation/SimNav';
import { DemoBadge } from '@/components/signals/badges';
import {
  EmptyState,
  ErrorState,
  OfflineDemoBanner,
  type DbErrorCode,
} from '@/components/signals/states';
import { ConfidenceBandBadge, ScenarioTypeBadge } from '@/components/simulation/badges';
import { TimelineCompare } from '@/components/simulation/TimelineCompare';
import { DiffPanel } from '@/components/simulation/DiffPanel';
import { ReasoningList } from '@/components/simulation/ReasoningList';
import { LimitationsPanel } from '@/components/simulation/LimitationsPanel';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function CounterfactualViewPage({
  searchParams,
}: {
  searchParams: { runId?: string };
}) {
  const runId = searchParams.runId?.trim() || undefined;

  let view: CounterfactualRunView | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;

  if (!runId) {
    // No run selected — guide back to the dashboard.
    view = null;
  } else {
    const res = await getCounterfactualRunAction(runId);
    if (res.ok) {
      view = res.data;
    } else if (res.code === 'NOT_CONFIGURED') {
      view = demoCounterfactualRun(runId);
      isDemo = true;
    } else {
      errored = { message: res.error, code: res.code };
    }
  }

  const result = view ? readCounterfactualResult(view.run) : null;
  const decor = view ? scenarioDecor(view.run.scenario_type) : null;
  const narrativeName = view?.narrative?.name ?? view?.run.narrative_id;

  return (
    <>
      <TopNav
        title="Counterfactual"
        subtitle="Original vs alternative timeline — an estimate, not a certainty"
      />
      <main className="space-y-6 p-5 lg:p-6">
        <SimNav />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
              <GitCompareArrows className="h-5 w-5 text-electric" />
              {view?.run.scenario_name ?? decor?.whatIf ?? 'Counterfactual'}
            </h2>
            {isDemo ? <DemoBadge /> : null}
          </div>
          <Link
            href={'/dashboard/simulation' as never}
            className="inline-flex items-center gap-1.5 text-caption font-semibold text-electric hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to simulation
          </Link>
        </div>

        {isDemo ? <OfflineDemoBanner /> : null}

        {errored ? (
          <ErrorState
            title="Could not load this counterfactual"
            message={errored.message}
            code={errored.code}
            redirectedFrom={`/dashboard/simulation/counterfactual${runId ? `?runId=${encodeURIComponent(runId)}` : ''}`}
          />
        ) : !runId ? (
          <EmptyState
            icon={<FlaskConical className="h-5 w-5" />}
            title="No counterfactual selected"
            message="Pick a run from the simulation dashboard to see its original vs counterfactual timeline, differences, reasoning, and limitations."
            action={
              <Link
                href={'/dashboard/simulation' as never}
                className="inline-flex items-center gap-2 rounded-btn border border-electric/40 bg-electric/10 px-3.5 py-2 text-caption font-semibold text-electric transition hover:border-electric hover:text-white"
              >
                Go to simulation
              </Link>
            }
          />
        ) : view && result ? (
          <div className="space-y-6">
            {/* Header card — scenario, narrative, confidence prominent */}
            <Card className="space-y-3" padded>
              <div className="flex flex-wrap items-center gap-2">
                <ScenarioTypeBadge type={view.run.scenario_type} />
                <ConfidenceBandBadge
                  band={result.confidenceBand}
                  confidence={result.confidence}
                  prominent
                />
                {narrativeName ? (
                  <span className="ml-auto text-caption text-text-muted">
                    Narrative:{' '}
                    <span className="font-semibold text-text-primary">{narrativeName}</span>
                  </span>
                ) : null}
              </div>
              {result.summary ? (
                <p className="text-body-sm leading-relaxed text-text-secondary">
                  {result.summary}
                </p>
              ) : null}
              <p className="flex items-start gap-2 text-caption leading-relaxed text-text-muted">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-electric" />
                {decor?.whatIf} The counterfactual line is an estimate produced by
                re-propagating the narrative&apos;s real history with this one
                intervention applied — read the limitations before drawing conclusions.
              </p>
            </Card>

            {/* Side-by-side timelines */}
            <TimelineCompare
              original={result.original}
              counterfactual={result.counterfactual}
              originalFinalState={result.originalFinalState}
              counterfactualFinalState={result.counterfactualFinalState}
              deltas={result.deltas}
            />

            {/* Differences */}
            <DiffPanel
              deltas={result.deltas}
              changes={result.changes}
              events={view.events}
            />

            {/* Reasoning + limitations */}
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="space-y-4" padded>
                <ReasoningList reasoning={result.reasoning} />
                {result.evidence.length > 0 ? (
                  <div className="space-y-2 border-t border-border pt-3">
                    <ReasoningList
                      reasoning={result.evidence}
                      title="Grounded in"
                      emptyHint="No evidence recorded."
                    />
                  </div>
                ) : null}
              </Card>
              <LimitationsPanel limitations={result.limitations} />
            </div>
          </div>
        ) : (
          <EmptyState
            icon={<FlaskConical className="h-5 w-5" />}
            title="Counterfactual not found"
            message="This run could not be found. It may have been removed, or the id is invalid."
          />
        )}
      </main>
    </>
  );
}
