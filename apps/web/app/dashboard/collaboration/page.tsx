// =============================================================================
// HSI Phase 53 — Collaboration & Investigation Network (/dashboard/collaboration).
// Server Component, force-dynamic, researcher+ (gate reuses canResearch). Read-only
// structured operational coordination — who's working on what, where the
// bottlenecks are, what's publication-ready. NOT chat. Role-aware (per-analyst load
// is admin-only). Reuses the cached intelligence layers; touches no RBAC/auth/
// billing/workflow.
// =============================================================================

import { TopNav } from '@hsi/ui';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { canResearch } from '@/lib/operations-os/view';
import { ErrorState } from '@/components/signals/states';
import { getCollaborationData } from '@/lib/collaboration-intelligence';
import {
  ExecutiveCollabSummary, TeamOpsOverview, OwnershipPanel, WorkloadBalancing,
  EscalationCenter, CollaborationTimeline, CrossTeamIntelligence, InvestigationHealthPanel,
} from '@/components/collaboration/panels';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function CollaborationPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);

  if (!user || !canResearch(role)) {
    return (
      <>
        <TopNav title="Collaboration Network" subtitle="Structured operational coordination" />
        <main className="space-y-6 p-5 lg:p-6">
          <ErrorState
            code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'}
            title="Insufficient permissions"
            message={user ? 'The Collaboration Network is available to the researcher role or above.' : 'Sign in to view the collaboration network.'}
            redirectedFrom="/dashboard/collaboration"
          />
        </main>
      </>
    );
  }

  const c = await getCollaborationData(role);

  return (
    <>
      <TopNav title="Collaboration Network" subtitle="Who's working on what, where the bottlenecks are, what's publication-ready" />
      <main className="space-y-6 p-5 lg:p-6">
        {/* Part 9 — executive collaboration summary (role-aware) */}
        <ExecutiveCollabSummary summary={c.summary} role={c.role} />

        {/* Part 2 — team operations overview */}
        <TeamOpsOverview ops={c.teamOps} />

        {/* Part 3 — ownership, Part 8 — investigation health */}
        <div className="grid gap-4 xl:grid-cols-2">
          <OwnershipPanel ownership={c.ownership} />
          <InvestigationHealthPanel health={c.health} />
        </div>

        {/* Part 4 — workload balancing (per-analyst ratios admin-only) */}
        <WorkloadBalancing workload={c.workload} isAdmin={c.isAdmin} />

        {/* Part 5 — escalation, Part 7 — cross-team intelligence */}
        <div className="grid gap-4 xl:grid-cols-2">
          <EscalationCenter escalations={c.escalations} />
          <CrossTeamIntelligence data={c.crossTeam} />
        </div>

        {/* Part 6 — collaboration timeline */}
        <CollaborationTimeline items={c.timeline} />
      </main>
    </>
  );
}
