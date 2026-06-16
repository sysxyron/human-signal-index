// =============================================================================
// HSI Phase 41 — Data Retention Settings (/dashboard/admin/compliance/retention).
// READINESS ONLY — this phase NEVER deletes data automatically.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { Info } from 'lucide-react';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/security/view';
import { AdminNav } from '@/components/admin/AdminNav';
import { ComplianceNav, ComplianceDisclaimer } from '@/components/admin/compliance/ComplianceNav';
import { RetentionRowEditor } from '@/components/admin/compliance/mutations';
import { listRetention } from '@/lib/compliance/persistence';
import { ErrorState, OfflineDemoBanner, EmptyState } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ComplianceRetentionPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !isAdmin(role)) {
    return (<><TopNav title="Data Retention" subtitle="Admin only" /><main className="space-y-6 p-5 lg:p-6"><AdminNav /><ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message="Admins only." redirectedFrom="/dashboard/admin/compliance/retention" /></main></>);
  }
  const res = await listRetention();
  const isDemo = !res.ok && res.code === 'NOT_CONFIGURED';
  const rows = res.ok ? res.data : [];

  return (
    <>
      <TopNav title="Data Retention Settings" subtitle="Retention readiness — no automatic deletion" />
      <main className="space-y-6 p-5 lg:p-6">
        <AdminNav />
        <ComplianceNav />
        <ComplianceDisclaimer />
        {isDemo ? <OfflineDemoBanner /> : null}
        <div className="flex items-start gap-2.5 rounded-card border border-border bg-surface/60 p-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption text-text-secondary">Retention is documented for readiness only. HSI does <span className="font-semibold text-text-primary">not</span> delete any data automatically in this phase — these are planned policies for due-diligence conversations.</p>
        </div>
        {!res.ok && !isDemo ? (
          <ErrorState title="Could not load retention policies" message={res.error} />
        ) : rows.length === 0 ? (
          <EmptyState title="No retention policies" message="Seeded by migration 0045; re-seed from the overview if empty." />
        ) : (
          <Card className="overflow-x-auto p-0" padded={false}>
            <table className="w-full text-caption">
              <thead className="border-b border-border bg-surface/50 text-label uppercase tracking-wide text-text-muted">
                <tr><th className="px-4 py-2.5 text-left">Data type</th><th className="px-4 py-2.5 text-left">Retention &amp; status</th><th className="px-4 py-2.5 text-left">Basis</th><th className="px-4 py-2.5 text-left">Auto-delete</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/50 align-top last:border-0">
                    <td className="px-4 py-2.5 font-medium capitalize text-text-primary">{r.data_type.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-2.5"><RetentionRowEditor id={r.id} period={r.retention_period ?? ''} status={r.status} /></td>
                    <td className="px-4 py-2.5 text-text-muted">{r.basis ?? '—'}</td>
                    <td className="px-4 py-2.5 text-text-muted">No (readiness only)</td>
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
