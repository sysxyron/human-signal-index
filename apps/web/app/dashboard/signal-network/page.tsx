// =============================================================================
// HSI Phase 70.4 — Signal Network (/dashboard/signal-network). Server Component,
// force-dynamic, reviewer+. Signal totals, health breakdown, relationship
// counts, influence rankings, narrative + forecast attribution, and Phase 71
// readiness. List + metrics only — no graph visualization. Read-only.
// =============================================================================

import { TopNav } from '@hsi/ui';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { hasRole } from '@/lib/security/rbac-audit';
import { ErrorState } from '@/components/signals/states';
import { DashboardPage } from '../../../components/dashboard-shell';
import { getSignalNetworkDashboard, getSignalReadiness } from '@/lib/signal-network/data';
import {
  SignalNetworkOverview, SignalHealthPanel, RelationshipCountsPanel, InfluenceRankingPanel,
  NarrativeAttributionPanel, ForecastAttributionPanel, SignalReadinessPanel,
} from '@/components/signal-network/panels';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function SignalNetworkPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !hasRole(role ?? undefined, 'reviewer')) {
    return (
      <>
        <TopNav title="Signal Network" subtitle="Signal relationships & influence" />
        <main className="space-y-6 p-5 lg:p-6">
          <ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message={user ? 'Signal Network is available to reviewers and admins.' : 'Sign in to view signal intelligence.'} redirectedFrom="/dashboard/signal-network" />
        </main>
      </>
    );
  }

  const [d, readiness] = await Promise.all([getSignalNetworkDashboard(), getSignalReadiness()]);

  return (
    <DashboardPage
      title="Signal Network Intelligence"
      subtitle="Signal health, relationships, influence, and narrative/forecast attribution — read from the evidence graph, narratives, and forecasts. No inferred relationships; no fabricated metrics."
    >
      <div className="space-y-8">
        <SignalNetworkOverview d={d} />
        <div className="grid gap-6 xl:grid-cols-2">
          <SignalHealthPanel d={d} />
          <RelationshipCountsPanel d={d} />
        </div>
        <InfluenceRankingPanel d={d} />
        <div className="grid gap-6 xl:grid-cols-2">
          <NarrativeAttributionPanel d={d} />
          <ForecastAttributionPanel d={d} />
        </div>
        <SignalReadinessPanel r={readiness} />
      </div>
    </DashboardPage>
  );
}
