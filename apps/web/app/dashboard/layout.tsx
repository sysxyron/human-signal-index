'use client';

import { usePathname } from 'next/navigation';
import { DashboardSidebar } from '@hsi/ui';
import { AuthButton } from '@/components/auth/AuthButton';
import { NotificationCenter } from '@/components/governance/NotificationCenter';
import { AccountStatusBanner } from '@/components/admin/AccountStatusBanner';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar activeHref={pathname} />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Auth chrome: who you are + sign out, kept above the page's own TopNav
            so the existing per-page header stays intact. */}
        <div className="flex items-center justify-end gap-3 border-b border-border bg-background-deep/60 px-4 py-2">
          <NotificationCenter />
          <div className="w-full max-w-xs sm:w-auto sm:min-w-[180px]">
            <AuthButton />
          </div>
        </div>
        <AccountStatusBanner />
        {children}
      </div>
    </div>
  );
}
