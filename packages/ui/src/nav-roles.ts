// =============================================================================
// Role-aware navigation visibility (Phase 24D) — PURE.
//
// Decides which dashboard menu items a role SEES. This is UX ONLY — RBAC +
// middleware still protect every route; a hidden menu is never the security
// boundary. Admins see everything. Unrestricted items (not in the map) are
// visible to every signed-in role. Restricted items list the roles that see them.
//
// PURE: no React, no DOM, no imports — importable by navigation.tsx, by the app's
// profile/preview pages, and by tests.
// =============================================================================

export type NavRole = 'viewer' | 'researcher' | 'reviewer' | 'curator' | 'admin';

/**
 * Roles that SEE each RESTRICTED route (admin always sees all). Any route NOT in
 * this map is unrestricted and visible to every signed-in role (read-only/safe
 * dashboards: mission control, forecasts, trust, public reports, worldforge, …).
 *
 * The role set mirrors who can actually use the destination, so testers are not
 * shown menus that would only bounce them.
 */
export const NAV_VISIBILITY: Record<string, NavRole[]> = {
  // Operations
  '/dashboard/source-registry': ['reviewer', 'curator'],
  '/dashboard/signal-intake': ['researcher', 'reviewer'],
  '/dashboard/evidence-vault': ['researcher', 'reviewer', 'curator'],
  '/dashboard/operations': ['reviewer', 'curator'],
  // Intelligence
  '/dashboard/intelligence/operations': ['researcher', 'reviewer', 'curator'],
  '/dashboard/decisions/explorer': ['researcher', 'reviewer'],
  // Workflow
  '/dashboard/review': ['reviewer', 'curator'],
  '/dashboard/governance-queue': ['reviewer', 'curator'],
  '/dashboard/counter-narrative': ['reviewer', 'curator'],
  // Collective
  '/dashboard/investigations': ['researcher', 'reviewer'],
  '/dashboard/impact': ['researcher', 'reviewer', 'curator'],
  '/dashboard/lineage': ['researcher', 'reviewer', 'curator'],
  // Trust & Outcomes
  '/dashboard/governance': ['reviewer', 'curator'],
  // Publishing
  '/dashboard/publishing': ['curator'],
  '/dashboard/publishing/review': ['reviewer', 'curator'],
  '/dashboard/publishing/retractions': ['curator'],
  // Executive (leadership read surfaces)
  '/dashboard/executive': ['reviewer', 'curator'],
  '/dashboard/priorities': ['reviewer', 'curator'],
  '/dashboard/risks': ['reviewer', 'curator'],
  '/dashboard/opportunities': ['reviewer', 'curator'],
  '/dashboard/briefings': ['reviewer', 'curator'],
  '/dashboard/exec-governance': ['curator'],
  // Human Operations
  '/dashboard/operations-center': ['researcher', 'reviewer', 'curator'],
  '/dashboard/my-work': ['researcher', 'reviewer', 'curator'],
  '/dashboard/workloads': ['researcher', 'reviewer', 'curator'],
  '/dashboard/teams': ['researcher', 'reviewer', 'curator'],
  '/dashboard/operations-alerts': ['researcher', 'reviewer', 'curator'],
  '/dashboard/executive-operations': ['reviewer', 'curator'],
  '/dashboard/contributor-ops': ['researcher', 'reviewer', 'curator'],
  // Launch & Beta (admin operational)
  '/dashboard/launch': ['admin'],
  // Administration (admin IAM)
  '/dashboard/admin/users': ['admin'],
  '/dashboard/admin/cms': ['admin'],
  '/dashboard/admin/teams': ['admin'],
  '/dashboard/admin/applications': ['admin'],
  '/dashboard/admin/contribution-monitoring': ['admin'],
  '/dashboard/admin/trust-monitoring': ['admin'],
  '/dashboard/admin/outcome-monitoring': ['admin'],
  '/dashboard/admin/graph-explorer': ['admin'],
  '/dashboard/admin/graph-health': ['admin'],
  '/dashboard/admin/testers': ['admin'],
  '/dashboard/admin/access-logs': ['admin'],
  // System (admin)
  '/dashboard/security-monitor': ['admin'],
  '/dashboard/security': ['admin'],
  '/dashboard/settings': ['admin'],
};

/**
 * The full dashboard menu inventory (every sidebar href). Kept here (server-safe,
 * no 'use client') so server components can count menus by role without importing
 * the client `dashboardNavGroups`. Keep in sync with navigation.tsx's sidebar.
 */
export const ALL_NAV_HREFS: string[] = [
  '/dashboard', '/dashboard/source-registry', '/dashboard/signal-intake', '/dashboard/evidence-vault', '/dashboard/operations',
  '/dashboard/missions', '/dashboard/badges', '/dashboard/leaderboard', '/dashboard/authority',
  '/dashboard/rhetoric-classifier', '/dashboard/risk-scoring', '/dashboard/traceability-engine', '/dashboard/intelligence/operations', '/dashboard/decisions/explorer',
  '/dashboard/review', '/dashboard/governance-queue', '/dashboard/alerts', '/dashboard/counter-narrative', '/dashboard/public-reports',
  '/dashboard/forecasts', '/dashboard/scenarios', '/dashboard/warnings',
  '/dashboard/investigations', '/dashboard/impact', '/dashboard/lineage', '/dashboard/consensus', '/dashboard/debates', '/dashboard/contributors',
  '/dashboard/outcomes', '/dashboard/governance', '/dashboard/trust', '/dashboard/calibration',
  '/dashboard/publishing', '/dashboard/publishing/review', '/dashboard/publishing/retractions',
  '/dashboard/executive', '/dashboard/priorities', '/dashboard/risks', '/dashboard/opportunities', '/dashboard/briefings', '/dashboard/exec-governance',
  '/dashboard/worldforge', '/dashboard/simulation', '/dashboard/worldforge/simulations', '/dashboard/worldforge/scenarios', '/dashboard/worldforge/timelines', '/dashboard/worldforge/dependency-graph', '/dashboard/worldforge/counterfactuals', '/dashboard/worldforge/provenance', '/dashboard/worldforge/universes',
  '/dashboard/operations-center', '/dashboard/my-work', '/dashboard/workloads', '/dashboard/teams', '/dashboard/operations-alerts', '/dashboard/executive-operations', '/dashboard/contributor-ops',
  '/dashboard/launch', '/dashboard/launch/issues', '/dashboard/tester-onboarding',
  '/dashboard/profile',
  '/dashboard/admin/users', '/dashboard/admin/cms', '/dashboard/admin/teams', '/dashboard/admin/applications', '/dashboard/admin/contribution-monitoring', '/dashboard/admin/trust-monitoring', '/dashboard/admin/outcome-monitoring', '/dashboard/admin/graph-explorer', '/dashboard/admin/graph-health', '/dashboard/admin/testers', '/dashboard/admin/access-logs',
  '/dashboard/security-monitor', '/dashboard/security', '/dashboard/settings',
];

/** Whether `role` should SEE the menu item for `href`. Admin sees all. */
export function canSeeRoute(href: string, role: string | null | undefined): boolean {
  if (role === 'admin') return true;
  const allowed = NAV_VISIBILITY[href];
  if (!allowed) return true; // unrestricted → visible to all signed-in roles
  if (!role) return false; // restricted route, unknown role → hide (RBAC still gates)
  return (allowed as string[]).includes(role);
}

/** Is `href` a restricted (role-gated) menu item? */
export function isRestrictedRoute(href: string): boolean {
  return href in NAV_VISIBILITY;
}

interface NavItemLike { href: string }
interface NavGroupLike<I extends NavItemLike> { group: string; items: I[] }

/** Filter nav groups for a role, dropping items the role can't see + empty groups. */
export function filterNavGroups<I extends NavItemLike, G extends NavGroupLike<I>>(
  groups: G[],
  role: string | null | undefined,
): G[] {
  return groups
    .map((g) => ({ ...g, items: g.items.filter((i) => canSeeRoute(i.href, role)) }))
    .filter((g) => g.items.length > 0);
}
