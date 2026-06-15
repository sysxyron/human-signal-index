// =============================================================================
// HSI Phase 37 — Organization Settings (/dashboard/org/settings). Server
// Component, force-dynamic. Org-admin edits name/description/logo/contact/
// website/support. Saved through audited DAL. Non-admins see read-only. RBAC
// unchanged (org membership role gates write, not global RBAC).
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { Settings, ShieldCheck } from 'lucide-react';
import { getOrgSettingsAction } from '@/lib/billing/billing';
import { OrgSettingsForm } from '@/components/billing/OrgSettingsForm';
import { ErrorState, OfflineDemoBanner } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function OrgSettingsPage() {
  const res = await getOrgSettingsAction();
  if (!res.ok) {
    return (<><TopNav title="Organization Settings" subtitle="Profile and contact details" /><main className="space-y-6 p-5 lg:p-6"><ErrorState code={res.code === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : undefined} title="Could not load settings" message="Unavailable right now." redirectedFrom="/dashboard/org/settings" /></main></>);
  }
  const { canManage, ...settings } = res.data;
  return (
    <>
      <TopNav title="Organization Settings" subtitle="Profile and contact details for your workspace" />
      <main className="space-y-6 p-5 lg:p-6">
        {res.demo ? <OfflineDemoBanner /> : null}
        <Card className="flex items-start gap-2.5 border-border" padded>
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption text-text-secondary">{canManage ? 'You can edit these details. Every change is recorded to the subscription audit log.' : 'Only organization owners and administrators can edit these details. You have read-only access.'}</p>
        </Card>
        <div className="flex items-center gap-1.5 text-label uppercase tracking-wide text-text-muted"><Settings className="h-3.5 w-3.5" /> Workspace profile</div>
        <OrgSettingsForm initial={settings} readonly={!canManage} />
      </main>
    </>
  );
}
