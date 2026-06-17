import { Suspense } from 'react';
import { TopNav } from '@hsi/ui';
import { SafeActionButton } from '@/components/navigation/SafeActionButton';
import { ROUTES } from '@/lib/navigation/routes';
import { AccessDeniedNotice } from '@/components/governance/AccessDeniedNotice';
import { RoleTaskCards } from '@/components/navigation/RoleTaskCards';
import { getSessionRole } from '@/lib/supabase/server';
import { getPublicIntelligenceBundle, getSignalLibraryData } from '@/lib/public-intelligence';
import { getSourceIntelligence } from '@/lib/source-intelligence';
import { getOperationsIntelligence } from '@/lib/operations-intelligence';
import { OperationsOverview, ExecutiveSummary, type OverviewData, type ExecSummary } from '@/components/mission-control/OverviewPanels';
import { RiskCommandPanel, SignalFlowPipeline, ReviewOperations } from '@/components/mission-control/RiskOpsPanels';
import { CategoryHeatmapStrip, ActivityStream, SourceOperations, PublicationOperations } from '@/components/mission-control/IntelPanels';
import { QuickActions } from '@/components/mission-control/QuickActions';

export default async function MissionControlPage() {
  const [bundle, library, src, ops, role] = await Promise.all([
    getPublicIntelligenceBundle(),
    getSignalLibraryData(),
    getSourceIntelligence(),
    getOperationsIntelligence(),
    getSessionRole(),
  ]);

  const { metrics, activityBar, activityFeed, categoryActivity } = bundle;
  const riskFacets = library.facets.risks;
  const highRisk = riskFacets.filter((r) => r.key === 'Critical' || r.key === 'High').reduce((s, r) => s + r.count, 0);

  const overview: OverviewData = {
    activeSignals: activityBar.activeSignals,
    pendingReviews: metrics.openReviews,
    publishedToday: activityBar.publishedToday,
    highRisk,
    sourcesActive: src.health.active,
    traceabilityScore: metrics.traceabilityScore,
  };

  const topRisk = [...riskFacets].sort((a, b) => b.count - a.count).find((r) => r.count > 0)?.key ?? '—';
  const topCategory = [...categoryActivity].sort((a, b) => b.count - a.count).find((c) => c.count > 0)?.category ?? '—';
  const topSourceCategory = [...src.coverage].sort((a, b) => b.sources - a.sources).find((c) => c.sources > 0)?.category ?? '—';
  const backlog = ops.review.backlog;
  const statusTone: 'green' | 'amber' | 'red' = src.health.failing > 3 ? 'red' : highRisk > 0 || backlog > 20 ? 'amber' : 'green';
  const status = statusTone === 'green' ? 'Operational' : statusTone === 'amber' ? 'Elevated' : 'Degraded';
  const health = src.health.failing > 3 ? 'Degraded' : src.health.failing > 0 ? 'Watch' : 'Healthy';
  const summary: ExecSummary = { status, statusTone, topRisk, topCategory, topSourceCategory, backlog, health };

  const recent = library.signals
    .filter((s) => s.status === 'Published')
    .slice(0, 5)
    .map((s) => ({ id: s.id, title: s.title, dateLabel: s.dateLabel, category: s.category }));

  return (
    <>
      <TopNav title="Mission Control" subtitle="Intelligence operations center — what's happening, what matters, what needs attention" />
      <main className="space-y-6 p-5 lg:p-6">
        <Suspense fallback={null}>
          <AccessDeniedNotice />
        </Suspense>
        <RoleTaskCards />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-h4 font-semibold text-text-primary">Operations overview</h2>
            <p className="text-body-sm text-text-muted">Live operational intelligence · read-only</p>
          </div>
          <SafeActionButton variant="primary" href={ROUTES.publishingNew}>New report</SafeActionButton>
        </div>

        {/* Part 9 — executive summary (readable in 10 seconds) */}
        <ExecutiveSummary summary={summary} />

        {/* Part 1 — operations overview */}
        <OperationsOverview data={overview} />

        {/* Part 10 — analyst quick actions (role-aware) */}
        <QuickActions role={role} />

        {/* Part 3 + Part 4 — risk command + review operations */}
        <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <RiskCommandPanel risks={riskFacets} trend={library.trends.riskOverTime} />
          <ReviewOperations review={ops.review} />
        </div>

        {/* Part 5 — signal flow pipeline */}
        <SignalFlowPipeline stages={ops.pipeline} />

        {/* Part 6 + Part 2 — category heatmap + activity stream */}
        <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <CategoryHeatmapStrip activity={categoryActivity} />
          <ActivityStream items={activityFeed} />
        </div>

        {/* Part 7 + Part 8 — source operations + publication operations */}
        <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <SourceOperations health={src.health} topSources={src.analytics.topSources} coverage={src.coverage} />
          <PublicationOperations publishedReports={metrics.publishedReports} traceabilityScore={metrics.traceabilityScore} recent={recent} />
        </div>
      </main>
    </>
  );
}
