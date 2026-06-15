// =============================================================================
// HSI Phase 39 — Subscription Health (/dashboard/admin/subscription-health).
// Server Component, force-dynamic, PLATFORM-ADMIN-ONLY. Per-org health score +
// churn risk + plan + usage trend, with status filters. Read-only (computing the
// view snapshots health/churn). Offline → demo. RBAC unchanged.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { Activity, ShieldCheck } from 'lucide-react';
import { getSubscriptionHealthAction } from '@/lib/saas-ops/operations';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/security/view';
import { AdminNav } from '@/components/admin/AdminNav';
import { HealthTable } from '@/components/saas-ops/HealthTable';
import { ErrorState, OfflineDemoBanner, EmptyState } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function SubscriptionHealthPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !isAdmin(role)) {
    return (<><TopNav title="Subscription Health" subtitle="Health monitoring — admin only" /><main className="space-y-6 p-5 lg:p-6"><AdminNav /><ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message={user ? 'Subscription health is restricted to platform administrators.' : 'Sign in as an administrator.'} redirectedFrom="/dashboard/admin/subscription-health" /></main></>);
  }
  const res = await getSubscriptionHealthAction();
  const rows = res.ok ? res.data : [];
  const isDemo = res.ok && Boolean((res as { demo?: boolean }).demo);

  return (
    <>
      <TopNav title="Subscription Health" subtitle="Account health and churn risk across organizations" />
      <main className="space-y-6 p-5 lg:p-6">
        <AdminNav />
        {isDemo ? <OfflineDemoBanner /> : null}
        <Card className="flex items-start gap-2.5 border-border" padded>
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption text-text-secondary">Health blends active users, content/investigation/publication activity and usage trend; churn risk weighs declining usage, inactivity, payment failures and expiring trials.</p>
        </Card>
        {!res.ok ? <ErrorState title="Could not load health" message={(res as { error?: string }).error ?? 'Unavailable.'} code={res.code === 'FORBIDDEN' ? 'FORBIDDEN' : undefined} /> : rows.length === 0 ? (
          <EmptyState icon={<Activity className="h-5 w-5" />} title="No subscriptions" message="Health appears as organizations subscribe." />
        ) : (
          <HealthTable rows={rows} />
        )}
      </main>
    </>
  );
}
