// =============================================================================
// HSI Phase 39 — Revenue Dashboard (/dashboard/admin/revenue). Server Component,
// force-dynamic, PLATFORM-ADMIN-ONLY. MRR/ARR + trend, expansion/contraction/
// churned revenue, forecast, plan distribution, org counts, and cohort summaries.
// Read-only. Offline → demo. RBAC unchanged.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { TrendingUp, TrendingDown, DollarSign, Building2, Clock, XCircle, AlertTriangle, ShieldCheck, ArrowUpRight, ArrowDownRight, Sparkles } from 'lucide-react';
import { getRevenueAction } from '@/lib/billing/billing';
import { getRevenueAnalyticsAction, getForecastAction, getCohortsAction } from '@/lib/saas-ops/operations';
import { formatAmount } from '@hsi/billing';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/security/view';
import { AdminNav } from '@/components/admin/AdminNav';
import { ErrorState, OfflineDemoBanner } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PLAN_LABEL: Record<string, string> = { community: 'Community', professional: 'Professional', enterprise: 'Enterprise', government: 'Government' };

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex h-12 items-end gap-1">
      {values.slice(-12).map((v, i) => (
        <div key={i} className="flex-1 rounded-t bg-primary/60" style={{ height: `${Math.max(4, Math.round((v / max) * 100))}%` }} title={String(v)} />
      ))}
    </div>
  );
}

export default async function AdminRevenuePage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !isAdmin(role)) {
    return (<><TopNav title="Revenue" subtitle="Revenue analytics — admin only" /><main className="space-y-6 p-5 lg:p-6"><AdminNav /><ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message={user ? 'Revenue analytics are restricted to platform administrators.' : 'Sign in as an administrator.'} redirectedFrom="/dashboard/admin/revenue" /></main></>);
  }
  const [base, analytics, forecast, cohorts] = await Promise.all([getRevenueAction(), getRevenueAnalyticsAction(), getForecastAction(), getCohortsAction()]);
  if (!base.ok) {
    return (<><TopNav title="Revenue" subtitle="Revenue analytics" /><main className="space-y-6 p-5 lg:p-6"><AdminNav /><ErrorState title="Could not load revenue" message={(base as { error?: string }).error ?? 'Unavailable.'} code={base.code === 'FORBIDDEN' ? 'FORBIDDEN' : undefined} /></main></>);
  }
  const r = base.data;
  const a = analytics.ok ? analytics.data : null;
  const f = forecast.ok ? forecast.data : null;
  const cohortRows = cohorts.ok ? cohorts.data : [];
  const isDemo = Boolean((base as { demo?: boolean }).demo);
  const cur = r.currency;

  const topCards: Array<{ label: string; value: string; icon: typeof DollarSign; tint: string; sub?: string }> = [
    { label: 'MRR', value: r.mrrLabel, icon: DollarSign, tint: '#10B981', sub: a ? `${a.growthRate >= 0 ? '+' : ''}${Math.round(a.growthRate * 100)}% MoM` : undefined },
    { label: 'ARR', value: r.arrLabel, icon: TrendingUp, tint: '#3B82F6' },
    { label: 'Active orgs', value: r.activeOrganizations.toLocaleString(), icon: Building2, tint: '#8B5CF6' },
    { label: 'Trialing', value: r.trialingOrganizations.toLocaleString(), icon: Clock, tint: '#3B82F6' },
    { label: 'Past due', value: r.pastDueOrganizations.toLocaleString(), icon: AlertTriangle, tint: '#F97316' },
    { label: 'Canceled', value: r.canceledOrganizations.toLocaleString(), icon: XCircle, tint: '#94A3B8' },
  ];
  const movement: Array<{ label: string; value: string; icon: typeof ArrowUpRight; tint: string }> = a ? [
    { label: 'Expansion', value: formatAmount(a.expansionRevenue, cur), icon: ArrowUpRight, tint: '#10B981' },
    { label: 'Contraction', value: formatAmount(a.contractionRevenue, cur), icon: ArrowDownRight, tint: '#F59E0B' },
    { label: 'Churned', value: formatAmount(a.churnedRevenue, cur), icon: TrendingDown, tint: '#EF4444' },
    { label: 'Net new', value: formatAmount(a.netNewRevenue, cur), icon: Sparkles, tint: '#3B82F6' },
  ] : [];
  const distEntries = Object.entries(r.planDistribution).sort((x, y) => y[1] - x[1]);
  const distTotal = distEntries.reduce((n, [, v]) => n + v, 0) || 1;

  return (
    <>
      <TopNav title="Revenue" subtitle="MRR, ARR, movement, forecast and cohorts" />
      <main className="space-y-6 p-5 lg:p-6">
        <AdminNav />
        {isDemo ? <OfflineDemoBanner /> : null}
        <Card className="flex items-start gap-2.5 border-border" padded>
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption text-text-secondary">Recurring revenue is computed from active + past-due subscriptions (trials excluded). Movement compares against the most recent revenue snapshot.</p>
        </Card>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {topCards.map((c) => { const Icon = c.icon; return (
            <Card key={c.label} className="space-y-1 border-border" padded>
              <div className="flex items-center gap-1.5 text-label uppercase tracking-wide text-text-muted"><Icon className="h-3.5 w-3.5" style={{ color: c.tint }} /> {c.label}</div>
              <div className="text-h5 font-bold tabular-nums text-text-primary">{c.value}</div>
              {c.sub ? <div className="text-label text-text-muted">{c.sub}</div> : null}
            </Card>
          ); })}
        </div>

        {a ? (
          <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
            <Card className="space-y-2 border-border" padded>
              <div className="text-label uppercase tracking-wide text-text-muted">MRR trend</div>
              <Sparkline values={a.mrrHistory} />
              <div className="text-label text-text-muted">Last {Math.min(12, a.mrrHistory.length)} snapshots</div>
            </Card>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {movement.map((m) => { const Icon = m.icon; return (
                <Card key={m.label} className="space-y-1 border-border" padded>
                  <div className="flex items-center gap-1.5 text-label uppercase tracking-wide text-text-muted"><Icon className="h-3.5 w-3.5" style={{ color: m.tint }} /> {m.label}</div>
                  <div className="text-h6 font-bold tabular-nums text-text-primary">{m.value}</div>
                </Card>
              ); })}
            </div>
          </div>
        ) : null}

        {f ? (
          <div>
            <h2 className="mb-2 text-label uppercase tracking-wide text-text-muted">Forecast</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Card className="space-y-1 border-border" padded><div className="text-label uppercase tracking-wide text-text-muted">Next-month MRR</div><div className="text-h6 font-bold tabular-nums text-text-primary">{f.nextMonthLabel}</div></Card>
              <Card className="space-y-1 border-border" padded><div className="text-label uppercase tracking-wide text-text-muted">Next-quarter ARR</div><div className="text-h6 font-bold tabular-nums text-text-primary">{f.nextQuarterLabel}</div></Card>
              <Card className="space-y-1 border-border" padded><div className="text-label uppercase tracking-wide text-text-muted">Growth projection</div><div className="text-h6 font-bold tabular-nums text-verified">+{formatAmount(f.growthProjection, f.currency)}</div></Card>
              <Card className="space-y-1 border-border" padded><div className="text-label uppercase tracking-wide text-text-muted">Churn projection</div><div className="text-h6 font-bold tabular-nums text-risk">−{formatAmount(f.churnProjection, f.currency)}</div></Card>
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
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
          <div>
            <h2 className="mb-2 text-label uppercase tracking-wide text-text-muted">Cohort retention</h2>
            <Card className="overflow-x-auto border-border p-0" padded={false}>
              <table className="w-full text-caption">
                <thead className="border-b border-border bg-surface/50 text-label uppercase tracking-wide text-text-muted">
                  <tr><th className="px-4 py-2.5 text-left">Cohort</th><th className="px-4 py-2.5 text-right">Size</th><th className="px-4 py-2.5 text-right">Retention</th><th className="px-4 py-2.5 text-right">Engagement</th></tr>
                </thead>
                <tbody>
                  {cohortRows.length === 0 ? <tr><td colSpan={4} className="px-4 py-6 text-center text-text-muted">No cohorts yet.</td></tr> : cohortRows.map((c) => (
                    <tr key={c.cohort} className="border-b border-border/50 last:border-0">
                      <td className="px-4 py-2.5 text-text-primary">{c.cohort}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">{c.size}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">{Math.round(c.retentionRate * 100)}%</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">{Math.round(c.engagementRate * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        </div>
      </main>
    </>
  );
}
