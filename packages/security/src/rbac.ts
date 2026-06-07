// =============================================================================
// @hsi/security — RBAC
// Roles: admin > reviewer > viewer. canAccess() enforces a minimum role rank.
// =============================================================================

export const roles = {
  admin: 'admin',
  reviewer: 'reviewer',
  viewer: 'viewer',
} as const;

export type RoleName = keyof typeof roles;

const RANK: Record<RoleName, number> = { admin: 3, reviewer: 2, viewer: 1 };

/** True when userRole's rank is >= the required role's rank. */
export function canAccess(userRole: string, requiredRole: RoleName): boolean {
  const userRank = RANK[userRole as RoleName] ?? 0;
  return userRank >= RANK[requiredRole];
}

/** Capability helpers for the most common gates. */
export const can = {
  publish: (role: string) => canAccess(role, 'admin'),
  review: (role: string) => canAccess(role, 'reviewer'),
  view: (role: string) => canAccess(role, 'viewer'),
};
