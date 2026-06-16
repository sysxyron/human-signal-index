// =============================================================================
// HSI Phase 41 — Compliance Control Center (/dashboard/admin/compliance).
// Server Component, force-dynamic, ADMIN-ONLY. Readiness matrix + control
// library + posture counts + exports. HSI is compliance-READY, not certified.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { ShieldCheck } from 'lucide-react';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/security/view';
import { AdminNav } from '@/components/admin/AdminNav';
import { ComplianceNav, ComplianceDisclaimer } from '@/components/admin/compliance/ComplianceNav';
import { ReadinessBadge } from '@/components/admin/compliance/badges';
import { ExportLinks } from '@/components/admin/compliance/ExportLinks';
import { SeedDefaultsButton } from '@/components/admin/compliance/mutations';
import { getComplianceOverview } from '@/lib/compliance/persistence';
import { ErrorState, OfflineDemoBanner } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function Forbidden({ authed }: { authed: boolean }) {
  return (
    <><TopNav title="Compliance" subtitle="Readiness — admin only" />
      <main className="space-y-6 p-5 lg:p-6"><AdminNav />
        <ErrorState code={authed ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions"
          message={authed ? 'The Compliance Control Center is restricted to administrators.' : 'Sign in as an administrator.'}
          redirectedFrom="/dashboard/admin/compliance" />
      </main></>
  );
}

export default async function ComplianceOverviewPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !isAdmin(role)) return <Forbidden authed={Boolean(user)} />;

  const res = await getComplianceOverview();
  const isDemo = !res.ok && res.code === 'NOT_CONFIGURED';

  return (
    <>
      <TopNav title="Compliance Control Center" subtitle="Readiness posture — not certification" />
      <main className="space-y-6 p-5 lg:p-6">
        <AdminNav />
        <ComplianceNav />
        <ComplianceDisclaimer />
        {isDemo ? <OfflineDemoBanner /> : null}

        {!res.ok && !isDemo ? (
          <ErrorState title="Could not load compliance data" message={res.error} code={res.code === 'FORBIDDEN' ? 'FORBIDDEN' : undefined} />
        ) : !res.ok ? (
          <Card padded><p className="text-caption text-text-muted">Connect Supabase to view live compliance data.</p></Card>
        ) : (
          <>
            {/* Posture counts */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Control library readiness" value={`${res.data.overall.percent}%`} hint={`${res.data.overall.ready + res.data.overall.evidence}/${res.data.overall.ready + res.data.overall.evidence + res.data.overall.inProgress + res.data.overall.needsPolicy} controls`} />
              <Stat label="Open risks" value={String(res.data.counts.openRisks)} hint="risk register" />
              <Stat label="Open incidents" value={String(res.data.counts.openIncidents)} hint="incident log" />
              <Stat label="Active policies" value={`${res.data.counts.activePolicies}/${res.data.counts.activePolicies + res.data.counts.draftPolicies}`} hint="policy center" />
              <Stat label="Evidence items" value={String(res.data.counts.evidence)} hint="evidence vault" />
              <Stat label="Vendors to review" value={String(res.data.counts.flaggedVendors)} hint="vendor register" />
              <Stat label="Retention policies planned" value={String(res.data.counts.retentionPlanned)} hint="readiness only" />
              <Stat label="Frameworks tracked" value={String(res.data.frameworks.length)} hint="readiness matrix" />
            </div>

            {/* Readiness matrix */}
            <Card className="overflow-x-auto p-0" padded={false}>
              <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                <h2 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><ShieldCheck className="h-4 w-4 text-electric" /> Framework readiness matrix</h2>
                <ExportLinks type="readiness_matrix" label="Matrix" />
              </div>
              <table className="w-full text-caption">
                <thead className="border-b border-border bg-surface/50 text-label uppercase tracking-wide text-text-muted">
                  <tr><th className="px-4 py-2.5 text-left">Framework</th><th className="px-4 py-2.5 text-left">Status</th><th className="px-4 py-2.5 text-right">Present</th><th className="px-4 py-2.5 text-right">Missing</th><th className="px-4 py-2.5 text-right">N/A</th><th className="px-4 py-2.5 text-right">Readiness</th><th className="px-4 py-2.5 text-left">Summary</th></tr>
                </thead>
                <tbody>
                  {res.data.frameworks.map((f) => {
                    const r = res.data.readiness[f.key];
                    return (
                      <tr key={f.id} className="border-b border-border/50 last:border-0">
                        <td className="px-4 py-2.5 font-medium text-text-primary">{f.name}</td>
                        <td className="px-4 py-2.5"><ReadinessBadge status={f.status} /></td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">{r?.present.length ?? 0}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">{r?.missing.length ?? 0}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-text-muted">{r?.notApplicable.length ?? 0}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">{r?.percent ?? 0}%</td>
                        <td className="px-4 py-2.5 text-text-muted">{f.summary}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>

            {/* Control library by category */}
            <Card className="overflow-x-auto p-0" padded={false}>
              <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                <h2 className="text-h6 font-semibold text-text-primary">Control library</h2>
                <div className="flex items-center gap-3"><ExportLinks type="controls" label="Controls" /><SeedDefaultsButton /></div>
              </div>
              <table className="w-full text-caption">
                <thead className="border-b border-border bg-surface/50 text-label uppercase tracking-wide text-text-muted">
                  <tr><th className="px-4 py-2.5 text-left">Control</th><th className="px-4 py-2.5 text-left">Category</th><th className="px-4 py-2.5 text-left">Status</th><th className="px-4 py-2.5 text-left">Frameworks</th></tr>
                </thead>
                <tbody>
                  {res.data.controls.map((c) => (
                    <tr key={c.id} className="border-b border-border/50 last:border-0">
                      <td className="px-4 py-2.5 font-medium text-text-primary">{c.name}</td>
                      <td className="px-4 py-2.5 capitalize text-text-secondary">{c.category.replace(/_/g, ' ')}</td>
                      <td className="px-4 py-2.5"><ReadinessBadge status={c.status} /></td>
                      <td className="px-4 py-2.5 text-text-muted">{(c.frameworks ?? []).join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </>
        )}
      </main>
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card padded>
      <p className="text-label uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-1 text-h4 font-semibold text-text-primary tabular-nums">{value}</p>
      <p className="text-caption text-text-muted">{hint}</p>
    </Card>
  );
}
