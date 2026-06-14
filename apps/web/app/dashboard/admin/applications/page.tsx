// =============================================================================
// HSI Phase 25 — Admin Application Review Queue (/dashboard/admin/applications).
// Server Component, force-dynamic, ADMIN-ONLY. Approve / reject / request info on
// role applications. Approval assigns a role via IAM (never admin) + optional
// team; every action is audited. Offline → labeled demo. RBAC is never weakened.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { Inbox, ShieldCheck } from 'lucide-react';
import { listApplicationsAction, type AdminApplicationRow } from '@/lib/contributor/applications';
import { listAdminTeamsAction } from '@/lib/admin/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/security/view';
import { AdminNav } from '@/components/admin/AdminNav';
import { ApplicationsConsole } from '@/components/contributor/ApplicationsConsole';
import { ErrorState, OfflineDemoBanner } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const DEMO_APPS: AdminApplicationRow[] = [
  { id: 'demo-a1', userId: 'demo-u1', email: 'researcher.applicant@example.com', requestedPath: 'researcher_applicant', requestedRole: 'researcher', experienceSummary: '5 years OSINT and fact-checking.', reason: 'Want to verify signals.', organization: null, status: 'pending', reviewedBy: null, reviewedAt: null, reviewNotes: null, createdAt: '2026-06-12T08:00:00Z', updatedAt: null },
  { id: 'demo-a2', userId: 'demo-u2', email: 'org@newsroom.example', requestedPath: 'organization_applicant', requestedRole: 'curator', experienceSummary: 'Editorial lead at a regional newsroom.', reason: 'Coordinate a team of reviewers.', organization: 'Example Newsroom', status: 'pending', reviewedBy: null, reviewedAt: null, reviewNotes: null, createdAt: '2026-06-13T08:00:00Z', updatedAt: null },
];

export default async function AdminApplicationsPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !isAdmin(role)) {
    return (
      <>
        <TopNav title="Applications" subtitle="Role advancement review — admin only" />
        <main className="space-y-6 p-5 lg:p-6">
          <AdminNav />
          <ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message={user ? 'Application review is restricted to administrators.' : 'Sign in as an administrator.'} redirectedFrom="/dashboard/admin/applications" />
        </main>
      </>
    );
  }

  const res = await listApplicationsAction('pending');
  let applications: AdminApplicationRow[] = [];
  let isDemo = false;
  if (res.ok) applications = res.data;
  else if (res.code === 'NOT_CONFIGURED') { applications = DEMO_APPS; isDemo = true; }

  const teamsRes = await listAdminTeamsAction();
  const teams = teamsRes.ok ? teamsRes.data.teams.map((t) => ({ id: t.id, name: t.name })) : [];

  return (
    <>
      <TopNav title="Applications" subtitle="Review and approve role advancement" />
      <main className="space-y-6 p-5 lg:p-6">
        <AdminNav />
        {isDemo ? <OfflineDemoBanner /> : null}
        <Card className="flex items-start gap-2.5 border-border" padded>
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption text-text-secondary">Approving an application assigns a role through Identity &amp; Access Management. The <strong className="text-text-primary">admin</strong> role is never assignable here, and approvals are audited.</p>
        </Card>
        {res.ok || isDemo ? (
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><Inbox className="h-4 w-4 text-electric" /> Pending applications</h2>
            <ApplicationsConsole applications={applications} teams={teams} />
          </section>
        ) : (
          <ErrorState title="Could not load applications" message={res.error ?? 'Applications are unavailable right now.'} />
        )}
      </main>
    </>
  );
}
