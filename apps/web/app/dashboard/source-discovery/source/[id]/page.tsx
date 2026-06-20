// =============================================================================
// HSI Phase 70.3.3 — Source detail (network intelligence) view. Reviewer+.
// Inherits RBAC from the /dashboard/source-discovery prefix (longest-prefix).
// Read-only — no activation, publishing, or crawling.
// =============================================================================

import { notFound } from 'next/navigation';
import { TopNav } from '@hsi/ui';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { hasRole } from '@/lib/security/rbac-audit';
import { ErrorState } from '@/components/signals/states';
import { DashboardPage } from '../../../../../components/dashboard-shell';
import { getSourceNetworkDetail } from '@/lib/source-network/data';
import { SourceDetailView } from '@/components/source-network/detail';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function SourceDetailPage({ params }: { params: { id: string } }) {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !hasRole(role ?? undefined, 'reviewer')) {
    return (
      <>
        <TopNav title="Source" subtitle="Source network intelligence" />
        <main className="space-y-6 p-5 lg:p-6">
          <ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message={user ? 'Source detail is available to reviewers and admins.' : 'Sign in to view source intelligence.'} redirectedFrom="/dashboard/source-discovery" />
        </main>
      </>
    );
  }

  const detail = await getSourceNetworkDetail(params.id);
  if (!detail) notFound();

  return (
    <DashboardPage title={detail.row.name} subtitle="Source network intelligence — health, collection capability, yield, geo readiness, and recommended action.">
      <SourceDetailView d={detail} />
    </DashboardPage>
  );
}
