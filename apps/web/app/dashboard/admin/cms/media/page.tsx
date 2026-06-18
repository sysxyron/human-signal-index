// =============================================================================
// HSI Phase 31 — CMS Media Manager (/dashboard/admin/cms/media). Server
// Component, force-dynamic, ADMIN-ONLY. Lists the media library (images / docs /
// logos / report assets). Offline → labeled demo. RBAC unchanged.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import Link from 'next/link';
import { ArrowLeft, Image as ImageIcon, CheckCircle2, AlertTriangle } from 'lucide-react';
import { listMedia, type MediaItem } from '@/lib/cms/cms';
import { probeStorage } from '@/lib/health/probes';
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
  // Storage status comes from the SAME source of truth as /api/health/storage
  // (probeStorage) so this page and the security health page can never disagree.
  const [res, storage] = await Promise.all([listMedia(), probeStorage()]);
  const items: MediaItem[] = res.ok ? res.data : [];
  const isDemo = res.ok && Boolean(res.demo);

  const det = (storage.details ?? {}) as {
    bucket?: string; public?: boolean | null; allowedMimeTypes?: string[] | null; code?: string;
  };
  const bucketName = det.bucket ?? (process.env.CMS_MEDIA_BUCKET || 'cms_media');
  const bucketMissing = !storage.ok && det.code === 'storage.bucket_missing';
  const isPublic = det.public === true;
  const mimeConfigured = Array.isArray(det.allowedMimeTypes) && det.allowedMimeTypes.length > 0;

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
        {storage.ok ? (
          <Card className="flex items-start gap-2.5 border-verified/30 bg-verified/5" padded>
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-verified" />
            <p className="text-caption text-text-secondary">
              <span className="font-semibold text-text-primary">Storage status: Operational.</span>{' '}
              Bucket <code className="text-text-primary">{bucketName}</code> is reachable{isPublic ? ' and public' : ''}{mimeConfigured ? ', with allowed MIME types configured' : ''}.{' '}
              Upload controls are not enabled yet in this build; media records are admin-managed and world-readable for use in published content.
            </p>
          </Card>
        ) : bucketMissing ? (
          <Card className="flex items-start gap-2.5 border-warning/30 bg-warning/5" padded>
            <ImageIcon className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-caption text-text-secondary">Media upload requires a Supabase Storage bucket <code className="text-text-primary">{bucketName}</code>. Until it is provisioned, uploads are disabled (no dead controls); media records are admin-managed and world-readable for use in published content.</p>
          </Card>
        ) : (
          <Card className="flex items-start gap-2.5 border-warning/30 bg-warning/5" padded>
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-caption text-text-secondary">
              <span className="font-semibold text-text-primary">Storage status: {storage.status}.</span>{' '}
              {storage.message} Resolve storage configuration before enabling uploads; media records are admin-managed and world-readable for use in published content.
            </p>
          </Card>
        )}
      </main>
    </>
  );
}
