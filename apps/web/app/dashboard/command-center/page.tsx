// =============================================================================
// HSI Phase 73 — Global Operations Center (/dashboard/command-center). Server
// Component, force-dynamic, reviewer+. The executive command surface: mission
// control, executive overview, attention queue, intelligence health, narrative/
// forecast/geo/transparency watch, relationship audit, and timeline — composed
// from existing intelligence. Read-only; real counts only; deterministic status.
//
// NOTE: `/dashboard/operations-center` is already taken by the Phase 24 Human
// Operations Center (team workloads); this Global Operations Center lives at
// `/dashboard/command-center` to avoid colliding with that existing feature.
// =============================================================================

import { TopNav } from '@hsi/ui';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { hasRole } from '@/lib/security/rbac-audit';
import { ErrorState } from '@/components/signals/states';
import { DashboardPage } from '../../../components/dashboard-shell';
import { getOperationsCenter } from '@/lib/operations-center/data';
import {
  MissionControl, ExecutiveOverview, AttentionQueue, IntelligenceHealthPanel,
  NarrativeWatch, ForecastWatch, GeoWatch, TransparencyWatch, RelationshipAudit, OperationsTimeline,
} from '@/components/operations-center/panels';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function CommandCenterPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !hasRole(role ?? undefined, 'reviewer')) {
    return (
      <>
        <TopNav title="Command Center" subtitle="Global operations command" />
        <main className="space-y-6 p-5 lg:p-6">
          <ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message={user ? 'The Command Center is available to reviewers and admins.' : 'Sign in to access the command center.'} redirectedFrom="/dashboard/command-center" />
        </main>
      </>
    );
  }

  const d = await getOperationsCenter();

  return (
    <DashboardPage
      title="Global Operations Center"
      subtitle="Unified operational intelligence — what requires attention right now, with full traceability. Real counts only; statuses use documented deterministic thresholds."
    >
      <div className="space-y-8">
        <MissionControl d={d} />
        <ExecutiveOverview d={d} />
        <AttentionQueue d={d} />
        <div className="grid gap-6 xl:grid-cols-2">
          <IntelligenceHealthPanel d={d} />
          <TransparencyWatch d={d} />
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <NarrativeWatch d={d} />
          <ForecastWatch d={d} />
        </div>
        <GeoWatch d={d} />
        <div className="grid gap-6 xl:grid-cols-2">
          <RelationshipAudit d={d} />
          <OperationsTimeline d={d} />
        </div>
      </div>
    </DashboardPage>
  );
}
