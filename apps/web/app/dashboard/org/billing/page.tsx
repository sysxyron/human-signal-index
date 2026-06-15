// =============================================================================
// HSI Phase 38 — Organization Billing Center (/dashboard/org/billing). Server
// Component, force-dynamic. Current plan + status + renewal + trial + usage,
// Stripe-hosted upgrade/checkout, Billing Portal, and invoices. NO card data is
// collected here (Stripe-hosted only). Org-admin manages; members read. RBAC
// unchanged.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { CreditCard, Check, X, Gauge, Clock, FileText, ExternalLink, Download } from 'lucide-react';
import { getBillingCenterAction, listInvoicesAction } from '@/lib/billing/billing';
import { getOrgBillingInsightsAction } from '@/lib/saas-ops/operations';
import { invoiceDisplayAmount } from '@hsi/billing';
import { BillingActions } from '@/components/billing/BillingActions';
import { ErrorState, OfflineDemoBanner } from '@/components/signals/states';
import { TrendingUp, Activity, AlertTriangle } from 'lucide-react';

const HEALTH_TINT: Record<string, string> = { healthy: '#10B981', warning: '#F59E0B', 'at-risk': '#EF4444' };

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const STATUS_COLOR: Record<string, string> = { active: '#10B981', trial: '#3B82F6', paused: '#F59E0B', expired: '#94A3B8' };
const LABELS: Record<string, string> = {
  advanced_analytics: 'Advanced analytics', white_label: 'White-label', api_access: 'API access',
  custom_domains: 'Custom domains', ai_agents: 'AI agents', bulk_exports: 'Bulk exports',
  advanced_governance: 'Advanced governance', organization_branding: 'Organization branding', team_workspaces: 'Team workspaces',
  investigations_limit: 'Investigations', publications_limit: 'Publications', contributors_limit: 'Contributors',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
}

export default async function OrgBillingPage({ searchParams }: { searchParams?: { checkout?: string } }) {
  const res = await getBillingCenterAction();
  if (!res.ok) {
    return (<><TopNav title="Billing & Plan" subtitle="Plan, billing and usage" /><main className="space-y-6 p-5 lg:p-6"><ErrorState code={res.code === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : undefined} title="Could not load billing" message="Unavailable right now." redirectedFrom="/dashboard/org/billing" /></main></>);
  }
  const b = res.data;
  const [inv, insightsRes] = await Promise.all([listInvoicesAction(), getOrgBillingInsightsAction()]);
  const invoices = inv.ok ? inv.data : [];
  const insights = insightsRes.ok ? insightsRes.data : null;
  const limitEnts = b.entitlements.filter((e) => e.featureKey.endsWith('_limit'));
  const featureEnts = b.entitlements.filter((e) => !e.featureKey.endsWith('_limit'));
  const usageFor = (key: string): number =>
    key === 'investigations_limit' ? b.usage.investigations : key === 'publications_limit' ? b.usage.publications : key === 'contributors_limit' ? b.usage.contributors : 0;
  const checkout = searchParams?.checkout;

  return (
    <>
      <TopNav title="Billing & Plan" subtitle="Plan, billing, usage and invoices" />
      <main className="space-y-6 p-5 lg:p-6">
        {res.demo ? <OfflineDemoBanner /> : null}
        {checkout === 'success' ? <div className="rounded-card border border-verified/40 bg-verified/10 px-4 py-2.5 text-caption text-text-secondary">Checkout complete — your subscription will activate momentarily.</div> : null}
        {checkout === 'cancelled' ? <div className="rounded-card border border-border bg-surface/50 px-4 py-2.5 text-caption text-text-secondary">Checkout cancelled. No changes were made.</div> : null}

        {/* Current plan */}
        <Card className="flex flex-wrap items-center justify-between gap-4 border-border" padded>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-card bg-primary/15"><CreditCard className="h-5 w-5 text-electric" /></span>
            <div>
              <div className="text-h5 font-bold text-text-primary">{b.planName}</div>
              <div className="text-label text-text-muted capitalize">{b.billingCycle} billing · Renews {fmtDate(b.renewalDate)}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {b.trialDaysRemaining > 0 ? <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-3 py-1 text-label font-semibold text-electric"><Clock className="h-3.5 w-3.5" /> {b.trialDaysRemaining} days left in trial</span> : null}
            {b.cancelAtPeriodEnd ? <span className="rounded-full bg-risk/15 px-3 py-1 text-label font-semibold text-risk">Cancels at period end</span> : null}
            <span className="rounded-full px-3 py-1 text-caption font-semibold capitalize" style={{ backgroundColor: `${STATUS_COLOR[b.status] ?? '#94A3B8'}1f`, color: STATUS_COLOR[b.status] ?? '#94A3B8' }}>{b.status}</span>
          </div>
        </Card>

        {/* Usage & limits */}
        <div>
          <h2 className="mb-2 flex items-center gap-1.5 text-label uppercase tracking-wide text-text-muted"><Gauge className="h-3.5 w-3.5" /> Usage &amp; limits</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {limitEnts.map((e) => {
              const used = usageFor(e.featureKey); const cap = e.limitValue; const pct = cap && cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
              return (
                <Card key={e.featureKey} className="space-y-2 border-border" padded>
                  <div className="text-label uppercase tracking-wide text-text-muted">{LABELS[e.featureKey] ?? e.featureKey}</div>
                  <div className="text-h5 font-bold tabular-nums text-text-primary">{used.toLocaleString()} <span className="text-caption font-normal text-text-muted">/ {cap === null ? '∞' : cap.toLocaleString()}</span></div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Insights (org owners) */}
        {insights ? (
          <div>
            <h2 className="mb-2 flex items-center gap-1.5 text-label uppercase tracking-wide text-text-muted"><TrendingUp className="h-3.5 w-3.5" /> Insights</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="space-y-1 border-border" padded>
                <div className="text-label uppercase tracking-wide text-text-muted">Usage trend</div>
                <div className="text-h6 font-bold tabular-nums text-text-primary">{insights.usageTrend > 0 ? '+' : ''}{Math.round(insights.usageTrend * 100)}%</div>
              </Card>
              <Card className="space-y-1 border-border" padded>
                <div className="flex items-center gap-1.5 text-label uppercase tracking-wide text-text-muted"><Activity className="h-3.5 w-3.5" /> Health</div>
                {insights.health ? <div className="text-h6 font-bold capitalize" style={{ color: HEALTH_TINT[insights.health.status] ?? '#94A3B8' }}>{insights.health.status} ({insights.health.score})</div> : <div className="text-caption text-text-muted">Not yet computed</div>}
              </Card>
              <Card className="space-y-1 border-border" padded>
                <div className="text-label uppercase tracking-wide text-text-muted">Renewal forecast</div>
                <div className="text-h6 font-bold tabular-nums text-text-primary">{insights.renewalForecastLabel}</div>
              </Card>
              <Card className="space-y-1 border-border" padded>
                <div className="flex items-center gap-1.5 text-label uppercase tracking-wide text-text-muted"><AlertTriangle className="h-3.5 w-3.5" /> Projected overages</div>
                <div className="text-h6 font-bold tabular-nums" style={{ color: insights.hasOverage ? '#EF4444' : '#10B981' }}>{insights.hasOverage ? insights.projectedOverages.filter((o) => o.overage > 0).length : 0}</div>
              </Card>
            </div>
          </div>
        ) : null}

        {/* Upgrade plans */}
        <div>
          <h2 className="mb-2 text-label uppercase tracking-wide text-text-muted">Upgrade plans</h2>
          <BillingActions center={b} />
        </div>

        {/* Entitlements */}
        <div>
          <h2 className="mb-2 text-label uppercase tracking-wide text-text-muted">Entitlements</h2>
          <Card className="grid gap-2 border-border sm:grid-cols-2 lg:grid-cols-3" padded>
            {featureEnts.map((e) => (
              <div key={e.featureKey} className="flex items-center gap-2 text-caption">
                {e.enabled ? <Check className="h-4 w-4 text-verified" /> : <X className="h-4 w-4 text-text-muted" />}
                <span className={e.enabled ? 'text-text-primary' : 'text-text-muted line-through'}>{LABELS[e.featureKey] ?? e.featureKey}</span>
              </div>
            ))}
          </Card>
        </div>

        {/* Invoices */}
        <div>
          <h2 className="mb-2 flex items-center gap-1.5 text-label uppercase tracking-wide text-text-muted"><FileText className="h-3.5 w-3.5" /> Invoices</h2>
          {invoices.length === 0 ? (
            <Card className="border-border" padded><p className="text-caption text-text-muted">No invoices yet. Invoices appear here once your first payment is processed.</p></Card>
          ) : (
            <Card className="overflow-x-auto border-border p-0" padded={false}>
              <table className="w-full text-caption">
                <thead className="border-b border-border bg-surface/50 text-label uppercase tracking-wide text-text-muted">
                  <tr><th className="px-4 py-2.5 text-left">Invoice</th><th className="px-4 py-2.5 text-left">Date</th><th className="px-4 py-2.5 text-right">Amount</th><th className="px-4 py-2.5 text-left">Status</th><th className="px-4 py-2.5 text-right">Links</th></tr>
                </thead>
                <tbody>
                  {invoices.map((i) => (
                    <tr key={i.id} className="border-b border-border/50 last:border-0">
                      <td className="px-4 py-2.5 font-medium text-text-primary">{i.number ?? i.id.slice(0, 12)}</td>
                      <td className="px-4 py-2.5 text-text-muted">{fmtDate(i.createdAt)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">{invoiceDisplayAmount(i)}</td>
                      <td className="px-4 py-2.5 capitalize text-text-secondary">{i.status}</td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="inline-flex gap-2">
                          {i.hostedInvoiceUrl ? <a href={i.hostedInvoiceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-electric hover:underline"><ExternalLink className="h-3.5 w-3.5" /> View</a> : null}
                          {i.pdfUrl ? <a href={i.pdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-electric hover:underline"><Download className="h-3.5 w-3.5" /> PDF</a> : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>

        <p className="text-label text-text-muted">Payments are processed securely by Stripe. HSI never stores your card details.</p>
      </main>
    </>
  );
}
