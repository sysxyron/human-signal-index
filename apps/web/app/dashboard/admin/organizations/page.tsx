// =============================================================================
// HSI Phase 35 — Admin Organizations Oversight (/dashboard/admin/organizations).
// Server Component, force-dynamic, PLATFORM-ADMIN-ONLY. Read-only: list orgs +
// health + member/publication counts. Offline → demo. RBAC unchanged.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { Building2, ShieldCheck } from 'lucide-react';
import { listOrganizationsAction, type OrgOversightRow } from '@/lib/org/organizations';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/security/view';
import { AdminNav } from '@/components/admin/AdminNav';
import { ErrorState, OfflineDemoBanner, EmptyState } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const STATUS_COLOR: Record<string, string> = { active: '#10B981', suspended: '#F59E0B', archived: '#94A3B8' };

export default async function AdminOrganizationsPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !isAdmin(role)) {
    return (<><TopNav title="Organizations" subtitle="Platform oversight — admin only" /><main className="space-y-6 p-5 lg:p-6"><AdminNav /><ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message={user ? 'Organization oversight is restricted to platform administrators.' : 'Sign in as an administrator.'} redirectedFrom="/dashboard/admin/organizations" /></main></>);
  }
  const res = await listOrganizationsAction();
  const orgs: OrgOversightRow[] = res.ok ? res.data : [];
  const isDemo = res.ok && Boolean((res as { demo?: boolean }).demo);

  return (
    <>
      <TopNav title="Organizations" subtitle="Tenant oversight — read-only" />
      <main className="space-y-6 p-5 lg:p-6">
        <AdminNav />
        {isDemo ? <OfflineDemoBanner /> : null}
        <Card className="flex items-start gap-2.5 border-border" padded>
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption text-text-secondary">Platform admins retain global visibility across all tenants. This view is read-only; org membership + content stay tenant-isolated by RLS.</p>
        </Card>
        {!res.ok ? <ErrorState title="Could not load organizations" message={(res as { error?: string }).error ?? 'Unavailable.'} code={res.code === 'FORBIDDEN' ? 'FORBIDDEN' : undefined} /> : orgs.length === 0 ? (
          <EmptyState icon={<Building2 className="h-5 w-5" />} title="No organizations" message="Organizations appear here as tenants are created." />
        ) : (
          <Card className="overflow-x-auto border-border p-0" padded={false}>
            <table className="w-full text-caption">
              <thead className="border-b border-border bg-surface/50 text-label uppercase tracking-wide text-text-muted">
                <tr><th className="px-4 py-2.5 text-left">Organization</th><th className="px-4 py-2.5 text-left">Slug</th><th className="px-4 py-2.5 text-left">Status</th><th className="px-4 py-2.5 text-right">Members</th><th className="px-4 py-2.5 text-right">Investigations</th><th className="px-4 py-2.5 text-right">Publications</th></tr>
              </thead>
              <tbody>
                {orgs.map((o) => (
                  <tr key={o.id} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-2.5 font-medium text-text-primary">{o.name}</td>
                    <td className="px-4 py-2.5 text-text-muted">/{o.slug}</td>
                    <td className="px-4 py-2.5"><span className="rounded-full px-2 py-0.5 text-label font-semibold capitalize" style={{ backgroundColor: `${STATUS_COLOR[o.status]}1f`, color: STATUS_COLOR[o.status] }}>{o.status}</span></td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">{o.members}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">{o.investigations}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">{o.publications}</td>
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
