// =============================================================================
// Missions — weekly, role-scoped task sets that give contributors PURPOSE.
// missionView() computes progress + status purely from counts. Reward (XP +
// credits) is granted by the worker only when a mission is completed + claimed.
// =============================================================================

import type {
  ContributorRole, MissionProgressInput, MissionStatus, MissionTemplate, MissionView,
} from './types';

/** Weekly mission templates by role (Phase 25 spec). */
export const MISSION_TEMPLATES: MissionTemplate[] = [
  // Viewer
  { id: 'viewer_explore', role: 'viewer', title: 'Get oriented', xpReward: 30, creditReward: 5, steps: [
    { key: 'signals', label: 'Submit 3 signals', target: 3 },
    { key: 'follow', label: 'Follow 2 investigations', target: 2 },
    { key: 'trails', label: 'Review 3 evidence trails', target: 3 },
  ] },
  // Contributor (viewer-path rank; reuses viewer role for RBAC)
  { id: 'contributor_build', role: 'viewer', title: 'Build your credibility', xpReward: 60, creditReward: 10, steps: [
    { key: 'signals', label: 'Submit 5 signals', target: 5 },
    { key: 'sources', label: 'Submit 3 sources', target: 3 },
    { key: 'profile', label: 'Complete profile credibility section', target: 1 },
  ] },
  // Researcher
  { id: 'researcher_verify', role: 'researcher', title: 'Verify and investigate', xpReward: 120, creditReward: 20, steps: [
    { key: 'sources', label: 'Verify 10 sources', target: 10 },
    { key: 'evidence', label: 'Create 3 evidence packages', target: 3 },
    { key: 'investigation', label: 'Start 1 investigation', target: 1 },
  ] },
  // Reviewer
  { id: 'reviewer_validate', role: 'reviewer', title: 'Validate the queue', xpReward: 140, creditReward: 24, steps: [
    { key: 'reviews', label: 'Review 20 submissions', target: 20 },
    { key: 'evidence', label: 'Validate 5 evidence packages', target: 5 },
    { key: 'escalate', label: 'Escalate unclear cases', target: 1 },
  ] },
  // Curator
  { id: 'curator_publish', role: 'curator', title: 'Prepare publications', xpReward: 160, creditReward: 28, steps: [
    { key: 'reports', label: 'Prepare 2 reports', target: 2 },
    { key: 'drafts', label: 'Review 3 publication drafts', target: 3 },
    { key: 'retraction', label: 'Check retraction queue', target: 1 },
  ] },
  // Admin
  { id: 'admin_govern', role: 'admin', title: 'Steward the network', xpReward: 100, creditReward: 0, steps: [
    { key: 'applications', label: 'Review role applications', target: 1 },
    { key: 'approvals', label: 'Approve pending users', target: 1 },
    { key: 'audit', label: 'Audit access logs', target: 1 },
    { key: 'blockers', label: 'Review launch blockers', target: 1 },
  ] },
];

export function missionsForRole(role: ContributorRole | string | null | undefined): MissionTemplate[] {
  const r = (role ?? 'viewer') as ContributorRole;
  return MISSION_TEMPLATES.filter((m) => m.role === r);
}

export function missionTemplate(id: string): MissionTemplate | undefined {
  return MISSION_TEMPLATES.find((m) => m.id === id);
}

/** Compute the live view (steps done, percent, status) for one mission. Pure. */
export function missionView(input: MissionProgressInput): MissionView {
  const { template, progress, claimed, expiredAt, now } = input;
  const steps = template.steps.map((s) => {
    const done = Math.max(0, Math.min(s.target, progress[s.key] ?? 0));
    return { ...s, done, complete: done >= s.target };
  });
  const totalTarget = steps.reduce((n, s) => n + s.target, 0);
  const totalDone = steps.reduce((n, s) => n + s.done, 0);
  const percent = totalTarget === 0 ? 0 : Math.round((totalDone / totalTarget) * 100);
  const allComplete = steps.every((s) => s.complete);

  let status: MissionStatus;
  if (claimed) status = 'claimed';
  else if (allComplete) status = 'completed';
  else if (expiredAt && Date.parse(expiredAt) <= Date.parse(now)) status = 'expired';
  else if (totalDone > 0) status = 'in_progress';
  else status = 'not_started';

  return {
    id: template.id,
    title: template.title,
    role: template.role,
    steps,
    percent,
    status,
    xpReward: template.xpReward,
    creditReward: template.creditReward,
  };
}

/** A mission can be CLAIMED for reward only when completed and not already claimed/expired. */
export function isClaimable(view: MissionView): boolean {
  return view.status === 'completed';
}
