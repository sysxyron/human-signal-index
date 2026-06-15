// =============================================================================
// HSI Phase 34 — Site Operations Center (/dashboard/admin/site-ops). Server
// Component, force-dynamic, ADMIN-ONLY. One control center for pages, media,
// navigation, missions, badges, onboarding, role content, and branding.
// Offline → labeled demo. RBAC unchanged.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import Link from 'next/link';
import { LayoutGrid, FileText, Image as ImageIcon, Navigation as NavIcon, Target, Award, UserCog, Rocket, Palette, ArrowRight } from 'lucide-react';
import { getSiteOpsSummaryAction, type SiteOpsSummary } from '@/lib/cms/site-ops';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/security/view';
import { AdminNav } from '@/components/admin/AdminNav';
import { ErrorState, OfflineDemoBanner } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function SiteOpsPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !isAdmin(role)) {
    return (<><TopNav title="Site Operations" subtitle="Operator control center — admin only" /><main className="space-y-6 p-5 lg:p-6"><AdminNav /><ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message={user ? 'Site operations are restricted to administrators.' : 'Sign in as an administrator.'} redirectedFrom="/dashboard/admin/site-ops" /></main></>);
  }
  const res = await getSiteOpsSummaryAction();
  const s: SiteOpsSummary = res.ok ? res.data : { pages: 0, published: 0, media: 0, navigation: 0, missions: 0, badges: 0, roles: 0, onboarding: 0 };
  const isDemo = res.ok && Boolean((res as { demo?: boolean }).demo);

  const tiles: Array<{ label: string; href: string; icon: React.ComponentType<{ className?: string }>; count: number; sub?: string }> = [
    { label: 'Pages', href: '/dashboard/admin/cms', icon: FileText, count: s.pages, sub: `${s.published} published` },
    { label: 'Media', href: '/dashboard/admin/cms/media', icon: ImageIcon, count: s.media },
    { label: 'Navigation', href: '/dashboard/admin/cms/navigation', icon: NavIcon, count: s.navigation },
    { label: 'Missions', href: '/dashboard/admin/cms/missions', icon: Target, count: s.missions },
    { label: 'Badges', href: '/dashboard/admin/cms/badges', icon: Award, count: s.badges },
    { label: 'Role content', href: '/dashboard/admin/cms/roles', icon: UserCog, count: s.roles },
    { label: 'Onboarding', href: '/dashboard/admin/cms', icon: Rocket, count: s.onboarding },
    { label: 'Site settings', href: '/dashboard/admin/site-settings', icon: Palette, count: 1, sub: 'branding' },
  ];

  return (
    <>
      <TopNav title="Site Operations" subtitle="Operate the whole site — no code required" />
      <main className="space-y-6 p-5 lg:p-6">
        <AdminNav />
        {isDemo ? <OfflineDemoBanner /> : null}
        <Card className="flex items-start gap-2.5 border-electric/30 bg-electric/5" padded>
          <LayoutGrid className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption text-text-secondary">One control center for pages, media, navigation, missions, badges, onboarding, role content, and branding. Every change is admin-only and audited with before/after.</p>
        </Card>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {tiles.map((t) => (
            <Link key={t.label} href={t.href as never} className="block">
              <Card className="flex items-center justify-between gap-3 border-border transition hover:border-electric/50" padded>
                <div><div className="flex items-center gap-1.5 text-label uppercase tracking-wide text-text-muted"><t.icon className="h-3.5 w-3.5" /> {t.label}</div><div className="text-h4 font-bold tabular-nums text-text-primary">{t.count}</div>{t.sub ? <div className="text-label text-text-muted">{t.sub}</div> : null}</div>
                <ArrowRight className="h-4 w-4 shrink-0 text-text-muted" />
              </Card>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
