// =============================================================================
// HSI Phase 41 — Risk Register (/dashboard/admin/compliance/risks). Admin-only.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/security/view';
import { AdminNav } from '@/components/admin/AdminNav';
import { ComplianceNav, ComplianceDisclaimer } from '@/components/admin/compliance/ComplianceNav';
import { SeverityBadge } from '@/components/admin/compliance/badges';
import { ExportLinks } from '@/components/admin/compliance/ExportLinks';
import { CreateRiskForm, RiskStatusSelect } from '@/components/admin/compliance/mutations';
import { listRisks } from '@/lib/compliance/persistence';
import { ErrorState, OfflineDemoBanner, EmptyState } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ComplianceRisksPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !isAdmin(role)) {
    return (<><TopNav title="Risk Register" subtitle="Admin only" /><main className="space-y-6 p-5 lg:p-6"><AdminNav /><ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message="Admins only." redirectedFrom="/dashboard/admin/compliance/risks" /></main></>);
  }
  const res = await listRisks();
  const isDemo = !res.ok && res.code === 'NOT_CONFIGURED';
  const risks = res.ok ? res.data : [];

  return (
    <>
      <TopNav title="Risk Register" subtitle="Compliance & security risks" />
      <main className="space-y-6 p-5 lg:p-6">
        <AdminNav />
        <ComplianceNav />
        <ComplianceDisclaimer />
        {isDemo ? <OfflineDemoBanner /> : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CreateRiskForm />
          <ExportLinks type="risk_register" label="Risk register" />
        </div>
        {!res.ok && !isDemo ? (
          <ErrorState title="Could not load risks" message={res.error} />
        ) : risks.length === 0 ? (
          <EmptyState title="No risks recorded" message="Add a risk to begin the register." />
        ) : (
          <Card className="overflow-x-auto p-0" padded={false}>
            <table className="w-full text-caption">
              <thead className="border-b border-border bg-surface/50 text-label uppercase tracking-wide text-text-muted">
                <tr><th className="px-4 py-2.5 text-left">Risk</th><th className="px-4 py-2.5 text-left">Severity</th><th className="px-4 py-2.5 text-left">Status</th><th className="px-4 py-2.5 text-left">Owner</th><th className="px-4 py-2.5 text-left">Mitigation</th><th className="px-4 py-2.5 text-left">Review</th></tr>
              </thead>
              <tbody>
                {risks.map((r) => (
                  <tr key={r.id} className="border-b border-border/50 align-top last:border-0">
                    <td className="px-4 py-2.5 font-medium text-text-primary">{r.title}{r.description ? <p className="text-caption text-text-muted">{r.description}</p> : null}</td>
                    <td className="px-4 py-2.5"><SeverityBadge severity={r.severity} /></td>
                    <td className="px-4 py-2.5"><RiskStatusSelect id={r.id} current={r.status} /></td>
                    <td className="px-4 py-2.5 text-text-secondary">{r.owner ?? '—'}</td>
                    <td className="px-4 py-2.5 text-text-muted">{r.mitigation ?? '—'}</td>
                    <td className="px-4 py-2.5 text-text-muted">{r.review_date ?? '—'}</td>
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
