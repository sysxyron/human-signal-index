// =============================================================================
// HSI Phase 41 — Incident Response Log (/dashboard/admin/compliance/incidents).
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/security/view';
import { AdminNav } from '@/components/admin/AdminNav';
import { ComplianceNav, ComplianceDisclaimer } from '@/components/admin/compliance/ComplianceNav';
import { SeverityBadge } from '@/components/admin/compliance/badges';
import { ExportLinks } from '@/components/admin/compliance/ExportLinks';
import { CreateIncidentForm, IncidentStatusSelect } from '@/components/admin/compliance/mutations';
import { listIncidents } from '@/lib/compliance/persistence';
import { ErrorState, OfflineDemoBanner, EmptyState } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ComplianceIncidentsPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !isAdmin(role)) {
    return (<><TopNav title="Incidents" subtitle="Admin only" /><main className="space-y-6 p-5 lg:p-6"><AdminNav /><ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message="Admins only." redirectedFrom="/dashboard/admin/compliance/incidents" /></main></>);
  }
  const res = await listIncidents();
  const isDemo = !res.ok && res.code === 'NOT_CONFIGURED';
  const incidents = res.ok ? res.data : [];

  return (
    <>
      <TopNav title="Incident Response Log" subtitle="Detection → containment → resolution → postmortem" />
      <main className="space-y-6 p-5 lg:p-6">
        <AdminNav />
        <ComplianceNav />
        <ComplianceDisclaimer />
        {isDemo ? <OfflineDemoBanner /> : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CreateIncidentForm />
          <ExportLinks type="incidents" label="Incident log" />
        </div>
        {!res.ok && !isDemo ? (
          <ErrorState title="Could not load incidents" message={res.error} />
        ) : incidents.length === 0 ? (
          <EmptyState title="No incidents logged" message="A clean log is good news. Log an incident if one occurs." />
        ) : (
          <Card className="overflow-x-auto p-0" padded={false}>
            <table className="w-full text-caption">
              <thead className="border-b border-border bg-surface/50 text-label uppercase tracking-wide text-text-muted">
                <tr><th className="px-4 py-2.5 text-left">Incident</th><th className="px-4 py-2.5 text-left">Severity</th><th className="px-4 py-2.5 text-left">Status</th><th className="px-4 py-2.5 text-left">System</th><th className="px-4 py-2.5 text-left">Detected</th><th className="px-4 py-2.5 text-left">Owner</th></tr>
              </thead>
              <tbody>
                {incidents.map((i) => (
                  <tr key={i.id} className="border-b border-border/50 align-top last:border-0">
                    <td className="px-4 py-2.5 font-medium text-text-primary">{i.title}</td>
                    <td className="px-4 py-2.5"><SeverityBadge severity={i.severity} /></td>
                    <td className="px-4 py-2.5"><IncidentStatusSelect id={i.id} current={i.status} /></td>
                    <td className="px-4 py-2.5 text-text-secondary">{i.affected_system ?? '—'}</td>
                    <td className="px-4 py-2.5 text-text-muted">{i.detected_at ? i.detected_at.slice(0, 10) : '—'}</td>
                    <td className="px-4 py-2.5 text-text-secondary">{i.owner ?? '—'}</td>
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
