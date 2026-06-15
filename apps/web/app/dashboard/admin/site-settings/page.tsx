// =============================================================================
// HSI Phase 34 — Site Settings / Branding (/dashboard/admin/site-settings).
// Server Component, force-dynamic, ADMIN-ONLY. Edit site name, logo, favicon,
// footer, contact, and social links. Offline → labeled demo. RBAC unchanged.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { Palette } from 'lucide-react';
import { getSiteSettingsAction } from '@/lib/cms/site-ops';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/security/view';
import { AdminNav } from '@/components/admin/AdminNav';
import { SiteSettingsForm } from '@/components/cms/SiteSettingsForm';
import { ErrorState, OfflineDemoBanner } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function SiteSettingsPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !isAdmin(role)) {
    return (<><TopNav title="Site Settings" subtitle="Branding — admin only" /><main className="space-y-6 p-5 lg:p-6"><AdminNav /><ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message={user ? 'Site settings are restricted to administrators.' : 'Sign in as an administrator.'} redirectedFrom="/dashboard/admin/site-settings" /></main></>);
  }
  const res = await getSiteSettingsAction();
  const isDemo = res.ok && Boolean((res as { demo?: boolean }).demo);

  return (
    <>
      <TopNav title="Site Settings" subtitle="Branding, footer, contact, and social links" />
      <main className="space-y-6 p-5 lg:p-6">
        <AdminNav />
        {isDemo ? <OfflineDemoBanner /> : null}
        <Card className="flex items-start gap-2.5 border-border" padded>
          <Palette className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption text-text-secondary">Operator-managed branding — changes are audited with before/after and never touch access control.</p>
        </Card>
        {res.ok ? <SiteSettingsForm initial={res.data} readonly={isDemo} /> : <ErrorState title="Could not load settings" message={(res as { error?: string }).error ?? 'Unavailable.'} />}
      </main>
    </>
  );
}
