'use server';

// =============================================================================
// HSI Phase 24B — IAM server actions. 'use server'. Admin-only (enforced in the
// DAL). Reads + governed writes (invite, status, role, team). Revalidate the
// admin consoles. NEVER throw; NEVER expose the service-role key.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { listUsers, getInviteStats, inviteUser, setUserStatus, getMyStatus } from './users';
import { listRoles, assignRole } from './roles';
import { listAdminTeams, addTeamMember, removeTeamMember, assignTeamLead } from './teams';
import { listTesters } from './testers';
import { listAccessLogs, type AccessLogFilters } from './access-logs';
import type { DbResult } from './guard';
import type { UserStatus } from '@hsi/shared-types';

const PATHS = ['/dashboard/admin/users', '/dashboard/admin/teams', '/dashboard/admin/testers', '/dashboard/admin/access-logs', '/dashboard/launch'];
function revalidate(): void {
  for (const p of PATHS) { try { revalidatePath(p); } catch { /* best-effort */ } }
}

// ---- reads ------------------------------------------------------------------
export async function listUsersAction() { return listUsers(); }
export async function listRolesAction() { return listRoles(); }
export async function listAdminTeamsAction() { return listAdminTeams(); }
export async function listTestersAction() { return listTesters(); }
export async function listAccessLogsAction(filters?: AccessLogFilters) { return listAccessLogs(filters); }
export async function getInviteStatsAction() { return getInviteStats(); }
export async function getMyStatusAction() { return getMyStatus(); }

// ---- writes (admin-only, audited) ------------------------------------------
export async function inviteUserAction(input: { email: string; role: string; team?: string; message?: string }): Promise<DbResult<{ userId: string; email: string }>> {
  const r = await inviteUser(input);
  if (r.ok) revalidate();
  return r;
}
export async function setUserStatusAction(userId: string, status: UserStatus): Promise<DbResult<{ userId: string; status: UserStatus }>> {
  const r = await setUserStatus(userId, status);
  if (r.ok) revalidate();
  return r;
}
export async function assignRoleAction(userId: string, role: string): Promise<DbResult<{ userId: string; role: string }>> {
  const r = await assignRole(userId, role);
  if (r.ok) revalidate();
  return r;
}
export async function addTeamMemberAction(teamId: string, userId: string): Promise<DbResult<{ teamId: string; userId: string }>> {
  const r = await addTeamMember(teamId, userId);
  if (r.ok) revalidate();
  return r;
}
export async function removeTeamMemberAction(teamId: string, userId: string): Promise<DbResult<{ teamId: string; userId: string }>> {
  const r = await removeTeamMember(teamId, userId);
  if (r.ok) revalidate();
  return r;
}
export async function assignTeamLeadAction(teamId: string, userId: string): Promise<DbResult<{ teamId: string; userId: string }>> {
  const r = await assignTeamLead(teamId, userId);
  if (r.ok) revalidate();
  return r;
}

export type { DbResult, DbResultCode } from './guard';
