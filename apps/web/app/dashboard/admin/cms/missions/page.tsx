// HSI Phase 34 — Mission Builder (/dashboard/admin/cms/missions). Admin-only.
import { TopNav } from '@hsi/ui';
import { listMissionContentAction } from '@/lib/cms/site-ops';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/security/view';
import { AdminNav } from '@/components/admin/AdminNav';
import { CmsContentEditor } from '@/components/cms/CmsContentEditor';
import { ErrorState, OfflineDemoBanner } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function MissionBuilderPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !isAdmin(role)) {
    return (<><TopNav title="Mission Builder" subtitle="CMS — admin only" /><main className="space-y-6 p-5 lg:p-6"><AdminNav /><ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message={user ? 'Restricted to administrators.' : 'Sign in as an administrator.'} redirectedFrom="/dashboard/admin/cms/missions" /></main></>);
  }
  const res = await listMissionContentAction();
  const isDemo = res.ok && Boolean((res as { demo?: boolean }).demo);
  return (
    <>
      <TopNav title="Mission Builder" subtitle="Edit mission copy, rewards, and difficulty" />
      <main className="space-y-6 p-5 lg:p-6">
        <AdminNav />
        {isDemo ? <OfflineDemoBanner /> : null}
        {res.ok ? <CmsContentEditor kind="mission" rows={res.data} readonly={isDemo} /> : <ErrorState title="Could not load missions" message={(res as { error?: string }).error ?? 'Unavailable.'} />}
      </main>
    </>
  );
}
