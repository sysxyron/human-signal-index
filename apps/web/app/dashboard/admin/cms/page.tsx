// =============================================================================
// HSI Phase 31 — Admin CMS Dashboard (/dashboard/admin/cms). Server Component,
// force-dynamic, ADMIN-ONLY. Lists CMS pages with status / last-modified.
// Offline → labeled demo. Only admins manage content (RBAC unchanged).
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import Link from 'next/link';
import { FileText, Plus, ShieldCheck, Navigation as NavIcon, Image as ImageIcon } from 'lucide-react';
import { listPages, type PageListRow } from '@/lib/cms/cms';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/security/view';
import { AdminNav } from '@/components/admin/AdminNav';
import { CmsSeedButton } from '@/components/cms/CmsSeedButton';
import { ErrorState, OfflineDemoBanner, EmptyState } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const STATUS_COLOR: Record<string, string> = { draft: '#94A3B8', review: '#F59E0B', published: '#10B981', archived: '#64748B' };

export default async function CmsDashboardPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !isAdmin(role)) {
    return (
      <>
        <TopNav title="Content (CMS)" subtitle="Content operations — admin only" />
        <main className="space-y-6 p-5 lg:p-6"><AdminNav /><ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message={user ? 'Content management is restricted to administrators.' : 'Sign in as an administrator.'} redirectedFrom="/dashboard/admin/cms" /></main>
      </>
    );
  }
  const res = await listPages();
  const pages: PageListRow[] = res.ok ? res.data : [];
  const isDemo = res.ok && Boolean(res.demo);

  return (
    <>
      <TopNav title="Content (CMS)" subtitle="Manage pages, navigation, and media — no code required" />
      <main className="space-y-6 p-5 lg:p-6">
        <AdminNav />
        {isDemo ? <OfflineDemoBanner /> : null}
        <Card className="flex items-start gap-2.5 border-border" padded>
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption text-text-secondary">Only administrators can edit/publish. Published pages render publicly at <code className="text-text-primary">/p/&lt;slug&gt;</code> with a code fallback, so unpublishing never breaks the site.</p>
        </Card>

        <div className="flex flex-wrap gap-2">
          <Link href={"/dashboard/admin/cms/pages/new" as never} className="inline-flex items-center gap-1.5 rounded-card bg-electric px-3 py-2 text-caption font-semibold text-white"><Plus className="h-4 w-4" /> New page</Link>
          <Link href={"/dashboard/admin/cms/navigation" as never} className="inline-flex items-center gap-1.5 rounded-card border border-border bg-surface/50 px-3 py-2 text-caption text-text-secondary hover:text-text-primary"><NavIcon className="h-4 w-4" /> Navigation</Link>
          <Link href={"/dashboard/admin/cms/media" as never} className="inline-flex items-center gap-1.5 rounded-card border border-border bg-surface/50 px-3 py-2 text-caption text-text-secondary hover:text-text-primary"><ImageIcon className="h-4 w-4" /> Media</Link>
        </div>
        {!isDemo && pages.length > 0 ? (
          <Card className="flex flex-wrap items-center justify-between gap-2 border-border" padded>
            <p className="text-caption text-text-secondary">Backfill any missing site content into the CMS — idempotent, safe to rerun.</p>
            <CmsSeedButton label="Backfill site content" />
          </Card>
        ) : null}

        {!res.ok ? (
          <ErrorState title="Could not load pages" message={(res as { error?: string }).error ?? 'Unavailable right now.'} />
        ) : pages.length === 0 ? (
          <EmptyState icon={<FileText className="h-5 w-5" />} title="No pages yet" message={isDemo ? 'Connect Supabase, then seed existing site content.' : 'Seed the existing site content into the CMS, or create a page from scratch.'} action={!isDemo ? <CmsSeedButton /> : undefined} />
        ) : (
          <Card className="overflow-x-auto border-border p-0" padded={false}>
            <table className="w-full text-caption">
              <thead className="border-b border-border bg-surface/50 text-label uppercase tracking-wide text-text-muted">
                <tr><th className="px-4 py-2.5 text-left">Title</th><th className="px-4 py-2.5 text-left">Slug</th><th className="px-4 py-2.5 text-left">Type</th><th className="px-4 py-2.5 text-left">Status</th><th className="px-4 py-2.5 text-left">Last modified</th></tr>
              </thead>
              <tbody>
                {pages.map((p) => (
                  <tr key={p.id} className="border-b border-border/50 last:border-0 hover:bg-surface/40">
                    <td className="px-4 py-2.5"><Link href={`/dashboard/admin/cms/pages/${p.id}` as never} className="font-medium text-text-primary hover:text-electric">{p.title}</Link></td>
                    <td className="px-4 py-2.5 text-text-muted">/{p.slug}</td>
                    <td className="px-4 py-2.5 capitalize text-text-secondary">{p.pageType}</td>
                    <td className="px-4 py-2.5"><span className="rounded-full px-2 py-0.5 text-label font-semibold capitalize" style={{ backgroundColor: `${STATUS_COLOR[p.status]}1f`, color: STATUS_COLOR[p.status] }}>{p.status}</span></td>
                    <td className="px-4 py-2.5 text-text-muted">{p.updatedAt ? new Date(p.updatedAt).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </main>
    </>
  );
}
