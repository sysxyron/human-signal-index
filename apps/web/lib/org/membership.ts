// =============================================================================
// HSI Phase 35 — organization membership model. PURE (no DB, no 'use server').
//
// membership_role is ORG-SCOPED — it governs what a user can do WITHIN an
// organization (manage members, edit the org). It is NEVER global RBAC: a user's
// platform role (viewer..admin) is unchanged by org membership. Tenant isolation
// helpers here are pure (testable); the DB enforces them via RESTRICTIVE RLS.
// =============================================================================

export type MembershipRole = 'owner' | 'administrator' | 'reviewer' | 'researcher' | 'contributor' | 'tester';

export const MEMBERSHIP_ROLES: MembershipRole[] = ['owner', 'administrator', 'reviewer', 'researcher', 'contributor', 'tester'];

/** Higher = more authority WITHIN the org (not a platform privilege). */
export const MEMBERSHIP_RANK: Record<MembershipRole, number> = {
  owner: 6, administrator: 5, reviewer: 4, researcher: 3, contributor: 2, tester: 1,
};

export const MEMBERSHIP_LABEL: Record<MembershipRole, string> = {
  owner: 'Owner', administrator: 'Administrator', reviewer: 'Reviewer', researcher: 'Researcher', contributor: 'Contributor', tester: 'Tester',
};

export function isMembershipRole(s: string | null | undefined): s is MembershipRole {
  return typeof s === 'string' && (MEMBERSHIP_ROLES as string[]).includes(s);
}

/** Can this membership role manage members / the org? Owner + administrator only. */
export function canManageMembers(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'administrator';
}
export const canManageOrg = canManageMembers;

/** Highest membership role from a list (e.g. when a user has multiple rows). */
export function highestMembership(roles: string[]): MembershipRole | null {
  let best: MembershipRole | null = null;
  for (const r of roles) {
    if (isMembershipRole(r) && (!best || MEMBERSHIP_RANK[r] > MEMBERSHIP_RANK[best])) best = r;
  }
  return best;
}

/** An owner cannot be removed if they are the only owner (org must keep an owner). */
export function canRemoveMember(targetRole: string, ownerCount: number): boolean {
  if (targetRole === 'owner') return ownerCount > 1;
  return true;
}

// ---- pure tenant isolation (mirrors the DB RESTRICTIVE RLS, for tests/DAL) ----
export interface OrgScoped { organization_id?: string | null }

/** Records the user may see: same-org OR global (null org) OR platform admin. PURE. */
export function scopeToOrg<T extends OrgScoped>(records: T[], orgId: string, opts?: { platformAdmin?: boolean }): T[] {
  if (opts?.platformAdmin) return records;
  return records.filter((r) => !r.organization_id || r.organization_id === orgId);
}

/** True if a record is visible in `orgId` (or global / to a platform admin). PURE. */
export function isVisibleInOrg(record: OrgScoped, orgId: string, platformAdmin = false): boolean {
  return platformAdmin || !record.organization_id || record.organization_id === orgId;
}
