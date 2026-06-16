import { PublicNav, Footer } from '@hsi/ui';
import { appHref } from '@/lib/env/app-url';
import { AccessibilityWidget } from '@/components/accessibility/AccessibilityWidget';

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Public marketing pages live on the marketing origin; send app CTAs to the
  // app domain (NEXT_PUBLIC_APP_URL) rather than a relative /dashboard.
  const dashboardHref = appHref('/dashboard');
  return (
    <div className="flex min-h-screen flex-col">
      <PublicNav dashboardHref={dashboardHref} />
      <div className="flex-1">{children}</div>
      <Footer dashboardHref={dashboardHref} />
      <AccessibilityWidget />
    </div>
  );
}
