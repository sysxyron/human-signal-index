// =============================================================================
// HSI Phase 70.3 — Source Discovery (/dashboard/source-discovery). Server
// Component, force-dynamic, reviewer+ (admins import + run agents). CSV import,
// candidate review queues, signal candidates, discovery runs. NOTHING activates a
// source or publishes a signal here — approval creates a PAUSED source only.
// =============================================================================

import { TopNav } from '@hsi/ui';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { hasRole } from '@/lib/security/rbac-audit';
import { isAdmin } from '@/lib/security/view';
import { ErrorState } from '@/components/signals/states';
import { DashboardPage } from '../../../components/dashboard-shell';
import { getSourceDiscoveryDashboard } from '@/lib/source-discovery/data';
import { DiscoveryOverview, CandidateQueue, SignalCandidateQueue, BatchList, RunList } from '@/components/source-discovery/panels';
import { ImportPanel, AgentRunButtons } from '@/components/source-discovery/Controls';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function SourceDiscoveryPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !hasRole(role ?? undefined, 'reviewer')) {
    return (
      <>
        <TopNav title="Source Discovery" subtitle="Source import, discovery & signal scout" />
        <main className="space-y-6 p-5 lg:p-6">
          <ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message={user ? 'Source Discovery is available to reviewers and admins.' : 'Sign in to review source candidates.'} redirectedFrom="/dashboard/source-discovery" />
        </main>
      </>
    );
  }

  const admin = isAdmin(role);
  const d = await getSourceDiscoveryDashboard();

  return (
    <DashboardPage
      title="Source Discovery & Import"
      subtitle="Bulk import, duplicate detection, deterministic classification, agent suggestions — all human-reviewed. Approval creates a PAUSED source; nothing activates or publishes automatically."
      actions={admin ? <AgentRunButtons isAdmin={admin} /> : undefined}
    >
      <div className="space-y-8">
        <DiscoveryOverview d={d} />
        <ImportPanel isAdmin={admin} />
        <CandidateQueue title="Pending review" candidates={d.pending} empty="No candidates awaiting review." />
        {d.duplicates.length > 0 ? <CandidateQueue title="Flagged duplicates" candidates={d.duplicates} empty="No duplicates." /> : null}
        <SignalCandidateQueue signals={d.signalCandidates} />
        <div className="grid gap-6 xl:grid-cols-2">
          <BatchList batches={d.batches} />
          <RunList runs={d.runs} />
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <CandidateQueue title="Recently approved" candidates={d.approved} empty="None yet." />
          <CandidateQueue title="Recently rejected" candidates={d.rejected} empty="None yet." />
        </div>
      </div>
    </DashboardPage>
  );
}
