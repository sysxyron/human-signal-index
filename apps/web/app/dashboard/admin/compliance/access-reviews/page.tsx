// =============================================================================
// HSI Phase 41 — Access Review Reports (/dashboard/admin/compliance/access-reviews).
// READ-ONLY over users/roles/orgs. NEVER writes RBAC / user_roles.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/security/view';
import { AdminNav } from '@/components/admin/AdminNav';
import { ComplianceNav, ComplianceDisclaimer } from '@/components/admin/compliance/ComplianceNav';
import { Pill } from '@/components/admin/compliance/badges';
import { ExportLinks } from '@/components/admin/compliance/ExportLinks';
import { getAccessReview } from '@/lib/compliance/persistence';
import { ErrorState, OfflineDemoBanner, EmptyState } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ComplianceAccessReviewsPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !isAdmin(role)) {
    return (<><TopNav title="Access Reviews" subtitle="Admin only" /><main className="space-y-6 p-5 lg:p-6"><AdminNav /><ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message="Admins only." redirectedFrom="/dashboard/admin/compliance/access-reviews" /></main></>);
  }
  const res = await getAccessReview();
  const isDemo = !res.ok && res.code === 'NOT_CONFIGURED';
  const report = res.ok ? res.data : null;

  return (
    <>
      <TopNav title="Access Review Reports" subtitle="Users, roles, memberships & elevated access" />
      <main className="space-y-6 p-5 lg:p-6">
        <AdminNav />
        <ComplianceNav />
        <ComplianceDisclaimer />
        {isDemo ? <OfflineDemoBanner /> : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {report ? (
            <div className="flex flex-wrap gap-4 text-caption text-text-secondary">
              <span>Total: <b className="text-text-primary">{report.summary.total}</b></span>
              <span>Admins: <b className="text-text-primary">{report.summary.admins}</b></span>
              <span>Elevated: <b className="text-text-primary">{report.summary.elevated}</b></span>
              <span>Inactive: <b className="text-text-primary">{report.summary.inactive}</b></span>
            </div>
          ) : <span />}
          <ExportLinks type="access_review" label="Access review" />
        </div>
        {report && !report.hasLoginData ? (
          <p className="text-caption text-text-muted">Last-login data requires the server service-role key; inactivity is estimated conservatively without it.</p>
        ) : null}
        {!res.ok && !isDemo ? (
          <ErrorState title="Could not generate access review" message={res.error} />
        ) : !report || report.rows.length === 0 ? (
          <EmptyState title="No users to review" message="User, role, and membership data appears here once present." />
        ) : (
          <Card className="overflow-x-auto p-0" padded={false}>
            <table className="w-full text-caption">
              <thead className="border-b border-border bg-surface/50 text-label uppercase tracking-wide text-text-muted">
                <tr><th className="px-4 py-2.5 text-left">User</th><th className="px-4 py-2.5 text-left">Role</th><th className="px-4 py-2.5 text-left">Flags</th><th className="px-4 py-2.5 text-left">Organizations</th><th className="px-4 py-2.5 text-left">Last login</th></tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.user_id} className="border-b border-border/50 align-top last:border-0">
                    <td className="px-4 py-2.5 text-text-secondary">{r.email ?? r.user_id}</td>
                    <td className="px-4 py-2.5 capitalize text-text-primary">{r.role}</td>
                    <td className="px-4 py-2.5">
                      <span className="flex flex-wrap gap-1">
                        {r.isAdmin ? <Pill label="admin" tone="red" /> : null}
                        {r.elevated && !r.isAdmin ? <Pill label="elevated" tone="orange" /> : null}
                        {r.inactive ? <Pill label="inactive" tone="neutral" /> : <Pill label="active" tone="green" />}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-text-muted">{r.organizations.length ? r.organizations.join(', ') : '—'}</td>
                    <td className="px-4 py-2.5 text-text-muted">{r.lastLoginAt ? r.lastLoginAt.slice(0, 10) : '—'}</td>
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
