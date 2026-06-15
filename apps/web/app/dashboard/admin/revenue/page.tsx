// =============================================================================
// HSI Phase 38 — Revenue Dashboard (/dashboard/admin/revenue). Server Component,
// force-dynamic, PLATFORM-ADMIN-ONLY. MRR / ARR / org counts / plan distribution.
// Read-only summary cards. Offline → demo. RBAC unchanged.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { TrendingUp, DollarSign, Building2, Clock, XCircle, AlertTriangle, ShieldCheck } from 'lucide-react';
import { getRevenueAction } from '@/lib/billing/billing';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/security/view';
import { AdminNav } from '@/components/admin/AdminNav';
import { ErrorState, OfflineDemoBanner } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PLAN_LABEL: Record<string, string> = { community: 'Community', professional: 'Professional', enterprise: 'Enterprise', government: 'Government' };

export default async function AdminRevenuePage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !isAdmin(role)) {
    return (<><TopNav title="Revenue" subtitle="Revenue analytics — admin only" /><main className="space-y-6 p-5 lg:p-6"><AdminNav /><ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message={user ? 'Revenue analytics are restricted to platform administrators.' : 'Sign in as an administrator.'} redirectedFrom="/dashboard/admin/revenue" /></main></>);
  }
  const res = await getRevenueAction();
  if (!res.ok) {
    return (<><TopNav title="Revenue" subtitle="Revenue analytics" /><main className="space-y-6 p-5 lg:p-6"><AdminNav /><ErrorState title="Could not load revenue" message={(res as { error?: string }).error ?? 'Unavailable.'} code={res.code === 'FORBIDDEN' ? 'FORBIDDEN' : undefined} /></main></>);
  }
  const r = res.data;
  const isDemo = Boolean((res as { demo?: boolean }).demo);
  const cards: Array<{ label: string; value: string; icon: typeof DollarSign; tint: string }> = [
    { label: 'MRR', value: r.mrrLabel, icon: DollarSign, tint: '#10B981' },
    { label: 'ARR', value: r.arrLabel, icon: TrendingUp, tint: '#3B82F6' },
    { label: 'Active orgs', value: r.activeOrganizations.toLocaleString(), icon: Building2, tint: '#8B5CF6' },
    { label: 'Trialing', value: r.trialingOrganizations.toLocaleString(), icon: Clock, tint: '#3B82F6' },
    { label: 'Past due', value: r.pastDueOrganizations.toLocaleString(), icon: AlertTriangle, tint: '#F97316' },
    { label: 'Canceled', value: r.canceledOrganizations.toLocaleString(), icon: XCircle, tint: '#94A3B8' },
  ];
  const distEntries = Object.entries(r.planDistribution).sort((a, b) => b[1] - a[1]);
  const distTotal = distEntries.reduce((n, [, v]) => n + v, 0) || 1;

  return (
    <>
      <TopNav title="Revenue" subtitle="MRR, ARR and subscription distribution" />
      <main className="space-y-6 p-5 lg:p-6">
        <AdminNav />
        {isDemo ? <OfflineDemoBanner /> : null}
        <Card className="flex items-start gap-2.5 border-border" padded>
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption text-text-secondary">Recurring revenue is computed from active + past-due subscriptions (trials excluded). Figures reflect the configured Stripe plan amounts.</p>
        </Card>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {cards.map((c) => { const Icon = c.icon; return (
            <Card key={c.label} className="space-y-1 border-border" padded>
              <div className="flex items-center gap-1.5 text-label uppercase tracking-wide text-text-muted"><Icon className="h-3.5 w-3.5" style={{ color: c.tint }} /> {c.label}</div>
              <div className="text-h5 font-bold tabular-nums text-text-primary">{c.value}</div>
            </Card>
          ); })}
        </div>
        <div>
          <h2 className="mb-2 text-label uppercase tracking-wide text-text-muted">Plan distribution</h2>
          <Card className="space-y-3 border-border" padded>
            {distEntries.length === 0 ? <p className="text-caption text-text-muted">No subscriptions yet.</p> : distEntries.map(([slug, count]) => {
              const pct = Math.round((count / distTotal) * 100);
              return (
                <div key={slug} className="space-y-1">
                  <div className="flex items-center justify-between text-caption"><span className="text-text-primary">{PLAN_LABEL[slug] ?? slug}</span><span className="tabular-nums text-text-muted">{count} ({pct}%)</span></div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
          </Card>
        </div>
      </main>
    </>
  );
}
