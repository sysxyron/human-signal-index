// =============================================================================
// HSI Phase 15 — Decision Performance Dashboard (/dashboard/outcomes). Server
// Component, force-dynamic. getOutcomesDashboardAction() returns the
// DecisionPerformanceData: recommendation success rate, confidence accuracy,
// forecast accuracy, and decision ROI (stat cards); the outcome distribution
// across the 5 statuses; historical learning trends (calibrated confidence per
// intervention); top- and worst-performing interventions; and a recent-outcomes
// table (status + success score + confidence before→after) linking to each
// outcome's audit trail.
//
// A RecordOutcomeForm (reviewer+) records the OBSERVED outcome of a past
// recommendation → recordOutcomeAction → navigates to the new outcome. A
// RecomputeLearningButton (reviewer+) re-runs learnFromOutcomesAction. Charts are
// explainable; success + confidence + explanation + limitations are always
// surfaced. Offline (NOT_CONFIGURED) → labeled demo from the @hsi/outcome-
// intelligence outcomeDemo() fixtures.
// =============================================================================

import Link from 'next/link';
import { TopNav, Card } from '@hsi/ui';
import { TrendingUp, Info, Target, Crosshair, Coins, Gauge, ArrowRight } from 'lucide-react';
import type { DecisionPerformanceData } from '@hsi/shared-types';
import {
  getOutcomesDashboardAction,
  recordOutcomeAction,
  learnFromOutcomesAction,
} from '@/lib/outcome/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import {
  canReview,
  demoPerformanceData,
  demoRecommendationOptions,
  formatRate,
  formatRoi,
} from '@/lib/outcome/view';
import { OutcomeNav } from '@/components/outcome/OutcomeNav';
import { DemoBadge } from '@/components/signals/badges';
import {
  EmptyState,
  ErrorState,
  OfflineDemoBanner,
  type DbErrorCode,
} from '@/components/signals/states';
import { OutcomeDistributionBar } from '@/components/outcome/OutcomeDistributionBar';
import { LearningTrendChart } from '@/components/outcome/LearningTrendChart';
import { InterventionPerformanceTable } from '@/components/outcome/InterventionPerformanceTable';
import { RecentOutcomesTable } from '@/components/outcome/RecentOutcomesTable';
import { RecordOutcomeForm } from '@/components/outcome/RecordOutcomeForm';
import { RecomputeLearningButton } from '@/components/outcome/RecomputeLearningButton';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Target;
  accent: string;
}) {
  return (
    <Card className="relative overflow-hidden" padded>
      <div
        className="absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-20 blur-2xl"
        style={{ backgroundColor: accent }}
      />
      <div className="relative flex items-start justify-between">
        <span className="text-label text-text-muted">{label}</span>
        <span
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${accent}1f`, color: accent }}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="relative mt-3">
        <div className="text-3xl font-bold tracking-tight text-text-primary">{value}</div>
        <p className="mt-1 text-caption text-text-muted">{detail}</p>
      </div>
    </Card>
  );
}

export default async function OutcomesPage() {
  const [res, role, user] = await Promise.all([
    getOutcomesDashboardAction(),
    getSessionRole(),
    getUser(),
  ]);
  const canRecord = canReview(role) && Boolean(user);

  let data: DecisionPerformanceData | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;

  if (res.ok) {
    data = res.data;
  } else if (res.code === 'NOT_CONFIGURED') {
    data = demoPerformanceData();
    isDemo = true;
  } else {
    errored = { message: res.error, code: res.code };
  }

  const recommendationOptions = isDemo ? demoRecommendationOptions() : [];
  const hasData =
    data &&
    (data.recentOutcomes.length > 0 ||
      data.learningTrends.length > 0 ||
      data.outcomeDistribution.some((d) => d.count > 0));

  return (
    <>
      <TopNav
        title="Decision Performance"
        subtitle="Did the recommendation work, and are recommendations getting better?"
      />
      <main className="space-y-6 p-5 lg:p-6">
        <OutcomeNav />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
              <TrendingUp className="h-5 w-5 text-electric" /> Outcome overview
            </h2>
            {isDemo ? <DemoBadge /> : null}
          </div>
          <RecomputeLearningButton
            action={learnFromOutcomesAction}
            canRecompute={canRecord}
            demo={isDemo}
          />
        </div>

        {isDemo ? <OfflineDemoBanner /> : null}

        <Card className="flex items-start gap-2 border-border bg-surface/50" padded>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption leading-relaxed text-text-secondary">
            Outcome tracking closes the loop on Phase-13 decisions: it compares each
            recommendation&apos;s PREDICTED effect against the ACTUAL observed data to
            produce a{' '}
            <span className="font-semibold text-text-primary">
              success score, a confidence update (before → after), an explanation, and
              explicit limitations
            </span>{' '}
            — then learns calibrated confidence per intervention type over time. Every
            verdict is an AID for a human reviewer, never a certainty.
          </p>
        </Card>

        {/* ADDITIVE (Phase 16): link to the calibration dashboard. */}
        <Link href={'/dashboard/calibration' as never} className="block">
          <Card className="flex items-center gap-3 border-electric/30 bg-electric/[0.04] transition hover:border-electric/60" padded>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-electric/15 text-electric">
              <Gauge className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-body-sm font-semibold text-text-primary">
                See how calibrated these confidences are
              </p>
              <p className="text-caption text-text-muted">
                The calibration dashboard grounds &ldquo;what does X% confidence mean?&rdquo;
                in observed outcomes — reliability diagram, Brier score, and drift.
              </p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-electric" />
          </Card>
        </Link>

        {errored ? (
          <ErrorState
            title="Could not load decision performance"
            message={errored.message}
            code={errored.code}
            redirectedFrom="/dashboard/outcomes"
          />
        ) : !data ? null : (
          <div className="space-y-6">
            {/* Headline metrics */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Recommendation success rate"
                value={formatRate(data.successRate)}
                detail="observed outcomes that worked"
                icon={Target}
                accent="#10B981"
              />
              <StatCard
                label="Confidence accuracy"
                value={formatRate(data.confidenceAccuracy)}
                detail="calibration after observation"
                icon={Crosshair}
                accent="#3B82F6"
              />
              <StatCard
                label="Forecast accuracy"
                value={formatRate(data.forecastAccuracy)}
                detail="forecast state vs observed"
                icon={TrendingUp}
                accent="#06B6D4"
              />
              <StatCard
                label="Decision ROI"
                value={formatRoi(data.decisionRoi)}
                detail="value returned per decision"
                icon={Coins}
                accent="#F59E0B"
              />
            </div>

            {/* Record outcome + recompute */}
            <Card className="space-y-3" padded>
              <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
                <Target className="h-4 w-4 text-electric" /> Record an outcome
              </h3>
              <RecordOutcomeForm
                options={recommendationOptions}
                action={recordOutcomeAction}
                canRecord={canRecord}
                demo={isDemo}
              />
            </Card>

            {!hasData ? (
              <EmptyState
                icon={<TrendingUp className="h-5 w-5" />}
                title="No outcomes recorded yet"
                message="Record the observed outcome of a past recommendation above (reviewer+). Once outcomes accumulate, the distribution, learning trends, and intervention rankings populate here."
              />
            ) : (
              <>
                {/* Distribution + learning trends */}
                <div className="grid gap-6 lg:grid-cols-2">
                  <OutcomeDistributionBar distribution={data.outcomeDistribution} />
                  <LearningTrendChart trends={data.learningTrends} />
                </div>

                {/* Top + worst interventions */}
                <div className="grid gap-6 lg:grid-cols-2">
                  <InterventionPerformanceTable
                    interventions={data.topInterventions}
                    variant="top"
                  />
                  <InterventionPerformanceTable
                    interventions={data.worstInterventions}
                    variant="worst"
                  />
                </div>

                {/* Recent outcomes */}
                <RecentOutcomesTable outcomes={data.recentOutcomes} />
              </>
            )}
          </div>
        )}
      </main>
    </>
  );
}
