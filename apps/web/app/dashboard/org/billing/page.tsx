// =============================================================================
// HSI Phase 37 — Organization Billing (/dashboard/org/billing). Server Component,
// force-dynamic. Read-only: current plan, status, entitlements, usage vs limits.
// NO payment actions, NO checkout (Stripe is Phase 38). Offline → demo.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { CreditCard, Check, X, Gauge } from 'lucide-react';
import { getOrgBillingAction } from '@/lib/billing/billing';
import { ErrorState, OfflineDemoBanner } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const STATUS_COLOR: Record<string, string> = { active: '#10B981', trial: '#3B82F6', paused: '#F59E0B', expired: '#94A3B8' };
const LABELS: Record<string, string> = {
  advanced_analytics: 'Advanced analytics', white_label: 'White-label', api_access: 'API access',
  custom_domains: 'Custom domains', ai_agents: 'AI agents', bulk_exports: 'Bulk exports',
  advanced_governance: 'Advanced governance', organization_branding: 'Organization branding', team_workspaces: 'Team workspaces',
  investigations_limit: 'Investigations', publications_limit: 'Publications', contributors_limit: 'Contributors',
};

export default async function OrgBillingPage() {
  const res = await getOrgBillingAction();
  if (!res.ok) {
    return (<><TopNav title="Billing & Plan" subtitle="Plan, entitlements and usage" /><main className="space-y-6 p-5 lg:p-6"><ErrorState code={res.code === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : undefined} title="Could not load billing" message="Unavailable right now." redirectedFrom="/dashboard/org/billing" /></main></>);
  }
  const b = res.data;
  const limitEnts = b.entitlements.filter((e) => e.featureKey.endsWith('_limit'));
  const featureEnts = b.entitlements.filter((e) => !e.featureKey.endsWith('_limit'));
  const usageFor = (key: string): number =>
    key === 'investigations_limit' ? b.usage.investigations : key === 'publications_limit' ? b.usage.publications : key === 'contributors_limit' ? b.usage.contributors : 0;

  return (
    <>
      <TopNav title="Billing & Plan" subtitle="Current plan, entitlements and usage — read-only" />
      <main className="space-y-6 p-5 lg:p-6">
        {res.demo ? <OfflineDemoBanner /> : null}
        <Card className="flex flex-wrap items-center justify-between gap-4 border-border" padded>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-card bg-primary/15"><CreditCard className="h-5 w-5 text-electric" /></span>
            <div>
              <div className="text-h5 font-bold text-text-primary">{b.planName}</div>
              <div className="text-label text-text-muted">Subscription plan</div>
            </div>
          </div>
          <span className="rounded-full px-3 py-1 text-caption font-semibold capitalize" style={{ backgroundColor: `${STATUS_COLOR[b.status] ?? '#94A3B8'}1f`, color: STATUS_COLOR[b.status] ?? '#94A3B8' }}>{b.status}</span>
        </Card>

        <div>
          <h2 className="mb-2 flex items-center gap-1.5 text-label uppercase tracking-wide text-text-muted"><Gauge className="h-3.5 w-3.5" /> Usage &amp; limits</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {limitEnts.map((e) => {
              const used = usageFor(e.featureKey);
              const cap = e.limitValue; const pct = cap && cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
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

        <p className="text-label text-text-muted">Self-serve checkout and invoicing arrive in a later phase. To change your plan, contact your platform administrator.</p>
      </main>
    </>
  );
}
