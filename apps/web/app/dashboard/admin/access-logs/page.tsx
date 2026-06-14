// =============================================================================
// HSI Phase 24B — Admin Access Logs (/dashboard/admin/access-logs). Server
// Component, force-dynamic, ADMIN-ONLY. Read-only view of
// public.security_audit_events with simple filters (event type, user via the
// table). Offline → demo.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { ScrollText, Info } from 'lucide-react';
import type { AdminAccessLogsData } from '@hsi/shared-types';
import { listAccessLogsAction } from '@/lib/admin/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/security/view';
import { demoAccessLogs } from '@/lib/admin/view';
import { AdminNav } from '@/components/admin/AdminNav';
import { AccessLogsTable } from '@/components/admin/AdminTables';
import { DemoBadge } from '@/components/signals/badges';
import { ErrorState, OfflineDemoBanner, type DbErrorCode } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface SearchParams { eventType?: string; userId?: string }

export default async function AdminAccessLogsPage({ searchParams }: { searchParams: SearchParams }) {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !isAdmin(role)) {
    return (
      <>
        <TopNav title="Access Logs" subtitle="Security audit trail — admin only" />
        <main className="space-y-6 p-5 lg:p-6">
          <AdminNav />
          <ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message={user ? 'Access logs are restricted to administrators.' : 'Sign in as an administrator.'} redirectedFrom="/dashboard/admin/access-logs" />
        </main>
      </>
    );
  }

  const res = await listAccessLogsAction({ eventType: searchParams.eventType || undefined, userId: searchParams.userId || undefined });
  let data: AdminAccessLogsData | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;
  if (res.ok) data = res.data;
  else if (res.code === 'NOT_CONFIGURED') { data = demoAccessLogs(); isDemo = true; }
  else errored = { message: res.error, code: res.code };

  return (
    <>
      <TopNav title="Access Logs" subtitle="Who did what, and when — the IAM + security audit trail" />
      <main className="space-y-6 p-5 lg:p-6">
        <AdminNav />
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary"><ScrollText className="h-5 w-5 text-electric" /> Access logs</h2>
          {isDemo ? <DemoBadge /> : null}
        </div>
        {isDemo ? <OfflineDemoBanner /> : null}
        <Card className="flex items-start gap-2 border-border bg-surface/50" padded>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption leading-relaxed text-text-secondary">Source: <span className="font-mono">public.security_audit_events</span>. Showing the most recent 500 events{searchParams.eventType ? ` filtered to ${searchParams.eventType}` : ''}.</p>
        </Card>

        {errored ? (
          <ErrorState title="Could not load access logs" message={errored.message} code={errored.code} redirectedFrom="/dashboard/admin/access-logs" />
        ) : !data ? null : (
          <AccessLogsTable data={data} />
        )}
      </main>
    </>
  );
}
