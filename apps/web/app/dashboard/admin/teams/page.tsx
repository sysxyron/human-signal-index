// =============================================================================
// HSI Phase 24B — Admin Teams console (/dashboard/admin/teams). Server Component,
// force-dynamic, ADMIN-ONLY. Manage membership on the existing team_members
// table: add/remove members, assign a team lead. Audited. Offline → demo.
// =============================================================================

import { TopNav } from '@hsi/ui';
import { UsersRound } from 'lucide-react';
import type { AdminTeamsData } from '@hsi/shared-types';
import { listAdminTeamsAction } from '@/lib/admin/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/security/view';
import { demoAdminTeams } from '@/lib/admin/view';
import { AdminNav } from '@/components/admin/AdminNav';
import { TeamsAdmin } from '@/components/admin/TeamsAdmin';
import { DemoBadge } from '@/components/signals/badges';
import { ErrorState, OfflineDemoBanner, type DbErrorCode } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminTeamsPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !isAdmin(role)) {
    return (
      <>
        <TopNav title="Teams" subtitle="Team management — admin only" />
        <main className="space-y-6 p-5 lg:p-6">
          <AdminNav />
          <ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message={user ? 'Team management is restricted to administrators.' : 'Sign in as an administrator.'} redirectedFrom="/dashboard/admin/teams" />
        </main>
      </>
    );
  }

  const res = await listAdminTeamsAction();
  let data: AdminTeamsData | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;
  if (res.ok) data = res.data;
  else if (res.code === 'NOT_CONFIGURED') { data = demoAdminTeams(); isDemo = true; }
  else errored = { message: res.error, code: res.code };

  return (
    <>
      <TopNav title="Teams" subtitle="Membership and leads for the eight operational teams" />
      <main className="space-y-6 p-5 lg:p-6">
        <AdminNav />
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary"><UsersRound className="h-5 w-5 text-electric" /> Team management</h2>
          {isDemo ? <DemoBadge /> : null}
        </div>
        {isDemo ? <OfflineDemoBanner /> : null}

        {errored ? (
          <ErrorState title="Could not load teams" message={errored.message} code={errored.code} redirectedFrom="/dashboard/admin/teams" />
        ) : !data ? null : (
          <TeamsAdmin data={data} canAct={isAdmin(role)} demo={isDemo} />
        )}
      </main>
    </>
  );
}
