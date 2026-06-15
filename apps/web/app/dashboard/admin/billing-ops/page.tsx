// =============================================================================
// HSI Phase 39 — Billing Operations (/dashboard/admin/billing-ops). Server
// Component, force-dynamic, PLATFORM-ADMIN-ONLY. Operational visibility: active/
// trial/canceled/past-due subscriptions, payment failures, overage orgs, and
// recent subscription changes. Read-only. Offline → demo. RBAC unchanged.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { CheckCircle2, Clock, XCircle, AlertTriangle, PauseCircle, CreditCard, Gauge, ShieldCheck, History } from 'lucide-react';
import { getBillingOpsAction } from '@/lib/saas-ops/operations';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/security/view';
import { AdminNav } from '@/components/admin/AdminNav';
import { ErrorState, OfflineDemoBanner } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function fmt(iso: string): string {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
}

export default async function BillingOpsPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !isAdmin(role)) {
    return (<><TopNav title="Billing Operations" subtitle="Billing ops — admin only" /><main className="space-y-6 p-5 lg:p-6"><AdminNav /><ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message={user ? 'Billing operations are restricted to platform administrators.' : 'Sign in as an administrator.'} redirectedFrom="/dashboard/admin/billing-ops" /></main></>);
  }
  const res = await getBillingOpsAction();
  if (!res.ok) {
    return (<><TopNav title="Billing Operations" subtitle="Billing ops" /><main className="space-y-6 p-5 lg:p-6"><AdminNav /><ErrorState title="Could not load billing operations" message={(res as { error?: string }).error ?? 'Unavailable.'} code={res.code === 'FORBIDDEN' ? 'FORBIDDEN' : undefined} /></main></>);
  }
  const d = res.data;
  const isDemo = Boolean((res as { demo?: boolean }).demo);
  const cards: Array<{ label: string; value: number; icon: typeof CheckCircle2; tint: string }> = [
    { label: 'Active', value: d.active, icon: CheckCircle2, tint: '#10B981' },
    { label: 'Trialing', value: d.trialing, icon: Clock, tint: '#3B82F6' },
    { label: 'Past due', value: d.pastDue, icon: AlertTriangle, tint: '#F97316' },
    { label: 'Paused', value: d.paused, icon: PauseCircle, tint: '#F59E0B' },
    { label: 'Canceled', value: d.canceled, icon: XCircle, tint: '#94A3B8' },
    { label: 'Payment failures', value: d.paymentFailures, icon: CreditCard, tint: '#EF4444' },
    { label: 'Overage orgs', value: d.overageOrgs, icon: Gauge, tint: '#8B5CF6' },
  ];

  return (
    <>
      <TopNav title="Billing Operations" subtitle="Operational visibility into the subscription base" />
      <main className="space-y-6 p-5 lg:p-6">
        <AdminNav />
        {isDemo ? <OfflineDemoBanner /> : null}
        <Card className="flex items-start gap-2.5 border-border" padded>
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption text-text-secondary">Operational visibility only — no billing actions here. Plan changes flow through the org Billing Center and Stripe; overages are tracking-only (never auto-billed).</p>
        </Card>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {cards.map((c) => { const Icon = c.icon; return (
            <Card key={c.label} className="space-y-1 border-border" padded>
              <div className="flex items-center gap-1.5 text-label uppercase tracking-wide text-text-muted"><Icon className="h-3.5 w-3.5" style={{ color: c.tint }} /> {c.label}</div>
              <div className="text-h5 font-bold tabular-nums text-text-primary">{c.value.toLocaleString()}</div>
            </Card>
          ); })}
        </div>
        <div>
          <h2 className="mb-2 flex items-center gap-1.5 text-label uppercase tracking-wide text-text-muted"><History className="h-3.5 w-3.5" /> Recent subscription changes</h2>
          {d.recentChanges.length === 0 ? (
            <Card className="border-border" padded><p className="text-caption text-text-muted">No recent changes.</p></Card>
          ) : (
            <Card className="overflow-x-auto border-border p-0" padded={false}>
              <table className="w-full text-caption">
                <thead className="border-b border-border bg-surface/50 text-label uppercase tracking-wide text-text-muted">
                  <tr><th className="px-4 py-2.5 text-left">When</th><th className="px-4 py-2.5 text-left">Action</th><th className="px-4 py-2.5 text-left">Organization</th></tr>
                </thead>
                <tbody>
                  {d.recentChanges.map((c, i) => (
                    <tr key={`${c.orgId}-${i}`} className="border-b border-border/50 last:border-0">
                      <td className="px-4 py-2.5 text-text-muted">{fmt(c.at)}</td>
                      <td className="px-4 py-2.5 text-text-secondary">{c.action.replace(/_/g, ' ')}</td>
                      <td className="px-4 py-2.5 font-mono text-label text-text-muted">{c.orgId ? c.orgId.slice(0, 12) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      </main>
    </>
  );
}
