// =============================================================================
// HSI Phase 41 — Compliance Evidence Vault (/dashboard/admin/compliance/evidence).
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/security/view';
import { AdminNav } from '@/components/admin/AdminNav';
import { ComplianceNav, ComplianceDisclaimer } from '@/components/admin/compliance/ComplianceNav';
import { EvidenceStatusBadge } from '@/components/admin/compliance/badges';
import { CreateEvidenceForm, EvidenceStatusSelect } from '@/components/admin/compliance/mutations';
import { listControls, listEvidence } from '@/lib/compliance/persistence';
import { ErrorState, OfflineDemoBanner, EmptyState } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ComplianceEvidencePage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !isAdmin(role)) {
    return (<><TopNav title="Evidence Vault" subtitle="Admin only" /><main className="space-y-6 p-5 lg:p-6"><AdminNav /><ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message="Admins only." redirectedFrom="/dashboard/admin/compliance/evidence" /></main></>);
  }
  const [res, ctrlRes] = await Promise.all([listEvidence(), listControls()]);
  const isDemo = !res.ok && res.code === 'NOT_CONFIGURED';
  const evidence = res.ok ? res.data : [];
  const controls = ctrlRes.ok ? ctrlRes.data : [];
  const controlName = new Map(controls.map((c) => [c.id, c.name]));

  return (
    <>
      <TopNav title="Compliance Evidence Vault" subtitle="Attach + track evidence per control" />
      <main className="space-y-6 p-5 lg:p-6">
        <AdminNav />
        <ComplianceNav />
        <ComplianceDisclaimer />
        {isDemo ? <OfflineDemoBanner /> : null}
        <CreateEvidenceForm controls={controls.map((c) => ({ id: c.id, name: c.name }))} />
        {!res.ok && !isDemo ? (
          <ErrorState title="Could not load evidence" message={res.error} />
        ) : evidence.length === 0 ? (
          <EmptyState title="No evidence yet" message="Attach audit logs, policies, screenshots, reports, migrations, or access reviews." />
        ) : (
          <Card className="overflow-x-auto p-0" padded={false}>
            <table className="w-full text-caption">
              <thead className="border-b border-border bg-surface/50 text-label uppercase tracking-wide text-text-muted">
                <tr><th className="px-4 py-2.5 text-left">Evidence</th><th className="px-4 py-2.5 text-left">Type</th><th className="px-4 py-2.5 text-left">Control</th><th className="px-4 py-2.5 text-left">Status</th><th className="px-4 py-2.5 text-left">Update</th><th className="px-4 py-2.5 text-left">Reference</th></tr>
              </thead>
              <tbody>
                {evidence.map((e) => (
                  <tr key={e.id} className="border-b border-border/50 align-top last:border-0">
                    <td className="px-4 py-2.5 font-medium text-text-primary">{e.title}{e.notes ? <p className="text-caption text-text-muted">{e.notes}</p> : null}</td>
                    <td className="px-4 py-2.5 capitalize text-text-secondary">{e.evidence_type.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-2.5 text-text-secondary">{e.control_id ? controlName.get(e.control_id) ?? '—' : '—'}</td>
                    <td className="px-4 py-2.5"><EvidenceStatusBadge status={e.status} /></td>
                    <td className="px-4 py-2.5"><EvidenceStatusSelect id={e.id} current={e.status} /></td>
                    <td className="px-4 py-2.5 text-text-muted">{e.reference_url ? <a className="text-electric hover:text-white" href={e.reference_url} target="_blank" rel="noreferrer">link</a> : '—'}</td>
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
