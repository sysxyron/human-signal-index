// =============================================================================
// HSI Phase 13 — Decision Intelligence Dashboard (/dashboard/intelligence/
// decisions). Server Component, force-dynamic. getDecisionDashboardAction():
// recommendations (recommended_action + decision-type badge + confidence band +
// reasoning + limitations), recent decision runs, aggregate confidence, top
// ranked interventions (effect/risk/confidence/rank), and the highest-risk
// narratives. A RunDecisionForm (researcher+) generates a new decision; a
// RebuildDecisionsButton (researcher+) re-runs the pipeline. When a ?runId= is
// present, the full DecisionRunView (rankings + scenario comparisons + audit) is
// shown. Confidence + reasoning + limitations + audit are surfaced everywhere —
// these are decision AIDS, never certainties. Offline (NOT_CONFIGURED) → labeled
// demo from the @hsi/decision-intelligence decisionDemo() fixtures.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import {
  Target,
  Info,
  Clock3,
  ListOrdered,
  Lightbulb,
} from 'lucide-react';
import type {
  DecisionDashboardData,
  DecisionRunView,
} from '@hsi/shared-types';
import {
  getDecisionDashboardAction,
  getDecisionRunAction,
  runDecisionAction,
  rebuildDecisionsAction,
} from '@/lib/decision/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import {
  canResearch,
  demoDecisionDashboard,
  demoDecisionRun,
  demoNarratives,
  rankRuns,
} from '@/lib/decision/view';
import { DecisionNav } from '@/components/decision/DecisionNav';
import { DemoBadge } from '@/components/signals/badges';
import {
  EmptyState,
  ErrorState,
  OfflineDemoBanner,
  type DbErrorCode,
} from '@/components/signals/states';
import { RecommendationCard } from '@/components/decision/RecommendationCard';
import { InterventionRankingTable } from '@/components/decision/InterventionRankingTable';
import { RiskNarrativeList } from '@/components/decision/RiskNarrativeList';
import { RunDecisionForm } from '@/components/decision/RunDecisionForm';
import { RebuildDecisionsButton } from '@/components/decision/RebuildDecisionsButton';
import { DecisionAuditTrail } from '@/components/decision/DecisionAuditTrail';
import { ScenarioBattleResultView } from '@/components/decision/ScenarioBattleResultView';
import { ConfidenceBandBadge } from '@/components/decision/badges';
import { bandFromConfidence } from '@/lib/decision/view';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function DecisionsPage({
  searchParams,
}: {
  searchParams: { runId?: string };
}) {
  const runId = searchParams.runId?.trim() || undefined;

  const [res, role, user] = await Promise.all([
    getDecisionDashboardAction(),
    getSessionRole(),
    getUser(),
  ]);
  const canRun = canResearch(role) && Boolean(user);

  let data: DecisionDashboardData | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;

  if (res.ok) {
    data = res.data;
  } else if (res.code === 'NOT_CONFIGURED') {
    data = demoDecisionDashboard();
    isDemo = true;
  } else {
    errored = { message: res.error, code: res.code };
  }

  const narratives = isDemo ? demoNarratives() : [];

  // Optional: a selected decision run (rankings + scenario comparisons + audit).
  let runView: DecisionRunView | null = null;
  let runDemo = false;
  if (runId) {
    if (isDemo) {
      runView = demoDecisionRun(runId);
      runDemo = true;
    } else {
      try {
        const rv = await getDecisionRunAction(runId);
        if (rv.ok) {
          runView = rv.data;
        } else if (rv.code === 'NOT_CONFIGURED') {
          runView = demoDecisionRun(runId);
          runDemo = true;
        }
      } catch {
        runView = null;
      }
    }
  }

  const recommendations = data?.recommendations ?? [];
  const recentRuns = data ? rankRuns(data.recentRuns) : [];
  const topRankings = data?.topRankings ?? [];
  const highestRisk = data?.highestRiskNarratives ?? [];
  const hasData =
    data &&
    (recommendations.length > 0 ||
      recentRuns.length > 0 ||
      topRankings.length > 0 ||
      highestRisk.length > 0);

  const runNarrativeName = runView?.narrative?.name ?? runView?.run.narrative_id;

  return (
    <>
      <TopNav
        title="Decision Intelligence"
        subtitle="What should we do next? — grounded decision aids, never certainties"
      />
      <main className="space-y-6 p-5 lg:p-6">
        <DecisionNav />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
              <Target className="h-5 w-5 text-electric" /> Decision overview
            </h2>
            {isDemo ? <DemoBadge /> : null}
            {data ? (
              <ConfidenceBandBadge
                band={bandFromConfidence(data.avgConfidence)}
                confidence={data.avgConfidence}
              />
            ) : null}
          </div>
          <RebuildDecisionsButton
            action={rebuildDecisionsAction}
            canRebuild={canRun}
            demo={isDemo}
          />
        </div>

        {isDemo ? <OfflineDemoBanner /> : null}

        <Card className="flex items-start gap-2 border-border bg-surface/50" padded>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption leading-relaxed text-text-secondary">
            Decision intelligence sits on top of the causal / temporal /
            counterfactual engines and answers &ldquo;what should we do next, and
            which intervention has the highest probability of success?&rdquo; from a
            narrative&apos;s ACTUAL history. Every recommendation carries a{' '}
            <span className="font-semibold text-text-primary">
              confidence, a reasoning trail, explicit limitations, and a full audit
            </span>{' '}
            — it is an AID for a human reviewer, never a command and never a certainty.
          </p>
        </Card>

        {errored ? (
          <ErrorState
            title="Could not load decision overview"
            message={errored.message}
            code={errored.code}
            redirectedFrom="/dashboard/intelligence/decisions"
          />
        ) : (
          <div className="space-y-6">
            {/* Generate a decision */}
            <Card className="space-y-3" padded>
              <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
                <Target className="h-4 w-4 text-electric" /> Generate a decision
              </h3>
              <RunDecisionForm
                narratives={narratives}
                action={runDecisionAction}
                canRun={canRun}
                demo={isDemo}
              />
            </Card>

            {/* Selected decision run (rankings + comparisons + audit). */}
            {runView ? (
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
                    <Lightbulb className="h-4 w-4 text-electric" /> Selected decision run
                  </h3>
                  {runDemo ? <DemoBadge /> : null}
                </div>
                <RecommendationCard
                  run={runView.run}
                  narrativeName={runNarrativeName}
                />
                {runView.rankings.length > 0 ? (
                  <Card className="space-y-3" padded>
                    <h4 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
                      <ListOrdered className="h-4 w-4 text-electric" /> Ranked
                      interventions
                    </h4>
                    <InterventionRankingTable rankings={runView.rankings} />
                  </Card>
                ) : null}
                {runView.comparisons.length > 0 ? (
                  <div className="space-y-4">
                    {runView.comparisons.map((c) => (
                      <ScenarioBattleResultView
                        key={c.id}
                        comparison={c}
                        narrativeName={runNarrativeName}
                      />
                    ))}
                  </div>
                ) : null}
                {runView.audit ? (
                  <DecisionAuditTrail audit={runView.audit} />
                ) : null}
              </section>
            ) : null}

            {!hasData && !runView ? (
              <EmptyState
                icon={<Target className="h-5 w-5" />}
                title="No decision runs yet"
                message="Generate a decision above (researcher+) or rebuild the decision pipeline once narratives have accumulated signal, causal, and counterfactual history."
              />
            ) : (
              <>
                {/* Recommendations */}
                {recommendations.length > 0 ? (
                  <section className="space-y-3">
                    <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
                      <Lightbulb className="h-4 w-4 text-electric" /> Recommendations
                    </h3>
                    <div className="grid gap-4 lg:grid-cols-2">
                      {recommendations.slice(0, 4).map((run) => (
                        <RecommendationCard
                          key={run.id}
                          run={run}
                          href={`/dashboard/intelligence/decisions?runId=${encodeURIComponent(run.id)}`}
                        />
                      ))}
                    </div>
                  </section>
                ) : null}

                {/* Top interventions + highest-risk narratives */}
                <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
                  {topRankings.length > 0 ? (
                    <Card className="space-y-3" padded>
                      <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
                        <ListOrdered className="h-4 w-4 text-electric" /> Top
                        interventions
                      </h3>
                      <InterventionRankingTable rankings={topRankings} />
                    </Card>
                  ) : (
                    <div />
                  )}
                  <RiskNarrativeList narratives={highestRisk} />
                </div>

                {/* Decision history */}
                {recentRuns.length > 0 ? (
                  <section className="space-y-3">
                    <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
                      <Clock3 className="h-4 w-4 text-electric" /> Decision history
                    </h3>
                    <div className="grid gap-4 lg:grid-cols-2">
                      {recentRuns.slice(0, 6).map((run) => (
                        <RecommendationCard
                          key={run.id}
                          run={run}
                          showLimitations={false}
                          href={`/dashboard/intelligence/decisions?runId=${encodeURIComponent(run.id)}`}
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
