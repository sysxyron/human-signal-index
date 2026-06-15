// =============================================================================
// HSI Phase 38 — Platform Subscription Oversight (/dashboard/admin/subscriptions).
// Server Component, force-dynamic, PLATFORM-ADMIN-ONLY. Read-only: every org's
// plan, status, MRR, renewal and usage, with status filters. No writes here.
// Offline → demo. RBAC unchanged.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { CreditCard, ShieldCheck } from 'lucide-react';
import { listBillingSubscriptionsAction } from '@/lib/billing/billing';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/security/view';
import { AdminNav } from '@/components/admin/AdminNav';
import { SubscriptionsTable } from '@/components/billing/SubscriptionsTable';
import { ErrorState, OfflineDemoBanner, EmptyState } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminSubscriptionsPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !isAdmin(role)) {
    return (<><TopNav title="Subscriptions" subtitle="Subscription oversight — admin only" /><main className="space-y-6 p-5 lg:p-6"><AdminNav /><ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message={user ? 'Subscription oversight is restricted to platform administrators.' : 'Sign in as an administrator.'} redirectedFrom="/dashboard/admin/subscriptions" /></main></>);
  }
  const res = await listBillingSubscriptionsAction();
  const rows = res.ok ? res.data : [];
  const isDemo = res.ok && Boolean((res as { demo?: boolean }).demo);

  return (
    <>
      <TopNav title="Subscriptions" subtitle="Plans, status, MRR and usage — read-only" />
      <main className="space-y-6 p-5 lg:p-6">
        <AdminNav />
        {isDemo ? <OfflineDemoBanner /> : null}
        <Card className="flex items-start gap-2.5 border-border" padded>
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption text-text-secondary">Read-only view of every organization&apos;s subscription. Plan catalog changes are on the Plans page; billing changes flow from Stripe via webhooks. MRR excludes trials.</p>
        </Card>
        {!res.ok ? <ErrorState title="Could not load subscriptions" message={(res as { error?: string }).error ?? 'Unavailable.'} code={res.code === 'FORBIDDEN' ? 'FORBIDDEN' : undefined} /> : rows.length === 0 ? (
          <EmptyState icon={<CreditCard className="h-5 w-5" />} title="No subscriptions" message="Subscriptions appear as organizations are provisioned." />
        ) : (
          <SubscriptionsTable rows={rows} />
        )}
      </main>
    </>
  );
}
