// =============================================================================
// RBAC pure predicates + the protected-route map — PURE.
//
// The single source of truth for "which app role is required where". These are
// PURE guards: they take a role string (e.g. the value returned by the server's
// getSessionRole()) and return a decision. The server wrapper that actually READS
// the session lives elsewhere (lib/supabase/server.ts) and is NOT imported here.
//
// ROLE LADDER (ascending; confirmed against the DAL + server.ts comments):
//   viewer (1) < researcher (2) < reviewer (3) < curator (4) < admin (5)
//
// PURITY: no imports at all. No next/*, no Supabase, no Date.now()/Math.random().
// =============================================================================

export type AppRole = 'viewer' | 'researcher' | 'reviewer' | 'curator' | 'admin';

/** Ascending privilege rank. Higher number = more privilege. */
export const ROLE_RANK: Record<AppRole, number> = {
  viewer: 1,
  researcher: 2,
  reviewer: 3,
  curator: 4,
  admin: 5,
};

function rankOf(role: string | undefined): number {
  if (role && role in ROLE_RANK) return ROLE_RANK[role as AppRole];
  return 0; // unknown / anonymous — below viewer.
}

/** True when `role` meets or exceeds `required` on the ladder. */
export function hasRole(role: string | undefined, required: AppRole): boolean {
  return rankOf(role) >= ROLE_RANK[required];
}

/** True when `role` satisfies AT LEAST ONE of the required roles (min rank). */
export function hasAnyRole(role: string | undefined, required: AppRole[]): boolean {
  if (required.length === 0) return false;
  const min = Math.min(...required.map((r) => ROLE_RANK[r]));
  return rankOf(role) >= min;
}

export interface RoleDecision {
  allowed: boolean;
  reason?: string;
}

/** PURE predicate factory: requires `required` or higher. */
export function requireRole(required: AppRole): (role: string | undefined) => RoleDecision {
  return (role: string | undefined): RoleDecision => {
    if (hasRole(role, required)) return { allowed: true };
    return {
      allowed: false,
      reason: `Requires ${required} role or higher (have: ${role ?? 'none'}).`,
    };
  };
}

/** PURE predicate factory: requires ANY of the given roles (lowest min rank). */
export function requireAnyRole(required: AppRole[]): (role: string | undefined) => RoleDecision {
  return (role: string | undefined): RoleDecision => {
    if (hasAnyRole(role, required)) return { allowed: true };
    return {
      allowed: false,
      reason: `Requires one of [${required.join(', ')}] (have: ${role ?? 'none'}).`,
    };
  };
}

export interface ProtectedRoute {
  pattern: string;
  minRole: AppRole;
}

// The protected-route map. `pattern` is a path PREFIX. Longest-prefix wins in
// requiredRoleForRoute so a more specific rule overrides a broader one.
//
// Rationale (consistent with prior phases' DAL gates):
//   - admin           : security monitoring + settings/admin surfaces.
//   - curator         : publication actions (publish) + dead-letter requeue.
//   - reviewer        : review queues, curation review, source registry/ops.
//   - researcher      : decision/simulation analysis + intelligence writes.
//   - (worldforge is intentionally PUBLIC for reads — not listed here.)
export const PROTECTED_ROUTES: ProtectedRoute[] = [
  // --- admin ---
  { pattern: '/dashboard/security-monitor', minRole: 'admin' },
  { pattern: '/dashboard/security', minRole: 'admin' },
  { pattern: '/dashboard/admin', minRole: 'admin' },
  { pattern: '/dashboard/settings', minRole: 'admin' },
  // Phase 60 — Beta Launch operations console (admin-only).
  { pattern: '/dashboard/beta-launch', minRole: 'admin' },
  // Launch Operations Center is admin-only…
  { pattern: '/dashboard/launch', minRole: 'admin' },
  // …but the beta issue reporter (a longer prefix → wins) is open to ANY signed-in
  // tester so all roles can file reports.
  { pattern: '/dashboard/launch/issues', minRole: 'viewer' },

  // --- curator (publication actions) ---
  { pattern: '/dashboard/publications', minRole: 'curator' },
  { pattern: '/dashboard/curation/publish', minRole: 'curator' },
  { pattern: '/dashboard/operations/dead-letter', minRole: 'curator' },

  // --- reviewer (review + curation + source monitoring/ops) ---
  { pattern: '/dashboard/review-queue', minRole: 'reviewer' },
  { pattern: '/dashboard/review', minRole: 'reviewer' },
  { pattern: '/dashboard/curation', minRole: 'reviewer' },
  { pattern: '/dashboard/sources', minRole: 'reviewer' },
  { pattern: '/dashboard/source-registry', minRole: 'reviewer' },
  // Phase 61 — source reliability & crawl observability (read-only).
  { pattern: '/dashboard/source-reliability', minRole: 'reviewer' },
  // Phase 63 — automated source monitoring (reviewer+ read; admin run).
  { pattern: '/dashboard/source-monitoring', minRole: 'reviewer' },
  // Phase 64 — evidence graph (reviewer+ read; admin manage).
  { pattern: '/dashboard/evidence-graph', minRole: 'reviewer' },
  { pattern: '/dashboard/operations', minRole: 'reviewer' },
  // Phase 25 — governance queue (escalated/sensitive investigations).
  { pattern: '/dashboard/governance-queue', minRole: 'reviewer' },

  // --- researcher (decision / simulation / intelligence writes) ---
  { pattern: '/dashboard/intelligence/decisions', minRole: 'researcher' },
  { pattern: '/dashboard/intelligence/impacts', minRole: 'researcher' },
  { pattern: '/dashboard/decisions', minRole: 'researcher' },
  { pattern: '/dashboard/simulation', minRole: 'researcher' },
  // Phase 56.1 — close audit finding R1: these read-only intelligence surfaces
  // were reachable by any signed-in user (incl. viewer/contributor). Gate to
  // researcher+ so middleware enforcement matches the nav visibility intent.
  { pattern: '/dashboard/forecasting', minRole: 'researcher' },
  { pattern: '/dashboard/watchlists', minRole: 'researcher' },
  { pattern: '/dashboard/signal-intake', minRole: 'researcher' },
  // --- researcher (Phase 24 human-operations dashboards). Explicit entries for
  // operations-center / operations-alerts override the broader
  // '/dashboard/operations' (reviewer) prefix via longest-prefix-wins. ---
  { pattern: '/dashboard/operations-center', minRole: 'researcher' },
  { pattern: '/dashboard/operations-alerts', minRole: 'researcher' },
  { pattern: '/dashboard/workloads', minRole: 'researcher' },
  { pattern: '/dashboard/my-work', minRole: 'researcher' },
  { pattern: '/dashboard/teams', minRole: 'researcher' },
  { pattern: '/dashboard/contributor-ops', minRole: 'researcher' },
  { pattern: '/dashboard/executive-operations', minRole: 'researcher' },
  // Phase 25 — investigation workflow detail (claim/work/review surface).
  { pattern: '/dashboard/investigations/workflow', minRole: 'researcher' },
];

/**
 * The minimum role required for `path`, or null when the path is not protected
 * by this map (i.e. a signed-in viewer is enough, or it is a public route).
 * Longest matching prefix wins, so /dashboard/curation/publish (curator)
 * overrides /dashboard/curation (reviewer).
 */
export function requiredRoleForRoute(path: string): AppRole | null {
  let best: ProtectedRoute | null = null;
  for (const route of PROTECTED_ROUTES) {
    if (path === route.pattern || path.startsWith(`${route.pattern}/`) || path.startsWith(route.pattern)) {
      if (!best || route.pattern.length > best.pattern.length) best = route;
    }
  }
  return best ? best.minRole : null;
}

export interface RouteAccessAudit {
  allowed: boolean;
  minRole?: AppRole;
  reason?: string;
}

/**
 * Audit whether `role` may access `path`. Unprotected paths are allowed for any
 * (signed-in) role. Deterministic.
 */
export function auditRouteAccess(path: string, role: string | undefined): RouteAccessAudit {
  const minRole = requiredRoleForRoute(path);
  if (minRole === null) return { allowed: true };
  if (hasRole(role, minRole)) return { allowed: true, minRole };
  return {
    allowed: false,
    minRole,
    reason: `${path} requires ${minRole} role or higher (have: ${role ?? 'none'}).`,
  };
}

export interface AuditedRoute {
  route: string;
  minRole: AppRole;
}

/** The full protected-route map for the RBAC audit view. */
export function auditProtectedRoutes(): AuditedRoute[] {
  return PROTECTED_ROUTES.map((r) => ({ route: r.pattern, minRole: r.minRole }));
}
