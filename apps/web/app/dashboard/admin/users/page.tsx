// =============================================================================
// HSI Phase 24B — Admin Users console (/dashboard/admin/users). Server Component,
// force-dynamic, ADMIN-ONLY. Central user management: list, invite, approve,
// suspend, activate, disable, assign role. All actions are admin-only + audited.
// Offline → labeled demo.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { UserCog, Info } from 'lucide-react';
import type { AdminUsersData } from '@hsi/shared-types';
import { listUsersAction } from '@/lib/admin/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/security/view';
import { demoAdminUsers } from '@/lib/admin/view';
import { AdminNav } from '@/components/admin/AdminNav';
import { UsersConsole } from '@/components/admin/UsersConsole';
import { DemoBadge } from '@/components/signals/badges';
import { ErrorState, OfflineDemoBanner, type DbErrorCode } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminUsersPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !isAdmin(role)) {
    return (
      <>
        <TopNav title="Users" subtitle="Identity & Access Management — admin only" />
        <main className="space-y-6 p-5 lg:p-6">
          <AdminNav />
          <ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message={user ? 'User management is restricted to administrators.' : 'Sign in as an administrator to manage users.'} redirectedFrom="/dashboard/admin/users" />
        </main>
      </>
    );
  }

  const res = await listUsersAction();
  let data: AdminUsersData | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;
  if (res.ok) data = res.data;
  else if (res.code === 'NOT_CONFIGURED') { data = demoAdminUsers(); isDemo = true; }
  else errored = { message: res.error, code: res.code };

  return (
    <>
      <TopNav title="Users" subtitle="Invite, approve, and manage every account from one place" />
      <main className="space-y-6 p-5 lg:p-6">
        <AdminNav />
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary"><UserCog className="h-5 w-5 text-electric" /> User management</h2>
          {isDemo ? <DemoBadge /> : null}
        </div>
        {isDemo ? <OfflineDemoBanner /> : null}
        <Card className="flex items-start gap-2 border-border bg-surface/50" padded>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption leading-relaxed text-text-secondary">
            Invitations create an account via Supabase Auth (server-side, service-role) and assign a role in
            <span className="font-mono"> public.user_roles</span> — never the JWT. New users start <span className="font-semibold text-warning">pending</span> until
            you approve them. Every action is written to the security audit log.
          </p>
        </Card>

        {errored ? (
          <ErrorState title="Could not load users" message={errored.message} code={errored.code} redirectedFrom="/dashboard/admin/users" />
        ) : !data ? null : (
          <UsersConsole data={data} canAct={isAdmin(role)} demo={isDemo} />
        )}
      </main>
    </>
  );
}
