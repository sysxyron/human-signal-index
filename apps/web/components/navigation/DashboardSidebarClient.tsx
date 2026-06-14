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

export function DashboardSidebarClient({ role }: { role: string | null }) {
  const pathname = usePathname();
  return <DashboardSidebar activeHref={pathname} role={role} />;
}
