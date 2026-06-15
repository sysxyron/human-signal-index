// =============================================================================
// HSI Phase 31 — CMS Media Manager (/dashboard/admin/cms/media). Server
// Component, force-dynamic, ADMIN-ONLY. Lists the media library (images / docs /
// logos / report assets). Offline → labeled demo. RBAC unchanged.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import Link from 'next/link';
import { ArrowLeft, Image as ImageIcon } from 'lucide-react';
import { listMedia, type MediaItem } from '@/lib/cms/cms';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/security/view';
import { AdminNav } from '@/components/admin/AdminNav';
import { ErrorState, OfflineDemoBanner, EmptyState } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function kb(n: number | null): string { return n ? `${Math.round(n / 1024)} KB` : '—'; }

export default async function CmsMediaPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !isAdmin(role)) {
    return (<><TopNav title="Media" subtitle="CMS — admin only" /><main className="space-y-6 p-5 lg:p-6"><AdminNav /><ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message={user ? 'Restricted to administrators.' : 'Sign in as an administrator.'} redirectedFrom="/dashboard/admin/cms/media" /></main></>);
  }
  const res = await listMedia();
  const items: MediaItem[] = res.ok ? res.data : [];
  const isDemo = res.ok && Boolean(res.demo);

  return (
    <>
      <TopNav title="Media" subtitle="Images, documents, logos, report assets" />
      <main className="space-y-6 p-5 lg:p-6">
        <AdminNav />
        {isDemo ? <OfflineDemoBanner /> : null}
        <Link href={"/dashboard/admin/cms" as never} className="inline-flex items-center gap-1.5 text-caption text-text-muted hover:text-text-primary"><ArrowLeft className="h-3.5 w-3.5" /> Content</Link>
        {items.length === 0 ? <EmptyState icon={<ImageIcon className="h-5 w-5" />} title="No media yet" message="Upload images and documents for use across content." /> : (
          <Card className="overflow-x-auto border-border p-0" padded={false}>
            <table className="w-full text-caption">
              <thead className="border-b border-border bg-surface/50 text-label uppercase tracking-wide text-text-muted">
                <tr><th className="px-4 py-2.5 text-left">File</th><th className="px-4 py-2.5 text-left">Type</th><th className="px-4 py-2.5 text-right">Size</th><th className="px-4 py-2.5 text-left">Uploaded</th></tr>
              </thead>
              <tbody>
                {items.map((m) => (
                  <tr key={m.id} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-2.5 font-medium text-text-primary">{m.filename}</td>
                    <td className="px-4 py-2.5 text-text-muted">{m.mimeType ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">{kb(m.sizeBytes)}</td>
                    <td className="px-4 py-2.5 text-text-muted">{new Date(m.uploadedAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
        <p className="text-label text-text-muted">Media is admin-managed (<code className="text-text-primary">cms_media</code>) and world-readable for use in published content.</p>
      </main>
    </>
  );
}
