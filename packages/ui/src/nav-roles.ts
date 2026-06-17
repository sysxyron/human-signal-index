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
  // Phase 41B.3 (C): Source Registry is researcher+ only — middleware/RLS gate the
  // page, so viewers must not see a menu item that leads to "Access requires a
  // higher role". Source management permissions are unchanged.
  '/dashboard/sources': ['researcher', 'reviewer', 'curator'],
  '/dashboard/signal-intake': ['researcher', 'reviewer'],
  '/dashboard/signal-submission': ['reviewer', 'curator'], // submission review queue (41B)
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
  '/dashboard/admin/organizations': ['admin'],
  '/dashboard/admin/plans': ['admin'],
  '/dashboard/admin/subscriptions': ['admin'],
  '/dashboard/admin/revenue': ['admin'],
  '/dashboard/admin/subscription-health': ['admin'],
  '/dashboard/admin/billing-ops': ['admin'],
  '/dashboard/admin/webhooks': ['admin'],
  '/dashboard/admin/site-ops': ['admin'],
  '/dashboard/admin/cms': ['admin'],
  '/dashboard/admin/site-settings': ['admin'],
  '/dashboard/admin/teams': ['admin'],
  '/dashboard/admin/applications': ['admin'],
  '/dashboard/admin/contribution-monitoring': ['admin'],
  '/dashboard/admin/trust-monitoring': ['admin'],
  '/dashboard/admin/outcome-monitoring': ['admin'],
  '/dashboard/admin/graph-explorer': ['admin'],
  '/dashboard/admin/graph-health': ['admin'],
  '/dashboard/admin/tester-ops': ['admin'],
  '/dashboard/admin/system-health': ['admin'],
  '/dashboard/admin/testers': ['admin'],
  '/dashboard/admin/access-logs': ['admin'],
  // System (admin)
  '/dashboard/security-monitor': ['admin'],
  '/dashboard/security': ['admin'],
  '/dashboard/settings': ['admin'],
  // -------------------------------------------------------------------------
  // Phase 41B.1 — role-experience hardening. Hide analysis / forecasting /
  // collective / trust / worldforge / public-report / beta-queue surfaces from
  // viewers (researcher+ unless noted). RBAC + RLS still gate the routes; this
  // only stops dead/permission-trap menus appearing in the viewer sidebar.
  // -------------------------------------------------------------------------
  // Intelligence (D)
  '/dashboard/rhetoric-classifier': ['researcher', 'reviewer', 'curator'],
  '/dashboard/risk-scoring': ['researcher', 'reviewer', 'curator'],
  '/dashboard/traceability-engine': ['researcher', 'reviewer', 'curator'],
  '/dashboard/alerts': ['researcher', 'reviewer', 'curator'],
  '/dashboard/public-reports': ['researcher', 'reviewer', 'curator'],
  // Forecasting (E)
  '/dashboard/forecasts': ['researcher', 'reviewer', 'curator'],
  '/dashboard/scenarios': ['researcher', 'reviewer', 'curator'],
  '/dashboard/warnings': ['researcher', 'reviewer', 'curator'],
  // Collective (F)
  '/dashboard/consensus': ['researcher', 'reviewer', 'curator'],
  '/dashboard/debates': ['researcher', 'reviewer', 'curator'],
  '/dashboard/contributors': ['researcher', 'reviewer', 'curator'],
  // Trust & Outcomes (G)
  '/dashboard/outcomes': ['researcher', 'reviewer', 'curator'],
  '/dashboard/trust': ['researcher', 'reviewer', 'curator'],
  '/dashboard/calibration': ['researcher', 'reviewer', 'curator'],
  // WorldForge (H) — approved research users only
  '/dashboard/worldforge': ['researcher', 'reviewer', 'curator'],
  '/dashboard/simulation': ['researcher', 'reviewer', 'curator'],
  '/dashboard/worldforge/simulations': ['researcher', 'reviewer', 'curator'],
  '/dashboard/worldforge/scenarios': ['researcher', 'reviewer', 'curator'],
  '/dashboard/worldforge/timelines': ['researcher', 'reviewer', 'curator'],
  '/dashboard/worldforge/dependency-graph': ['researcher', 'reviewer', 'curator'],
  '/dashboard/worldforge/counterfactuals': ['researcher', 'reviewer', 'curator'],
  '/dashboard/worldforge/provenance': ['researcher', 'reviewer', 'curator'],
  '/dashboard/worldforge/universes': ['researcher', 'reviewer', 'curator'],
  // Beta issues QUEUE — reviewer+/admin only (viewers report via Beta Tester) (C)
  '/dashboard/launch/issues': ['reviewer', 'curator'],
};

/**
 * The full dashboard menu inventory (every sidebar href). Kept here (server-safe,
 * no 'use client') so server components can count menus by role without importing
 * the client `dashboardNavGroups`. Keep in sync with navigation.tsx's sidebar.
 */
export const ALL_NAV_HREFS: string[] = [
  '/dashboard', '/dashboard/sources', '/submit-a-signal', '/dashboard/signal-intake', '/dashboard/signal-submission', '/dashboard/evidence-vault', '/dashboard/operations',
  '/dashboard/org', '/dashboard/org/members', '/dashboard/org/leaderboard', '/dashboard/org/analytics', '/dashboard/org/health', '/dashboard/org/settings', '/dashboard/org/branding', '/dashboard/org/billing', '/dashboard/org/create',
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
  '/dashboard/launch', '/dashboard/launch/issues', '/dashboard/tester', '/dashboard/tester-onboarding',
  '/dashboard/profile', '/dashboard/apply-role',
  '/dashboard/admin/users', '/dashboard/admin/organizations', '/dashboard/admin/plans', '/dashboard/admin/subscriptions', '/dashboard/admin/revenue', '/dashboard/admin/subscription-health', '/dashboard/admin/billing-ops', '/dashboard/admin/webhooks', '/dashboard/admin/site-ops', '/dashboard/admin/cms', '/dashboard/admin/site-settings', '/dashboard/admin/teams', '/dashboard/admin/applications', '/dashboard/admin/contribution-monitoring', '/dashboard/admin/trust-monitoring', '/dashboard/admin/outcome-monitoring', '/dashboard/admin/graph-explorer', '/dashboard/admin/graph-health', '/dashboard/admin/tester-ops', '/dashboard/admin/system-health', '/dashboard/admin/testers', '/dashboard/admin/access-logs',
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

// -----------------------------------------------------------------------------
// Phase 41B.1 — organization visibility is MEMBERSHIP-based, not role-based.
// Users with no org membership see no org pages (which would otherwise show
// "Could not load organization"); only "Create Organization" is offered when
// self-service creation is enabled.
// -----------------------------------------------------------------------------
export const ORG_CREATE_ROUTE = '/dashboard/org/create';
export const ORG_MEMBER_ROUTES = new Set<string>([
  '/dashboard/org',
  '/dashboard/org/members',
  '/dashboard/org/leaderboard',
  '/dashboard/org/analytics',
  '/dashboard/org/health',
  '/dashboard/org/settings',
  '/dashboard/org/branding',
  '/dashboard/org/billing',
]);

/** Context for membership-gated nav items. */
export interface NavContext {
  /** True when the signed-in user belongs to at least one organization. */
  orgMember?: boolean;
  /** True when self-service org creation is enabled (default true). */
  selfServeOrg?: boolean;
}

/** Whether a nav item is visible for a role + membership context. */
export function isNavItemVisible(href: string, role: string | null | undefined, ctx?: NavContext): boolean {
  if (!canSeeRoute(href, role)) return false;
  if (ORG_MEMBER_ROUTES.has(href)) return ctx?.orgMember === true;
  if (href === ORG_CREATE_ROUTE) return ctx?.orgMember !== true && ctx?.selfServeOrg !== false;
  return true;
}

interface NavItemLike { href: string }
interface NavGroupLike<I extends NavItemLike> { group: string; items: I[] }

/** Filter nav groups for a role + membership, dropping hidden items + empty groups. */
export function filterNavGroups<I extends NavItemLike, G extends NavGroupLike<I>>(
  groups: G[],
  role: string | null | undefined,
  ctx?: NavContext,
): G[] {
  return groups
    .map((g) => ({ ...g, items: g.items.filter((i) => isNavItemVisible(i.href, role, ctx)) }))
    .filter((g) => g.items.length > 0);
}

// -----------------------------------------------------------------------------
// Role progression (Phase 41B.1) — display-only guidance. Advancement is by
// APPROVAL via the role-application workflow; badges/XP never auto-grant a role.
//
// Phase 41B.3B: the PUBLIC ladder stops at Curator. Admin is an internal operator
// role assigned only through admin-controlled IAM — it never appears as a public
// advancement path and can never be applied for.
// -----------------------------------------------------------------------------
export const ROLE_LADDER = ['viewer', 'contributor', 'researcher', 'reviewer', 'curator'] as const;

/** Human label for a role (display indicator). */
export function roleLabel(role: string | null | undefined): string {
  if (!role) return 'Viewer';
  return role.charAt(0).toUpperCase() + role.slice(1);
}

/**
 * Phase 41B.3 (A) — public header state from auth. Anonymous visitors see a
 * Sign-in link + "Explore Dashboard"; authenticated visitors never see Sign in
 * and get a "Dashboard" action. PURE. (Auth is detected server-side.)
 */
export function publicHeaderState(authed: boolean): { showSignIn: boolean; dashboardLabel: string } {
  return { showSignIn: !authed, dashboardLabel: authed ? 'Dashboard' : 'Explore Dashboard' };
}

/** The next role a user could apply toward (null at the top / admin). */
export function nextRole(role: string | null | undefined): string | null {
  const r = (role ?? 'viewer').toLowerCase();
  const i = ROLE_LADDER.indexOf(r as (typeof ROLE_LADDER)[number]);
  if (i < 0 || i >= ROLE_LADDER.length - 1) return null;
  return ROLE_LADDER[i + 1];
}
