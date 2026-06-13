// =============================================================================
// RBAC — the canonical authorization surface (Phase 22A).
//
// One import for everything authorization. Composes:
//   * the PURE ladder + protected-route map  (./rbac-audit)
//   * the canonical DB role resolver         (../auth/get-session-role)
//
// Use THIS module from new code so every authorization decision flows through the
// same source of truth: identity from the JWT, role from public.user_roles → roles.
//
// Ladder (ascending): viewer < researcher < reviewer < curator < admin.
// admin inherits every lower role.
// =============================================================================

export {
  ROLE_RANK,
  hasRole,
  hasAnyRole,
  requireRole,
  requireAnyRole,
  requiredRoleForRoute,
  auditRouteAccess,
  PROTECTED_ROUTES,
  type AppRole,
  type RoleDecision,
  type ProtectedRoute,
  type RouteAccessAudit,
} from './rbac-audit';

export {
  getSessionRole,
  getSessionRoleFrom,
  loadUserRoles,
  loadHighestRole,
  highestRole,
  type SessionRole,
} from '../auth/get-session-role';

import { hasRole as hasRolePure, hasAnyRole as hasAnyRolePure, type AppRole } from './rbac-audit';
import type { SessionRole } from '../auth/get-session-role';

/** Session-aware: does this resolved session satisfy `required` (or higher)? */
export function sessionHasRole(session: SessionRole, required: AppRole): boolean {
  return hasRolePure(session.highestRole ?? undefined, required);
}

/** Session-aware: does this session satisfy AT LEAST ONE of `required`? */
export function sessionHasAnyRole(session: SessionRole, required: AppRole[]): boolean {
  return hasAnyRolePure(session.highestRole ?? undefined, required);
}
