// =============================================================================
// HSI Phase 13 — Scenario Battle Dashboard (/dashboard/simulation/compare).
// Server Component, force-dynamic. Strategic war-gaming: a ScenarioBattleConsole
// (client) lets a researcher pick a narrative and define Scenario A and Scenario
// B as multi-selects of the 12 intervention types, then compareScenariosAction →
// renders A vs B side by side with the WINNER prominent, per-scenario metrics,
// confidence, reasoning, and limitations. Past comparisons are listed below
// (getScenarioComparisonsAction). Researcher+ to run. Confidence + reasoning +
// limitations are always surfaced; ties are reported honestly. Offline
// (NOT_CONFIGURED) → labeled demo battle from the decisionDemo() fixtures.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import Link from 'next/link';
import { Swords, Info, History, ArrowLeft } from 'lucide-react';
import type { ScenarioComparisonView } from '@hsi/shared-types';
import {
  getScenarioComparisonsAction,
  compareScenariosAction,
} from '@/lib/decision/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import {
  canResearch,
  demoNarratives,
  demoScenarioBattle,
  demoScenarioComparisons,
} from '@/lib/decision/view';
import { DecisionNav } from '@/components/decision/DecisionNav';
import { DemoBadge } from '@/components/signals/badges';
import {
  EmptyState,
  ErrorState,
  OfflineDemoBanner,
  type DbErrorCode,
} from '@/components/signals/states';
import { ScenarioBattleConsole } from '@/components/decision/ScenarioBattleConsole';
import { ScenarioBattleResultView } from '@/components/decision/ScenarioBattleResultView';
// ADDITIVE (Phase 15): a best-effort "did past recommendations work?" widget.
import { getDecisionOutcomeWidgetAction } from '@/lib/outcome/actions';
import {
  demoDecisionOutcomeWidget,
  type DecisionOutcomeWidgetData,
} from '@/lib/outcome/view';
import { DecisionOutcomeWidget } from '@/components/outcome/DecisionOutcomeWidget';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ScenarioComparePage() {
  const [res, role, user] = await Promise.all([
    getScenarioComparisonsAction(),
    getSessionRole(),
    getUser(),
  ]);
  const canRun = canResearch(role) && Boolean(user);

  let view: ScenarioComparisonView | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;

  if (res.ok) {
    view = res.data;
  } else if (res.code === 'NOT_CONFIGURED') {
    view = demoScenarioComparisons();
    isDemo = true;
  } else {
    errored = { message: res.error, code: res.code };
  }

  const narratives = isDemo ? demoNarratives() : view?.narratives ?? [];
  const comparisons = view?.comparisons ?? [];
  const nameOf = new Map(narratives.map((n) => [n.id, n.name]));

  // ADDITIVE (Phase 15): a best-effort outcome widget — whether past
  // recommendations for the most-recent compared run actually worked. Any failure
  // here must never break the compare page; on any error we hide the widget.
  const widgetRunId = comparisons.find((c) => c.run)?.run?.id;
  let outcomeWidget: DecisionOutcomeWidgetData | null = null;
  let outcomeWidgetDemo = false;
  if (isDemo) {
    outcomeWidget = demoDecisionOutcomeWidget(widgetRunId);
    outcomeWidgetDemo = true;
  } else if (widgetRunId) {
    try {
      const wRes = await getDecisionOutcomeWidgetAction(widgetRunId);
      if (wRes.ok) {
        outcomeWidget = wRes.data;
      } else if (wRes.code === 'NOT_CONFIGURED') {
        outcomeWidget = demoDecisionOutcomeWidget(widgetRunId);
        outcomeWidgetDemo = true;
      }
    } catch {
      outcomeWidget = null;
    }
  }

  return (
    <>
      <TopNav
        title="Scenario War-Gaming"
        subtitle="Scenario A vs Scenario B — head-to-head, with an honest winner"
      />
      <main className="space-y-6 p-5 lg:p-6">
        <DecisionNav />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
              <Swords className="h-5 w-5 text-electric" /> Scenario battle
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

        <Card className="flex items-start gap-2 border-border bg-surface/50" padded>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption leading-relaxed text-text-secondary">
            War-gaming pits two strategic plans against each other over a
            narrative&apos;s real history: each plan is a SET of interventions applied
            forward, and the model estimates which plan better moves the objective.
            The result carries a{' '}
            <span className="font-semibold text-text-primary">
              confidence, a reasoning trail, and explicit limitations
            </span>
            ; when the two plans are indistinguishable it returns a{' '}
            <span className="font-semibold text-text-primary">tie</span> rather than
            forcing a winner. These are decision aids, not certainties.
          </p>
        </Card>

        {errored ? (
          <ErrorState
            title="Could not load scenario comparisons"
            message={errored.message}
            code={errored.code}
            redirectedFrom="/dashboard/simulation/compare"
          />
        ) : (
          <div className="space-y-6">
            <ScenarioBattleConsole
              narratives={narratives}
              action={compareScenariosAction}
              canRun={canRun}
              demo={isDemo}
              demoBattle={isDemo ? demoScenarioBattle() : undefined}
            />

            {/* ADDITIVE (Phase 15): did past recommendations actually work? */}
            {outcomeWidget ? (
              <DecisionOutcomeWidget data={outcomeWidget} demo={outcomeWidgetDemo} />
            ) : null}

            <section className="space-y-3">
              <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
                <History className="h-4 w-4 text-electric" /> Past comparisons
              </h3>
              {comparisons.length === 0 ? (
                <EmptyState
                  icon={<Swords className="h-5 w-5" />}
                  title="No scenario battles yet"
                  message="Run a scenario battle above (researcher+). Each head-to-head is saved here with its winner, confidence, reasoning, and limitations."
                />
              ) : (
                <div className="space-y-4">
                  {comparisons.map((c) => (
                    <ScenarioBattleResultView
                      key={c.id}
                      comparison={c}
                      narrativeName={
                        c.run ? nameOf.get(c.run.narrative_id) : undefined
                      }
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </>
  );
}
