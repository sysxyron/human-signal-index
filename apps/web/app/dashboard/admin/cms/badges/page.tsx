// HSI Phase 34 — Badge Builder (/dashboard/admin/cms/badges). Admin-only.
import { TopNav } from '@hsi/ui';
import { listBadgeContentAction } from '@/lib/cms/site-ops';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/security/view';
import { AdminNav } from '@/components/admin/AdminNav';
import { CmsContentEditor } from '@/components/cms/CmsContentEditor';
import { ErrorState, OfflineDemoBanner } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function BadgeBuilderPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !isAdmin(role)) {
    return (<><TopNav title="Badge Builder" subtitle="CMS — admin only" /><main className="space-y-6 p-5 lg:p-6"><AdminNav /><ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message={user ? 'Restricted to administrators.' : 'Sign in as an administrator.'} redirectedFrom="/dashboard/admin/cms/badges" /></main></>);
  }
  const res = await listBadgeContentAction();
  const isDemo = res.ok && Boolean((res as { demo?: boolean }).demo);
  return (
    <>
      <TopNav title="Badge Builder" subtitle="Edit badge name, description, icon, unlock criteria, rewards" />
      <main className="space-y-6 p-5 lg:p-6">
        <AdminNav />
        {isDemo ? <OfflineDemoBanner /> : null}
        {res.ok ? <CmsContentEditor kind="badge" rows={res.data} readonly={isDemo} /> : <ErrorState title="Could not load badges" message={(res as { error?: string }).error ?? 'Unavailable.'} />}
      </main>
    </>
  );
}
