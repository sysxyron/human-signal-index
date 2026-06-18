// =============================================================================
// HSI Phase 48 — Analyst Workspace (/dashboard/my-work). Server Component,
// force-dynamic, researcher+ (gate preserved from Phase 24). The analyst's
// operational workspace: what they own, what needs attention, what's blocked,
// what to work next. Read-only — reuses the cached intelligence layers; touches
// no permissions or review-workflow logic. The operations-os "My Work" data
// layer is left intact (no longer rendered here, not modified).
// =============================================================================

import { TopNav } from '@hsi/ui';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { canResearch } from '@/lib/operations-os/view';
import { OperationsNav } from '@/components/operations-os/OperationsNav';
import { ErrorState } from '@/components/signals/states';
import { getPublicIntelligenceBundle, getSignalLibraryData } from '@/lib/public-intelligence';
import { getSourceIntelligence } from '@/lib/source-intelligence';
import { getOperationsIntelligence } from '@/lib/operations-intelligence';
import {
  MyWorkOverview, WorkloadView, PersonalMetrics, PriorityEngine,
  type MyWork, type Workload, type PersonalMetricsData, type Priorities,
} from '@/components/analyst-workspace/WorkspacePanels';
import { InvestigationQueue } from '@/components/analyst-workspace/InvestigationQueue';
import { QuickActions } from '@/components/mission-control/QuickActions';
import { ReadOnlyNotice } from '@/components/navigation/ReadOnlyNotice';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function MyWorkPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !canResearch(role)) {
    return (
      <>
        <TopNav title="Analyst Workspace" subtitle="Your personal work queue" />
        <main className="space-y-6 p-5 lg:p-6">
          <OperationsNav />
          <ErrorState
            code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'}
            title="Insufficient permissions"
            message={user ? 'The Analyst Workspace is available to the researcher role or above.' : 'Sign in to view your workspace.'}
            redirectedFrom="/dashboard/my-work"
          />
        </main>
      </>
    );
  }

  const [bundle, library, src, ops] = await Promise.all([
    getPublicIntelligenceBundle(),
    getSignalLibraryData(),
    getSourceIntelligence(),
    getOperationsIntelligence(),
  ]);
  void src; // cached alongside; reserved for future workspace widgets

  const { metrics, activityBar } = bundle;
  const riskFacets = library.facets.risks;
  const stage = (name: string) => ops.pipeline.find((s) => s.stage === name)?.count ?? 0;
  const signalC = stage('Signal');
  const evidenceC = stage('Evidence');
  const analysisC = stage('Analysis');
  const reviewC = stage('Review');
  const publicationC = stage('Publication');

  const work: MyWork = {
    assignedSignals: signalC + evidenceC + analysisC,
    assignedReviews: ops.review.pending,
    assignedReports: metrics.publishedReports,
    pendingWork: signalC + evidenceC + analysisC + reviewC,
    completedToday: activityBar.publishedToday + ops.review.approvedToday,
  };

  const workload: Workload = {
    open: signalC,
    inProgress: evidenceC + analysisC,
    waitingReview: reviewC,
    published: publicationC,
    completed: publicationC,
  };

  const personalMetrics: PersonalMetricsData = {
    investigationsCompleted: metrics.publishedReports,
    reviewsCompleted: ops.review.approvedToday + ops.review.rejectedToday,
    avgTurnaround: ops.review.avgReviewHours == null ? '—' : `${ops.review.avgReviewHours}h`,
    publicationImpact: metrics.publishedReports,
    traceabilityAvg: metrics.traceabilityScore,
  };

  const tier = (k: string) => riskFacets.find((r) => r.key === k)?.count ?? 0;
  const now = Date.now();
  const stale = library.signals.filter((s) => s.publishedAt && now - Date.parse(s.publishedAt) > 180 * 86_400_000).length;
  const recentlyEscalated = library.signals.filter((s) => s.risk_level >= 4 && s.publishedAt && now - Date.parse(s.publishedAt) <= 30 * 86_400_000).length;
  const priorities: Priorities = {
    critical: tier('Critical'),
    highRisk: tier('High'),
    reviewDue: ops.review.pending,
    recentlyEscalated,
    stale,
  };

  return (
    <>
      <TopNav title="Analyst Workspace" subtitle="What you own, what needs attention, what's blocked, what to work next" />
      <main className="space-y-6 p-5 lg:p-6">
        <OperationsNav />

        <ReadOnlyNotice
          title="What you can do here"
          points={[
            'This analyst workspace is read-only — it shows the cases moving through the pipeline and their evidence chains.',
            'Submit new signals from “Submit a Signal”.',
            'Reviewers act on items in the Review Queue; drafting and publishing a report requires the curator role (Publishing).',
            'Open any case to inspect its evidence, traceability, and status.',
          ]}
          actions={[{ label: 'Submit a Signal', href: '/submit-a-signal' }]}
        />

        {/* Part 1 — my work */}
        <MyWorkOverview work={work} />

        {/* Part 9 — quick actions (role-aware) */}
        <QuickActions role={role} />

        {/* Part 8 + Part 4 + Part 7 */}
        <div className="grid gap-4 xl:grid-cols-3">
          <PriorityEngine priorities={priorities} />
          <WorkloadView workload={workload} />
          <PersonalMetrics metrics={personalMetrics} />
        </div>

        {/* Part 2 + Part 3 + Part 5 + Part 6 — investigation queue + case workspace + drawer */}
        <div className="space-y-3">
          <h2 className="text-h6 font-semibold text-text-primary">Investigation queue</h2>
          <InvestigationQueue cases={library.signals} />
        </div>
      </main>
    </>
  );
}
