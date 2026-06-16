import { PublicNav, Footer } from '@hsi/ui';
import { appHref } from '@/lib/env/app-url';
import { getPublicSiteUrl } from '@/lib/env/site-url';
import { AccessibilityWidget } from '@/components/accessibility/AccessibilityWidget';

export default function MarketingLayout({
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
  return (
    <div className="flex min-h-screen flex-col">
      <PublicNav dashboardHref={dashboardHref} siteBase={siteBase} signInHref={signInHref} />
      <div className="flex-1">{children}</div>
      <Footer dashboardHref={dashboardHref} siteBase={siteBase} />
      <AccessibilityWidget />
    </div>
  );
}
