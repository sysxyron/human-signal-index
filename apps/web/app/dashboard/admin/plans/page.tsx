// =============================================================================
// HSI Phase 37 — Platform Plan Management (/dashboard/admin/plans). Server
// Component, force-dynamic, PLATFORM-ADMIN-ONLY. List/edit plans, edit feature
// entitlements + limits, activate/deactivate. All writes via audited DAL
// (requireAdmin). Offline → demo. RBAC unchanged.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { Layers, ShieldCheck } from 'lucide-react';
import { listPlansAction } from '@/lib/billing/billing';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/security/view';
import { AdminNav } from '@/components/admin/AdminNav';
import { PlanEditor } from '@/components/billing/PlanEditor';
import { ErrorState, OfflineDemoBanner, EmptyState } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminPlansPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !isAdmin(role)) {
    return (<><TopNav title="Plans" subtitle="Plan management — admin only" /><main className="space-y-6 p-5 lg:p-6"><AdminNav /><ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message={user ? 'Plan management is restricted to platform administrators.' : 'Sign in as an administrator.'} redirectedFrom="/dashboard/admin/plans" /></main></>);
  }
  const res = await listPlansAction();
  const plans = res.ok ? res.data : [];
  const isDemo = res.ok && Boolean((res as { demo?: boolean }).demo);

  return (
    <>
      <TopNav title="Plans" subtitle="Subscription tiers, features and limits" />
      <main className="space-y-6 p-5 lg:p-6">
        <AdminNav />
        {isDemo ? <OfflineDemoBanner /> : null}
        <Card className="flex items-start gap-2.5 border-border" padded>
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption text-text-secondary">Plan and entitlement changes apply platform-wide and are recorded to the subscription audit log. No payment processing is involved.</p>
        </Card>
        {!res.ok ? <ErrorState title="Could not load plans" message={(res as { error?: string }).error ?? 'Unavailable.'} code={res.code === 'FORBIDDEN' ? 'FORBIDDEN' : undefined} /> : plans.length === 0 ? (
          <EmptyState icon={<Layers className="h-5 w-5" />} title="No plans" message="Plans are seeded by migration 0041." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {plans.map((p) => <PlanEditor key={p.id} plan={p} />)}
          </div>
        )}
      </main>
    </>
  );
}
