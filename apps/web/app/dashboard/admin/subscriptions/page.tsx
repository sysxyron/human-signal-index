// =============================================================================
// HSI Phase 37 — Platform Subscription Oversight (/dashboard/admin/subscriptions).
// Server Component, force-dynamic, PLATFORM-ADMIN-ONLY. Read-only: orgs, plan
// assignments, status, usage summary. NO writes here. Offline → demo. RBAC
// unchanged; tenant data surfaced to admins only.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { CreditCard, ShieldCheck } from 'lucide-react';
import { listSubscriptionsAction } from '@/lib/billing/billing';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/security/view';
import { AdminNav } from '@/components/admin/AdminNav';
import { ErrorState, OfflineDemoBanner, EmptyState } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const STATUS_COLOR: Record<string, string> = { active: '#10B981', trial: '#3B82F6', paused: '#F59E0B', expired: '#94A3B8' };

export default async function AdminSubscriptionsPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !isAdmin(role)) {
    return (<><TopNav title="Subscriptions" subtitle="Subscription oversight — admin only" /><main className="space-y-6 p-5 lg:p-6"><AdminNav /><ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message={user ? 'Subscription oversight is restricted to platform administrators.' : 'Sign in as an administrator.'} redirectedFrom="/dashboard/admin/subscriptions" /></main></>);
  }
  const res = await listSubscriptionsAction();
  const rows = res.ok ? res.data : [];
  const isDemo = res.ok && Boolean((res as { demo?: boolean }).demo);

  return (
    <>
      <TopNav title="Subscriptions" subtitle="Plan assignments and usage — read-only" />
      <main className="space-y-6 p-5 lg:p-6">
        <AdminNav />
        {isDemo ? <OfflineDemoBanner /> : null}
        <Card className="flex items-start gap-2.5 border-border" padded>
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption text-text-secondary">Read-only view of every organization&apos;s plan, status and usage. Plan changes are made on the Plans page; assignments are managed via the subscription DAL.</p>
        </Card>
        {!res.ok ? <ErrorState title="Could not load subscriptions" message={(res as { error?: string }).error ?? 'Unavailable.'} code={res.code === 'FORBIDDEN' ? 'FORBIDDEN' : undefined} /> : rows.length === 0 ? (
          <EmptyState icon={<CreditCard className="h-5 w-5" />} title="No subscriptions" message="Subscriptions appear as organizations are provisioned." />
        ) : (
          <Card className="overflow-x-auto border-border p-0" padded={false}>
            <table className="w-full text-caption">
              <thead className="border-b border-border bg-surface/50 text-label uppercase tracking-wide text-text-muted">
                <tr><th className="px-4 py-2.5 text-left">Organization</th><th className="px-4 py-2.5 text-left">Plan</th><th className="px-4 py-2.5 text-left">Status</th><th className="px-4 py-2.5 text-right">Investigations</th><th className="px-4 py-2.5 text-right">Publications</th><th className="px-4 py-2.5 text-right">Contributors</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.orgId} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-2.5 font-medium text-text-primary">{r.orgName}</td>
                    <td className="px-4 py-2.5 text-text-secondary">{r.plan}</td>
                    <td className="px-4 py-2.5"><span className="rounded-full px-2 py-0.5 text-label font-semibold capitalize" style={{ backgroundColor: `${STATUS_COLOR[r.status] ?? '#94A3B8'}1f`, color: STATUS_COLOR[r.status] ?? '#94A3B8' }}>{r.status}</span></td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">{r.investigations.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">{r.publications.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">{r.contributors.toLocaleString()}</td>
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
