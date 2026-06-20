// =============================================================================
// HSI Phase 70.4 — Signal detail (/dashboard/signal-network/[id]). Reviewer+.
// Full traceable lineage for one signal. Read-only — inherits RBAC from the
// /dashboard/signal-network prefix (longest-prefix match).
// =============================================================================

import { notFound } from 'next/navigation';
import { TopNav } from '@hsi/ui';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { hasRole } from '@/lib/security/rbac-audit';
import { ErrorState } from '@/components/signals/states';
import { DashboardPage } from '../../../../components/dashboard-shell';
import { getSignalNetworkDetail } from '@/lib/signal-network/data';
import { SignalDetailView } from '@/components/signal-network/detail';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function SignalDetailPage({ params }: { params: { id: string } }) {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !hasRole(role ?? undefined, 'reviewer')) {
    return (
      <>
        <TopNav title="Signal" subtitle="Signal network intelligence" />
        <main className="space-y-6 p-5 lg:p-6">
          <ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message={user ? 'Signal detail is available to reviewers and admins.' : 'Sign in to view signal intelligence.'} redirectedFrom="/dashboard/signal-network" />
        </main>
      </>
    );
  }

  const detail = await getSignalNetworkDetail(params.id);
  if (!detail) notFound();

  return (
    <DashboardPage title={detail.row.title} subtitle="Signal lineage — evidence, relationships, narratives, forecasts, source, and transparency. Everything traceable.">
      <SignalDetailView d={detail} />
    </DashboardPage>
  );
}
