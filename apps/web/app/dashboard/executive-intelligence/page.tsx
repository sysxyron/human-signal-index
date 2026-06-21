// =============================================================================
// HSI Phase 74 — Executive Intelligence & Early Warning (/dashboard/executive-
// intelligence). Server Component, force-dynamic, reviewer+. A detection layer
// (not prediction): executive overview, deterministic risk monitor, early-warning
// alerts, an executive brief, narrative velocity, trust + forecast health,
// forecast divergence, blind-spot/contradiction/geo monitors, and platform health.
// Read-only; real data only; every signal is explainable + reproducible.
//
// NOTE: `/dashboard/executive` is the Phase 26 executive command center; this new
// Executive Intelligence surface lives at `/dashboard/executive-intelligence`.
// =============================================================================

import { TopNav } from '@hsi/ui';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { hasRole } from '@/lib/security/rbac-audit';
import { ErrorState } from '@/components/signals/states';
import { DashboardPage } from '../../../components/dashboard-shell';
import { getExecutiveIntelligence } from '@/lib/executive/data';
import {
  ExecutiveOverview, RiskBoard, AlertsPanel, ExecutiveBriefPanel, NarrativeVelocityPanel,
  TrustForecastRow, DivergencePanel, MonitorsRow, PlatformHealthPanel,
} from '@/components/executive-intelligence/panels';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ExecutiveIntelligencePage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !hasRole(role ?? undefined, 'reviewer')) {
    return (
      <>
        <TopNav title="Executive Intelligence" subtitle="Early warning & detection" />
        <main className="space-y-6 p-5 lg:p-6">
          <ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message={user ? 'Executive Intelligence is available to reviewers and admins.' : 'Sign in to view executive intelligence.'} redirectedFrom="/dashboard/executive-intelligence" />
        </main>
      </>
    );
  }

  const d = await getExecutiveIntelligence();

  return (
    <DashboardPage
      title="Executive Intelligence & Early Warning"
      subtitle="What should you be paying attention to right now? Deterministic, explainable detection over real platform data — no prediction, no black-box scores."
    >
      <div className="space-y-8">
        <ExecutiveOverview d={d} />
        <RiskBoard d={d} />
        <AlertsPanel d={d} />
        <ExecutiveBriefPanel d={d} />
        <TrustForecastRow d={d} />
        <DivergencePanel d={d} />
        <MonitorsRow d={d} />
        <NarrativeVelocityPanel d={d} />
        <PlatformHealthPanel signals={d.platformHealth} />
      </div>
    </DashboardPage>
  );
}
