// =============================================================================
// HSI Phase 65 — Narratives (/dashboard/narratives). Server Component, force-
// dynamic, reviewer+ (admins also seed). Dashboard: overview, executive
// intelligence, recent activity, alert feed, and the narrative list. All computed
// from observable structure — no AI-generated narratives. RLS-gated.
// =============================================================================

import { TopNav } from '@hsi/ui';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { hasRole } from '@/lib/security/rbac-audit';
import { isAdmin } from '@/lib/security/view';
import { ErrorState } from '@/components/signals/states';
import { DashboardPage } from '../../../components/dashboard-shell';
import { getNarrativeDashboard } from '@/lib/narrative-intelligence/data';
import {
  NarrativeOverview, ExecutiveNarrativeMetrics, RecentNarratives, NarrativeAlertFeed, NarrativeList,
} from '@/components/narratives/panels';
import { CreateNarrativeForm } from '@/components/narratives/NarrativeControls';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function NarrativesPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !hasRole(role ?? undefined, 'reviewer')) {
    return (
      <>
        <TopNav title="Narratives" subtitle="Narrative intelligence" />
        <main className="space-y-6 p-5 lg:p-6">
          <ErrorState
            code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'}
            title="Insufficient permissions"
            message={user ? 'Narrative Intelligence is available to reviewers and admins.' : 'Sign in to explore narratives.'}
            redirectedFrom="/dashboard/narratives"
          />
        </main>
      </>
    );
  }

  const admin = isAdmin(role);
  const d = await getNarrativeDashboard();

  return (
    <DashboardPage
      title="Narrative Intelligence"
      subtitle="Observable information structures — recurring claims, sources, evidence & actors that reinforce or challenge a storyline. No moderation, no truth scoring."
    >
      <div className="space-y-8">
        <ExecutiveNarrativeMetrics d={d} />
        <NarrativeOverview d={d} />
        <RecentNarratives d={d} />
        <NarrativeAlertFeed alerts={d.alerts} />
        {admin ? <CreateNarrativeForm /> : null}
        <NarrativeList items={d.all} />
      </div>
    </DashboardPage>
  );
}
