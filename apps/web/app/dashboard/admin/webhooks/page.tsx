// =============================================================================
// HSI Phase 39 — Webhook Operations (/dashboard/admin/webhooks). Server Component,
// force-dynamic, PLATFORM-ADMIN-ONLY. Processed/failed/dead-letter counts + the
// dead-letter queue with replay (replay-safe + idempotent). Offline → demo.
// RBAC unchanged.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { Webhook, ShieldCheck } from 'lucide-react';
import { getWebhookOpsAction } from '@/lib/saas-ops/operations';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/security/view';
import { AdminNav } from '@/components/admin/AdminNav';
import { WebhookOpsPanel } from '@/components/saas-ops/WebhookOpsPanel';
import { ErrorState, OfflineDemoBanner } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function WebhooksPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !isAdmin(role)) {
    return (<><TopNav title="Webhooks" subtitle="Webhook ops — admin only" /><main className="space-y-6 p-5 lg:p-6"><AdminNav /><ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message={user ? 'Webhook operations are restricted to platform administrators.' : 'Sign in as an administrator.'} redirectedFrom="/dashboard/admin/webhooks" /></main></>);
  }
  const res = await getWebhookOpsAction();
  if (!res.ok) {
    return (<><TopNav title="Webhooks" subtitle="Webhook ops" /><main className="space-y-6 p-5 lg:p-6"><AdminNav /><ErrorState title="Could not load webhook ops" message={(res as { error?: string }).error ?? 'Unavailable.'} code={res.code === 'FORBIDDEN' ? 'FORBIDDEN' : undefined} /></main></>);
  }
  const isDemo = Boolean((res as { demo?: boolean }).demo);

  return (
    <>
      <TopNav title="Webhooks" subtitle="Stripe webhook processing, failures and replay" />
      <main className="space-y-6 p-5 lg:p-6">
        <AdminNav />
        {isDemo ? <OfflineDemoBanner /> : null}
        <Card className="flex items-start gap-2.5 border-border" padded>
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption text-text-secondary">Failed events are captured to a dead-letter queue and can be replayed. Replays are signature-independent (already-verified payloads) and idempotent — re-running a processed event is safe.</p>
        </Card>
        <div className="flex items-center gap-1.5 text-label uppercase tracking-wide text-text-muted"><Webhook className="h-3.5 w-3.5" /> Stripe webhook health</div>
        <WebhookOpsPanel data={res.data} />
      </main>
    </>
  );
}
