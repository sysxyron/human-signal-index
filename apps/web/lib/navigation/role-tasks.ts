// =============================================================================
// HSI Phase 24D — role tasks, permission summaries & access explanations. PURE.
//
// The canonical "what should I do?" content per role, plus a plain-English
// explanation of what each role can and cannot do. Used by the dashboard role
// task cards and the profile page. No React, no I/O — fully testable.
// =============================================================================

export type Role = 'viewer' | 'researcher' | 'reviewer' | 'curator' | 'admin';

export const ROLES: Role[] = ['viewer', 'researcher', 'reviewer', 'curator', 'admin'];

export interface RoleTask {
  label: string;
  href: string;
}

/** Clear next steps per role (links point at real, role-accessible routes). */
export const ROLE_TASKS: Record<Role, RoleTask[]> = {
  viewer: [
    { label: 'Explore public reports', href: '/dashboard/public-reports' },
    { label: 'Review evidence trails', href: '/dashboard/traceability-engine' },
    { label: 'Read trust information', href: '/dashboard/trust' },
    { label: 'Share feedback (beta issues)', href: '/dashboard/launch/issues' },
  ],
  researcher: [
    { label: 'Submit signals', href: '/dashboard/signal-intake' },
    { label: 'Add evidence', href: '/dashboard/evidence-vault' },
    { label: 'Start investigations', href: '/dashboard/investigations' },
    { label: 'Update assigned work', href: '/dashboard/my-work' },
  ],
  reviewer: [
    { label: 'Review queued items', href: '/dashboard/review' },
    { label: 'Validate evidence', href: '/dashboard/evidence-vault' },
    { label: 'Record review decisions', href: '/dashboard/review' },
    { label: 'Escalate unclear cases', href: '/dashboard/operations-alerts' },
  ],
  curator: [
    { label: 'Prepare public reports', href: '/dashboard/publishing/new' },
    { label: 'Review publication readiness', href: '/dashboard/publishing/review' },
    { label: 'Manage drafts', href: '/dashboard/publishing' },
    { label: 'Check retractions & revisions', href: '/dashboard/publishing/retractions' },
  ],
  admin: [
    { label: 'Invite users', href: '/dashboard/admin/users' },
    { label: 'Approve users', href: '/dashboard/admin/users' },
    { label: 'Assign roles & teams', href: '/dashboard/admin/teams' },
    { label: 'Review access logs', href: '/dashboard/admin/access-logs' },
    { label: 'Monitor launch readiness', href: '/dashboard/launch' },
  ],
};

/** One-line "what this role can / cannot do" — shown on the profile page. */
export const ROLE_SUMMARY: Record<Role, string> = {
  viewer:
    'Viewer accounts can read approved reports, evidence trails, and trust information, and file beta feedback — but cannot submit, review, approve, or publish content.',
  researcher:
    'Researcher accounts can submit signals, add evidence, run investigations, and update their assigned work — in addition to everything a viewer can read. They cannot review, approve, or publish.',
  reviewer:
    'Reviewer accounts can review queued items, validate evidence, record decisions, and escalate cases — plus all researcher and viewer access. They cannot publish reports or manage users.',
  curator:
    'Curator accounts can prepare and review publications, manage drafts, and handle retractions — plus reviewer access. Publishing remains human-approved; they cannot manage users or security.',
  admin:
    'Administrator accounts have full access: invite and approve users, assign roles and teams, review access logs, monitor launch readiness, and reach every dashboard.',
};

export const ROLE_LABEL: Record<Role, string> = {
  viewer: 'Viewer', researcher: 'Researcher', reviewer: 'Reviewer', curator: 'Curator', admin: 'Administrator',
};

export function isRole(value: string | null | undefined): value is Role {
  return value === 'viewer' || value === 'researcher' || value === 'reviewer' || value === 'curator' || value === 'admin';
}

/** Tasks for a role, defaulting to the viewer set for unknown/missing roles. */
export function tasksForRole(role: string | null | undefined): RoleTask[] {
  return isRole(role) ? ROLE_TASKS[role] : ROLE_TASKS.viewer;
}

export function summaryForRole(role: string | null | undefined): string {
  return isRole(role) ? ROLE_SUMMARY[role] : ROLE_SUMMARY.viewer;
}
