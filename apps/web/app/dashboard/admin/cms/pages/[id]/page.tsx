// =============================================================================
// HSI Phase 31 — CMS Page Editor (/dashboard/admin/cms/pages/[id]). Server
// Component, force-dynamic, ADMIN-ONLY. Loads the page draft (id='new' → empty)
// and renders the block editor. Offline → labeled demo. RBAC unchanged.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { PageDraft } from '@hsi/cms-engine';
import { getPage } from '@/lib/cms/cms';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/security/view';
import { AdminNav } from '@/components/admin/AdminNav';
import { PageEditor } from '@/components/cms/PageEditor';
import { ErrorState, OfflineDemoBanner } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const EMPTY_DRAFT: PageDraft = {
  page: { id: 'new', slug: '', pageType: 'content', title: 'Untitled page', status: 'draft', seo: {} },
  blocks: [],
};

export default async function CmsPageEditorPage({ params }: { params: { id: string } }) {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !isAdmin(role)) {
    return (
      <>
        <TopNav title="Page editor" subtitle="CMS — admin only" />
        <main className="space-y-6 p-5 lg:p-6"><AdminNav /><ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message={user ? 'Content editing is restricted to administrators.' : 'Sign in as an administrator.'} redirectedFrom={`/dashboard/admin/cms/pages/${params.id}`} /></main>
      </>
    );
  }

  const isNew = params.id === 'new';
  let draft: PageDraft = EMPTY_DRAFT;
  let isDemo = false;
  if (!isNew) {
    const res = await getPage(params.id);
    if (res.ok) { draft = res.data; isDemo = Boolean(res.demo); }
    else {
      return (
        <>
          <TopNav title="Page editor" subtitle="CMS" />
          <main className="space-y-6 p-5 lg:p-6"><AdminNav /><ErrorState title="Could not load page" message={(res as { error?: string }).error ?? 'Page not found.'} /></main>
        </>
      );
    }
  }

  return (
    <>
      <TopNav title={isNew ? 'New page' : draft.page.title} subtitle="Edit blocks · save draft · publish" />
      <main className="space-y-6 p-5 lg:p-6">
        <AdminNav />
        {isDemo ? <OfflineDemoBanner /> : null}
        <Link href={"/dashboard/admin/cms" as never} className="inline-flex items-center gap-1.5 text-caption text-text-muted hover:text-text-primary"><ArrowLeft className="h-3.5 w-3.5" /> All pages</Link>
        {isDemo ? (
          <Card className="border-border" padded><p className="text-caption text-text-secondary">Editing is disabled in the offline demo (no database). Connect Supabase to manage content.</p></Card>
        ) : (
          <PageEditor initial={draft} isNew={isNew} />
        )}
      </main>
    </>
  );
}
