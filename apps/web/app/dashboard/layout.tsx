// =============================================================================
// Dashboard layout (Server Component). Resolves the signed-in user's role
// server-side (canonical user_roles → roles) so the sidebar can render only the
// menus relevant to that role — UX only; RBAC + middleware still protect every
// route. The active-link highlighting lives in the client sidebar wrapper.
// =============================================================================

import { getSessionRole } from '@/lib/supabase/server';
import { DashboardSidebarClient } from '@/components/navigation/DashboardSidebarClient';
import { AuthButton } from '@/components/auth/AuthButton';
import { NotificationCenter } from '@/components/governance/NotificationCenter';
import { AccountStatusBanner } from '@/components/admin/AccountStatusBanner';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const role = await getSessionRole();
  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebarClient role={role} />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Auth chrome: who you are + sign out, kept above the page's own TopNav. */}
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
