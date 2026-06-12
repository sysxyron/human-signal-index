// =============================================================================
// HSI Phase 18 — Intelligence Operations Center (/dashboard/intelligence/operations).
// Server Component, force-dynamic. getOperationsDashboardAction() returns every
// widget in one payload: system health, active runs, the research queue,
// escalations, agent performance, recent failures, trust status, and the
// governance backlog. A curator may start a run (CreateRunControl) and seed
// workflow templates. Researcher+ view. "Everything visible in one screen."
//
// Offline (NOT_CONFIGURED) → labeled demo from the @hsi/research-orchestrator.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { Activity, Info } from 'lucide-react';
import type { OperationsDashboardData } from '@hsi/shared-types';
import {
  createResearchRunAction,
  getOperationsDashboardAction,
} from '@/lib/orchestration/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { canCurate, canResearch, demoOperationsDashboard, healthDecor } from '@/lib/orchestration/view';
import { IntelligenceOpsNav } from '@/components/intelligence/IntelligenceOpsNav';
import { CreateRunControl } from '@/components/intelligence/CreateRunControl';
import {
  ActiveRunsPanel,
  AgentPerformancePanel,
  EscalationPanel,
  GovernanceBacklogPanel,
  RecentFailuresPanel,
  ResearchQueuePanel,
  SystemHealthPanel,
  TrustStatusPanel,
} from '@/components/intelligence/panels';
import { DemoBadge } from '@/components/signals/badges';
import { ErrorState, OfflineDemoBanner, type DbErrorCode } from '@/components/signals/states';
import type { CollectiveHighlights } from '@hsi/shared-types';
import { getCollectiveHighlightsAction } from '@/lib/collective/actions';
import { demoCollectiveHighlights } from '@/lib/collective/view';
import { CollectiveHighlightCards } from '@/components/collective/CollectiveHighlightCards';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function OperationsPage() {
  const [res, role, user] = await Promise.all([
    getOperationsDashboardAction(),
    getSessionRole(),
    getUser(),
  ]);
  const mayView = canResearch(role) && Boolean(user);
  const mayCreate = canCurate(role) && Boolean(user);

  let data: OperationsDashboardData | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;

  if (res.ok) data = res.data;
  else if (res.code === 'NOT_CONFIGURED') {
    data = demoOperationsDashboard();
    isDemo = true;
  } else errored = { message: res.error, code: res.code };

  const forbidden = !isDemo && res.ok && !mayView;

  // ADDITIVE (Phase 20): a defensive collective-intelligence highlights strip.
  let collectiveHighlights: CollectiveHighlights | null = null;
  let collectiveDemoLabeled = false;
  try {
    const colRes = await getCollectiveHighlightsAction();
    if (colRes.ok) {
      collectiveHighlights = colRes.data;
    } else if (colRes.code === 'NOT_CONFIGURED') {
      collectiveHighlights = demoCollectiveHighlights();
      collectiveDemoLabeled = true;
    }
  } catch {
    collectiveHighlights = null;
  }

  return (
    <>
      <TopNav
        title="Operations center"
        subtitle="A continuously operating intelligence system — everything in one screen"
      />
      <main className="space-y-6 p-5 lg:p-6">
        <IntelligenceOpsNav />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
              <Activity className="h-5 w-5 text-electric" /> Command center
            </h2>
            {isDemo ? <DemoBadge /> : null}
            {data ? (
              <span
                className="rounded-full px-2 py-0.5 text-caption font-semibold"
                style={{
                  color: healthDecor(data.overallStatus).color,
                  backgroundColor: `${healthDecor(data.overallStatus).color}1f`,
                  border: `1px solid ${healthDecor(data.overallStatus).color}55`,
                }}
              >
                {healthDecor(data.overallStatus).label}
              </span>
            ) : null}
          </div>
        </div>

        {isDemo ? <OfflineDemoBanner /> : null}

        <Card className="flex items-start gap-2 border-border bg-surface/50" padded>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption leading-relaxed text-text-secondary">
            The operations center <span className="font-semibold text-text-primary">coordinates</span>{' '}
            every Phase 1–17 engine. It is not autonomous: opportunities, escalations, and overrides
            are <span className="font-semibold text-text-primary">human-approved, auditable, and
            reversible</span>. Nothing is auto-published or auto-acted.
          </p>
        </Card>

        {mayCreate && !isDemo ? (
          <Card className="border-border" padded>
            <CreateRunControl action={createResearchRunAction} canCreate={mayCreate} demo={isDemo} />
          </Card>
        ) : null}

        {/* ADDITIVE (Phase 20): collective-intelligence highlights strip. */}
        {collectiveHighlights ? (
          <CollectiveHighlightCards highlights={collectiveHighlights} demo={collectiveDemoLabeled} />
        ) : null}

        {forbidden ? (
          <ErrorState title="Insufficient permissions" message="The operations center requires the researcher role or above." code="FORBIDDEN" />
        ) : errored ? (
          <ErrorState title="Could not load the operations center" message={errored.message} code={errored.code} redirectedFrom="/dashboard/intelligence/operations" />
        ) : !data ? null : (
          <div className="grid gap-4 lg:grid-cols-3">
            <SystemHealthPanel health={data.health} />
            <ActiveRunsPanel runs={data.activeRuns} />
            <ResearchQueuePanel queue={data.queue} depth={data.queueDepth} />
            <EscalationPanel escalations={data.escalations} />
            <AgentPerformancePanel agents={data.agentPerformance} />
            <RecentFailuresPanel runs={data.recentFailures} />
            <TrustStatusPanel avgTrust={data.avgTrust} />
            <GovernanceBacklogPanel backlog={data.governanceBacklog} />
          </div>
        )}
      </main>
    </>
  );
}
