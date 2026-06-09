// =============================================================================
// HSI Phase 12 — Counterfactual Simulation Dashboard (/dashboard/simulation).
// Server Component, force-dynamic. getSimulationOverviewAction(): recent + top
// counterfactual runs (scenario badge + confidence band + summary), forecast
// accuracy (avg + per-narrative), calibration health (avg + confidence-band
// display), an alternative-timelines (WorldForge scenarios) preview, and a
// RunCounterfactualForm (researcher+) to launch a new "what if?" run. A "Rebuild
// simulation" control (researcher+). Confidence + the estimate-not-certainty
// framing are surfaced everywhere. Offline (NOT_CONFIGURED) → labeled demo from
// the @hsi/counterfactual-engine counterfactualDemo() fixtures.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import Link from 'next/link';
import { FlaskConical, Info, Clock3, Trophy, Target, Globe2, ArrowRight } from 'lucide-react';
import type { SimulationOverview } from '@hsi/shared-types';
import {
  getSimulationOverviewAction,
  runCounterfactualAction,
  rebuildSimulationAction,
} from '@/lib/simulation/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import {
  canResearch,
  demoSimulationOverview,
  demoNarratives,
  rankRuns,
} from '@/lib/simulation/view';
import { SimNav } from '@/components/simulation/SimNav';
import { DemoBadge } from '@/components/signals/badges';
import {
  EmptyState,
  ErrorState,
  OfflineDemoBanner,
  type DbErrorCode,
} from '@/components/signals/states';
import { CounterfactualRunCard } from '@/components/simulation/CounterfactualRunCard';
import { RunCounterfactualForm } from '@/components/simulation/RunCounterfactualForm';
import { RebuildSimulationButton } from '@/components/simulation/RebuildSimulationButton';
import { AccuracyTable } from '@/components/simulation/AccuracyTable';
import { CalibrationPanel } from '@/components/simulation/CalibrationPanel';
import { WorldforgeScenarioCard } from '@/components/simulation/WorldforgeScenarioCard';
import { ScenarioBattleLinkCard } from '@/components/decision/DecisionLinkCards';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function SimulationPage() {
  const [res, role, user] = await Promise.all([
    getSimulationOverviewAction(),
    getSessionRole(),
    getUser(),
  ]);
  const canRun = canResearch(role) && Boolean(user);

  let overview: SimulationOverview | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;

  if (res.ok) {
    overview = res.data;
  } else if (res.code === 'NOT_CONFIGURED') {
    overview = demoSimulationOverview();
    isDemo = true;
  } else {
    errored = { message: res.error, code: res.code };
  }

  const narratives = isDemo ? demoNarratives() : [];
  // Narrative names: prefer accuracy rows + scenario runs (best-effort).
  const narrativeNames = new Map<string, string>(
    narratives.map((n) => [n.id, n.name]),
  );

  const recent = overview?.recentRuns ?? [];
  const top = overview ? rankRuns(overview.topRuns).slice(0, 4) : [];
  const scenarios = overview?.scenarios ?? [];

  const hasData = overview && (recent.length > 0 || top.length > 0 || scenarios.length > 0);

  return (
    <>
      <TopNav
        title="Counterfactual Simulation"
        subtitle="What if X never happened — grounded estimates, never certainties"
      />
      <main className="space-y-6 p-5 lg:p-6">
        <SimNav />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
              <FlaskConical className="h-5 w-5 text-electric" /> Simulation overview
            </h2>
            {isDemo ? <DemoBadge /> : null}
          </div>
          <RebuildSimulationButton
            action={rebuildSimulationAction}
            canRebuild={canRun}
            demo={isDemo}
          />
        </div>

        {isDemo ? <OfflineDemoBanner /> : null}

        {/* ADDITIVE (Phase 13): link to strategic scenario war-gaming. */}
        <ScenarioBattleLinkCard />

        <Card className="flex items-start gap-2 border-border bg-surface/50" padded>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption leading-relaxed text-text-secondary">
            Counterfactual simulation replays a narrative&apos;s ACTUAL signal history
            with one intervention applied (remove a source, dampen amplification, delay
            an event …) and re-propagates the downstream effects. Every result carries a
            confidence, a reasoning trail, and explicit limitations — it is an{' '}
            <span className="font-semibold text-text-primary">estimate for a human reviewer</span>,
            never a prediction of what would have happened. Backtesting then calibrates
            stated confidence against empirical accuracy to keep the network honest.
          </p>
        </Card>

        {errored ? (
          <ErrorState
            title="Could not load simulation overview"
            message={errored.message}
            code={errored.code}
            redirectedFrom="/dashboard/simulation"
          />
        ) : (
          <div className="space-y-6">
            {/* Run a counterfactual */}
            <Card className="space-y-3" padded>
              <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
                <FlaskConical className="h-4 w-4 text-electric" /> Run a counterfactual
              </h3>
              <RunCounterfactualForm
                narratives={narratives}
                action={runCounterfactualAction}
                canRun={canRun}
                demo={isDemo}
              />
            </Card>

            {!hasData ? (
              <EmptyState
                icon={<FlaskConical className="h-5 w-5" />}
                title="No counterfactual runs yet"
                message="Run a counterfactual above (researcher+) or rebuild the simulation pipeline once narratives have accumulated history."
              />
            ) : (
              <>
                {/* Aggregate accuracy + calibration */}
                {overview ? (
                  <div className="grid gap-6 lg:grid-cols-2">
                    <Card className="space-y-3" padded>
                      <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
                        <Target className="h-4 w-4 text-electric" /> Forecast accuracy
                      </h3>
                      <AccuracyTable
                        rows={overview.accuracy}
                        narrativeNames={narrativeNames}
                      />
                      <Link
                        href={'/dashboard/simulation/backtesting' as never}
                        className="inline-flex items-center gap-1.5 text-caption font-semibold text-electric hover:text-white"
                      >
                        Full backtesting <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Card>
                    <CalibrationPanel
                      avgAccuracy={overview.avgAccuracy}
                      avgCalibration={overview.avgCalibration}
                    />
                  </div>
                ) : null}

                {/* Top counterfactual runs */}
                {top.length > 0 ? (
                  <section className="space-y-3">
                    <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
                      <Trophy className="h-4 w-4 text-electric" /> Top counterfactual runs
                    </h3>
                    <div className="grid gap-4 lg:grid-cols-2">
                      {top.map((run) => (
                        <CounterfactualRunCard
                          key={run.id}
                          run={run}
                          narrativeName={narrativeNames.get(run.narrative_id)}
                        />
                      ))}
                    </div>
                  </section>
                ) : null}

                {/* Recent simulations */}
                {recent.length > 0 ? (
                  <section className="space-y-3">
                    <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
                      <Clock3 className="h-4 w-4 text-electric" /> Recent simulations
                    </h3>
                    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                      {recent.slice(0, 6).map((run) => (
                        <CounterfactualRunCard
                          key={run.id}
                          run={run}
                          narrativeName={narrativeNames.get(run.narrative_id)}
                        />
                      ))}
                    </div>
                  </section>
                ) : null}

                {/* Alternative timelines preview */}
                {scenarios.length > 0 ? (
                  <section className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
                        <Globe2 className="h-4 w-4 text-electric" /> Alternative timelines
                      </h3>
                      <Link
                        href={'/dashboard/worldforge/scenarios/counterfactual' as never}
                        className="inline-flex items-center gap-1.5 text-caption font-semibold text-electric hover:text-white"
                      >
                        All WorldForge scenarios <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                      {scenarios.slice(0, 3).map((s) => (
                        <WorldforgeScenarioCard
                          key={s.id}
                          scenario={s}
                        />
                      ))}
                    </div>
                  </section>
                ) : null}
              </>
            )}
          </div>
        )}
      </main>
    </>
  );
}
