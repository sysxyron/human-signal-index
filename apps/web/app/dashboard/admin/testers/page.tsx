// =============================================================================
// HSI Phase 24B — Admin Testers console (/dashboard/admin/testers). Server
// Component, force-dynamic, ADMIN-ONLY. Read-only beta-tester management view:
// role/team/last-login + activity + readiness. Offline → demo.
// =============================================================================

import { TopNav } from '@hsi/ui';
import { GraduationCap } from 'lucide-react';
import type { AdminTestersData } from '@hsi/shared-types';
import { listTestersAction } from '@/lib/admin/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/security/view';
import { demoAdminTesters } from '@/lib/admin/view';
import { AdminNav } from '@/components/admin/AdminNav';
import { TestersTable } from '@/components/admin/AdminTables';
import { DemoBadge } from '@/components/signals/badges';
import { ErrorState, OfflineDemoBanner, type DbErrorCode } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminTestersPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !isAdmin(role)) {
    return (
      <>
        <TopNav title="Testers" subtitle="Beta tester management — admin only" />
        <main className="space-y-6 p-5 lg:p-6">
          <AdminNav />
          <ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message={user ? 'Tester management is restricted to administrators.' : 'Sign in as an administrator.'} redirectedFrom="/dashboard/admin/testers" />
        </main>
      </>
    );
  }

  const res = await listTestersAction();
  let data: AdminTestersData | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;
  if (res.ok) data = res.data;
  else if (res.code === 'NOT_CONFIGURED') { data = demoAdminTesters(); isDemo = true; }
  else errored = { message: res.error, code: res.code };

  return (
    <>
      <TopNav title="Testers" subtitle="Who is testing, what they've done, and whether they're ready" />
      <main className="space-y-6 p-5 lg:p-6">
        <AdminNav />
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary"><GraduationCap className="h-5 w-5 text-electric" /> Beta testers</h2>
          {isDemo ? <DemoBadge /> : null}
        </div>
        {isDemo ? <OfflineDemoBanner /> : null}

        {errored ? (
          <ErrorState title="Could not load testers" message={errored.message} code={errored.code} redirectedFrom="/dashboard/admin/testers" />
        ) : !data ? null : (
          <TestersTable data={data} />
        )}
      </main>
    </>
  );
}
