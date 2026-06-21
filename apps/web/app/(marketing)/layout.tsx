import { PublicNav, Footer } from '@hsi/ui';
import { appHref } from '@/lib/env/app-url';
import { getPublicSiteUrl } from '@/lib/env/site-url';
import { getUser } from '@/lib/supabase/server';
import { getPublicFooterGroups } from '@/lib/cms/cms';
import { AccessibilityWidget } from '@/components/accessibility/AccessibilityWidget';
import { MaintenanceBanner } from '@/components/system/MaintenanceBanner';

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Domain split: marketing nav stays on the www marketing origin (siteBase),
  // while Dashboard / Login / Signup go to the app origin (NEXT_PUBLIC_APP_URL).
  // In dev/preview siteBase is '' so links stay relative.
  const dashboardHref = appHref('/dashboard');
  const signInHref = appHref('/sign-in');
  const siteBase = getPublicSiteUrl();
  // Phase 41B.3 (A): hide "Sign in" for authenticated visitors (server-detected).
  const [user, footerGroups] = await Promise.all([getUser(), getPublicFooterGroups()]);
  const authed = Boolean(user);
  return (
    <div className="flex min-h-screen flex-col">
      <PublicNav dashboardHref={dashboardHref} siteBase={siteBase} signInHref={signInHref} authed={authed} />
      <MaintenanceBanner />
      <div className="flex-1">{children}</div>
      <Footer dashboardHref={dashboardHref} siteBase={siteBase} groups={footerGroups ?? undefined} />
      <AccessibilityWidget />
    </div>
  );
}
