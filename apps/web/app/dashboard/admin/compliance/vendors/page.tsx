// =============================================================================
// HSI Phase 41 — Vendor Register (/dashboard/admin/compliance/vendors).
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/security/view';
import { AdminNav } from '@/components/admin/AdminNav';
import { ComplianceNav, ComplianceDisclaimer } from '@/components/admin/compliance/ComplianceNav';
import { SeverityBadge } from '@/components/admin/compliance/badges';
import { ExportLinks } from '@/components/admin/compliance/ExportLinks';
import { VendorReviewSelect } from '@/components/admin/compliance/mutations';
import { listVendors } from '@/lib/compliance/persistence';
import { ErrorState, OfflineDemoBanner, EmptyState } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ComplianceVendorsPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !isAdmin(role)) {
    return (<><TopNav title="Vendor Register" subtitle="Admin only" /><main className="space-y-6 p-5 lg:p-6"><AdminNav /><ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message="Admins only." redirectedFrom="/dashboard/admin/compliance/vendors" /></main></>);
  }
  const res = await listVendors();
  const isDemo = !res.ok && res.code === 'NOT_CONFIGURED';
  const vendors = res.ok ? res.data : [];

  return (
    <>
      <TopNav title="Vendor Register" subtitle="Sub-processors & vendor security posture" />
      <main className="space-y-6 p-5 lg:p-6">
        <AdminNav />
        <ComplianceNav />
        <ComplianceDisclaimer />
        {isDemo ? <OfflineDemoBanner /> : null}
        <div className="flex justify-end"><ExportLinks type="vendors" label="Vendor register" /></div>
        {!res.ok && !isDemo ? (
          <ErrorState title="Could not load vendors" message={res.error} />
        ) : vendors.length === 0 ? (
          <EmptyState title="No vendors" message="Vendors are seeded by migration 0045; re-seed from the overview if empty." />
        ) : (
          <Card className="overflow-x-auto p-0" padded={false}>
            <table className="w-full text-caption">
              <thead className="border-b border-border bg-surface/50 text-label uppercase tracking-wide text-text-muted">
                <tr><th className="px-4 py-2.5 text-left">Vendor</th><th className="px-4 py-2.5 text-left">Purpose</th><th className="px-4 py-2.5 text-left">Data access</th><th className="px-4 py-2.5 text-left">Risk</th><th className="px-4 py-2.5 text-left">Review</th></tr>
              </thead>
              <tbody>
                {vendors.map((v) => (
                  <tr key={v.id} className="border-b border-border/50 align-top last:border-0">
                    <td className="px-4 py-2.5 font-medium text-text-primary">{v.name}{v.notes ? <p className="text-caption text-text-muted">{v.notes}</p> : null}</td>
                    <td className="px-4 py-2.5 text-text-secondary">{v.service_purpose ?? '—'}</td>
                    <td className="px-4 py-2.5 capitalize text-text-secondary">{v.data_access_level}</td>
                    <td className="px-4 py-2.5"><SeverityBadge severity={v.risk_level} /></td>
                    <td className="px-4 py-2.5"><VendorReviewSelect id={v.id} current={v.review_status} /></td>
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
