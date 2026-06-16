'use client';

// =============================================================================
// HSI Phase 24D — client wrapper around the role-aware DashboardSidebar.
//
// Needs usePathname() for the active link, so it must be a client component; the
// server layout resolves the user's role and passes it in. Role-aware menus are
// UX only — RBAC + middleware still protect every route.
// =============================================================================

import { usePathname } from 'next/navigation';
import { DashboardSidebar } from '@hsi/ui';

export function DashboardSidebarClient({
  role,
  orgMember,
}: {
  role: string | null;
  /** Phase 41B.1: hide org pages for users with no org membership. */
  orgMember?: boolean;
}) {
  const pathname = usePathname();
  return <DashboardSidebar activeHref={pathname} role={role} orgMember={orgMember} />;
}
