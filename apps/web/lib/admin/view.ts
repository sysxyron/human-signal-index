// =============================================================================
// HSI Phase 24B — IAM client-safe view helpers. NO server-only imports.
// Status colors + labeled demo builders so the admin console renders offline.
// =============================================================================

import type {
  AdminAccessLogsData, AdminTestersData, AdminTeamsData, AdminUsersData,
  InviteStats, UserStatus,
} from '@hsi/shared-types';

const DEMO_NOW = '2026-06-13T12:00:00.000Z';

const STATUS_COLOR: Record<string, string> = { pending: '#F59E0B', active: '#10B981', suspended: '#EF4444', disabled: '#94A3B8' };
export function statusColor(s?: string | null): string { return STATUS_COLOR[s ?? ''] ?? '#94A3B8'; }
export function statusLabel(s?: string | null): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Unknown';
}

const ROLE_RANK: Record<string, number> = { viewer: 0, researcher: 2, reviewer: 3, curator: 4, admin: 5 };
export function isAdminRole(role?: string | null): boolean {
  return role ? (ROLE_RANK[role.toLowerCase()] ?? -1) >= ROLE_RANK.admin : false;
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  return new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
}

export const ROLE_OPTIONS = ['viewer', 'researcher', 'reviewer', 'curator', 'admin'];
export const TEAM_OPTIONS = [
  { key: 'research', name: 'Research' }, { key: 'review', name: 'Review' }, { key: 'curation', name: 'Curation' },
  { key: 'governance', name: 'Governance' }, { key: 'executive', name: 'Executive' }, { key: 'security', name: 'Security' },
  { key: 'publishing', name: 'Publishing' }, { key: 'simulation', name: 'Simulation' },
];

/* -------------------------------------------------------------------------- */
/* DEMO builders                                                               */
/* -------------------------------------------------------------------------- */

export function demoAdminUsers(): AdminUsersData {
  const users = [
    { id: 'u-1', email: 'research@amenxlabs.com', name: 'Research Admin', status: 'active' as UserStatus, role: 'admin', roles: ['admin'], team: 'Executive', createdAt: '2026-05-01T09:00:00.000Z', lastLoginAt: DEMO_NOW },
    { id: 'u-2', email: 'alice@example.org', name: 'Alice Ng', status: 'active' as UserStatus, role: 'researcher', roles: ['researcher'], team: 'Research', createdAt: '2026-05-12T09:00:00.000Z', lastLoginAt: '2026-06-12T09:00:00.000Z' },
    { id: 'u-3', email: 'bob@example.org', name: 'Bob Park', status: 'pending' as UserStatus, role: 'reviewer', roles: ['reviewer'], team: 'Review', createdAt: '2026-06-13T08:00:00.000Z', lastLoginAt: null },
    { id: 'u-4', email: 'carol@example.org', name: 'Carol Diaz', status: 'suspended' as UserStatus, role: 'curator', roles: ['curator'], team: 'Curation', createdAt: '2026-04-20T09:00:00.000Z', lastLoginAt: '2026-06-01T09:00:00.000Z' },
  ];
  const counts = { total: users.length, active: 2, pending: 1, suspended: 1, disabled: 0 };
  return { users, roleOptions: ROLE_OPTIONS, teamOptions: TEAM_OPTIONS, counts };
}

export function demoAdminTeams(): AdminTeamsData {
  return {
    teams: [
      { id: 't-1', key: 'research', name: 'Research', description: 'Investigations and evidence collection.', members: [{ userId: 'u-2', email: 'alice@example.org', name: 'Alice Ng', teamRole: 'lead' }], memberCount: 1 },
      { id: 't-2', key: 'review', name: 'Review', description: 'Human review of findings.', members: [{ userId: 'u-3', email: 'bob@example.org', name: 'Bob Park', teamRole: 'member' }], memberCount: 1 },
      { id: 't-3', key: 'curation', name: 'Curation', description: 'Publication preparation.', members: [], memberCount: 0 },
    ],
    assignableUsers: [
      { id: 'u-2', email: 'alice@example.org', name: 'Alice Ng' },
      { id: 'u-3', email: 'bob@example.org', name: 'Bob Park' },
      { id: 'u-4', email: 'carol@example.org', name: 'Carol Diaz' },
    ],
  };
}

export function demoAdminTesters(): AdminTestersData {
  return {
    testers: [
      { id: 'u-2', name: 'Alice Ng', email: 'alice@example.org', role: 'researcher', team: 'Research', status: 'active', lastLoginAt: '2026-06-12T09:00:00.000Z', signalsCreated: 14, reviewsCompleted: 3, reportsSubmitted: 1, ready: true },
      { id: 'u-3', name: 'Bob Park', email: 'bob@example.org', role: 'reviewer', team: 'Review', status: 'pending', lastLoginAt: null, signalsCreated: 0, reviewsCompleted: 0, reportsSubmitted: 0, ready: false },
    ],
  };
}

export function demoAccessLogs(): AdminAccessLogsData {
  return {
    events: [
      { id: 'e-1', userId: 'u-1', email: 'research@amenxlabs.com', eventType: 'USER_INVITED', severity: 'info', route: '/dashboard/admin', message: 'Invited bob@example.org', createdAt: DEMO_NOW },
      { id: 'e-2', userId: 'u-1', email: 'research@amenxlabs.com', eventType: 'ROLE_ASSIGNED', severity: 'info', route: '/dashboard/admin', message: "Assigned role 'reviewer' on invite", createdAt: DEMO_NOW },
      { id: 'e-3', userId: 'u-1', email: 'research@amenxlabs.com', eventType: 'USER_SUSPENDED', severity: 'warning', route: '/dashboard/admin', message: 'Status active → suspended', createdAt: '2026-06-12T10:00:00.000Z' },
    ],
    eventTypes: ['USER_INVITED', 'ROLE_ASSIGNED', 'USER_SUSPENDED'],
  };
}

export function demoInviteStats(): InviteStats {
  return { totalTesters: 4, activeTesters: 2, pendingInvitations: 1, suspendedUsers: 1 };
}
