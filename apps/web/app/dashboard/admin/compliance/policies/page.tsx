// =============================================================================
// HSI Phase 41 — Policy Center (/dashboard/admin/compliance/policies).
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/security/view';
import { AdminNav } from '@/components/admin/AdminNav';
import { ComplianceNav, ComplianceDisclaimer } from '@/components/admin/compliance/ComplianceNav';
import { PolicyStatusBadge } from '@/components/admin/compliance/badges';
import { PolicyStatusSelect } from '@/components/admin/compliance/mutations';
import { listPolicies } from '@/lib/compliance/persistence';
import { ErrorState, OfflineDemoBanner, EmptyState } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function CompliancePoliciesPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !isAdmin(role)) {
    return (<><TopNav title="Policy Center" subtitle="Admin only" /><main className="space-y-6 p-5 lg:p-6"><AdminNav /><ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message="Admins only." redirectedFrom="/dashboard/admin/compliance/policies" /></main></>);
  }
  const res = await listPolicies();
  const isDemo = !res.ok && res.code === 'NOT_CONFIGURED';
  const policies = res.ok ? res.data : [];

  return (
    <>
      <TopNav title="Policy Center" subtitle="Draft → active → archived" />
      <main className="space-y-6 p-5 lg:p-6">
        <AdminNav />
        <ComplianceNav />
        <ComplianceDisclaimer />
        {isDemo ? <OfflineDemoBanner /> : null}
        {!res.ok && !isDemo ? (
          <ErrorState title="Could not load policies" message={res.error} />
        ) : policies.length === 0 ? (
          <EmptyState title="No policies" message="Policy records are seeded by migration 0045; re-seed from the overview if empty." />
        ) : (
          <Card className="overflow-x-auto p-0" padded={false}>
            <table className="w-full text-caption">
              <thead className="border-b border-border bg-surface/50 text-label uppercase tracking-wide text-text-muted">
                <tr><th className="px-4 py-2.5 text-left">Policy</th><th className="px-4 py-2.5 text-left">Status</th><th className="px-4 py-2.5 text-left">Set status</th><th className="px-4 py-2.5 text-left">Owner</th><th className="px-4 py-2.5 text-left">Reviewed</th></tr>
              </thead>
              <tbody>
                {policies.map((p) => (
                  <tr key={p.id} className="border-b border-border/50 align-top last:border-0">
                    <td className="px-4 py-2.5 font-medium text-text-primary">{p.name}{p.summary ? <p className="text-caption text-text-muted">{p.summary}</p> : null}</td>
                    <td className="px-4 py-2.5"><PolicyStatusBadge status={p.status} /></td>
                    <td className="px-4 py-2.5"><PolicyStatusSelect id={p.id} current={p.status} /></td>
                    <td className="px-4 py-2.5 text-text-secondary">{p.owner ?? '—'}</td>
                    <td className="px-4 py-2.5 text-text-muted">{p.reviewed_at ? p.reviewed_at.slice(0, 10) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </main>
    </>
  );
}
