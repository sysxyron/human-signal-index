// =============================================================================
// HSI Phase 37 — Organization Branding (/dashboard/org/branding). Server
// Component, force-dynamic. Org-admin edits + previews logo/colors/footer for
// white-label. Stored only — NO runtime theme switching yet (later phase).
// Audited via DAL. Org-isolated. RBAC unchanged.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { Palette, ShieldCheck } from 'lucide-react';
import { getOrgBrandingAction } from '@/lib/billing/billing';
import { OrgBrandingForm } from '@/components/billing/OrgBrandingForm';
import { ErrorState, OfflineDemoBanner } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function OrgBrandingPage() {
  const res = await getOrgBrandingAction();
  if (!res.ok) {
    return (<><TopNav title="Branding" subtitle="White-label appearance" /><main className="space-y-6 p-5 lg:p-6"><ErrorState code={res.code === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : undefined} title="Could not load branding" message="Unavailable right now." redirectedFrom="/dashboard/org/branding" /></main></>);
  }
  const { canManage, ...branding } = res.data;
  return (
    <>
      <TopNav title="Branding" subtitle="White-label appearance for your organization" />
      <main className="space-y-6 p-5 lg:p-6">
        {res.demo ? <OfflineDemoBanner /> : null}
        <Card className="flex items-start gap-2.5 border-border" padded>
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption text-text-secondary">{canManage ? 'Customize your logo, colors and footer. Settings are stored for white-label use; live theming ships in a later phase. Changes are audited.' : 'Only organization owners and administrators can edit branding. You have read-only access.'}</p>
        </Card>
        <div className="flex items-center gap-1.5 text-label uppercase tracking-wide text-text-muted"><Palette className="h-3.5 w-3.5" /> Appearance</div>
        <OrgBrandingForm initial={branding} readonly={!canManage} />
      </main>
    </>
  );
}
