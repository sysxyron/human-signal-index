// =============================================================================
// HSI Phase 31 — CMS Navigation Manager (/dashboard/admin/cms/navigation).
// Server Component, force-dynamic, ADMIN-ONLY. Lists operator-managed header /
// footer / dashboard-help links. Offline → labeled demo. RBAC unchanged.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import Link from 'next/link';
import { ArrowLeft, Navigation as NavIcon } from 'lucide-react';
import { listNavigation, type NavItem } from '@/lib/cms/cms';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/security/view';
import { AdminNav } from '@/components/admin/AdminNav';
import { ErrorState, OfflineDemoBanner } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const LOCATIONS: Array<{ key: string; label: string }> = [
  { key: 'header', label: 'Header menu' }, { key: 'footer', label: 'Footer menu' }, { key: 'dashboard_help', label: 'Dashboard help links' },
];

export default async function CmsNavigationPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !isAdmin(role)) {
    return (<><TopNav title="Navigation" subtitle="CMS — admin only" /><main className="space-y-6 p-5 lg:p-6"><AdminNav /><ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message={user ? 'Restricted to administrators.' : 'Sign in as an administrator.'} redirectedFrom="/dashboard/admin/cms/navigation" /></main></>);
  }
  const res = await listNavigation();
  const items: NavItem[] = res.ok ? res.data : [];
  const isDemo = res.ok && Boolean(res.demo);

  return (
    <>
      <TopNav title="Navigation" subtitle="Header, footer, and help links" />
      <main className="space-y-6 p-5 lg:p-6">
        <AdminNav />
        {isDemo ? <OfflineDemoBanner /> : null}
        <Link href={"/dashboard/admin/cms" as never} className="inline-flex items-center gap-1.5 text-caption text-text-muted hover:text-text-primary"><ArrowLeft className="h-3.5 w-3.5" /> Content</Link>
        {LOCATIONS.map((loc) => {
          const rows = items.filter((i) => i.location === loc.key);
          return (
            <section key={loc.key} className="space-y-2">
              <h2 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><NavIcon className="h-4 w-4 text-electric" /> {loc.label}</h2>
              <Card className="space-y-1.5 border-border" padded>
                {rows.length === 0 ? <p className="text-caption text-text-muted">No links.</p> : rows.map((i) => (
                  <div key={i.id} className="flex items-center justify-between text-caption">
                    <span className="text-text-primary">{i.label}</span>
                    <span className="text-text-muted">{i.href}{i.active ? '' : ' · hidden'}</span>
                  </div>
                ))}
              </Card>
            </section>
          );
        })}
        <p className="text-label text-text-muted">Navigation links are admin-managed and stored in <code className="text-text-primary">cms_navigation</code>; active links render on the public site with a code fallback.</p>
      </main>
    </>
  );
}
