// =============================================================================
// Cohorts + tester status lifecycle (Deliverables 2, 3). PURE.
// =============================================================================

import type { CohortDef, CohortKey, TesterStatus } from './types';

export const COHORTS: CohortDef[] = [
  { key: 'internal', name: 'Internal', description: 'HSI team + trusted insiders.' },
  { key: 'research', name: 'Research', description: 'Signal + investigation contributors.' },
  { key: 'reviewer', name: 'Reviewer', description: 'Evidence + investigation reviewers.' },
  { key: 'governance', name: 'Governance', description: 'Governance + publication oversight.' },
  { key: 'enterprise_pilot', name: 'Enterprise Pilot', description: 'Partner organisations evaluating HSI.' },
];

export function isCohortKey(s: string): s is CohortKey {
  return COHORTS.some((c) => c.key === s);
}

/** Allowed tester status transitions. */
export const STATUS_TRANSITIONS: Record<TesterStatus, TesterStatus[]> = {
  pending: ['invited', 'suspended'],
  invited: ['active', 'suspended'],
  active: ['completed', 'suspended'],
  suspended: ['active'],
  completed: [],
};

export function canTransitionStatus(from: TesterStatus, to: TesterStatus): boolean {
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

/** A tester is "engaged" (counts toward activation) when active or completed. */
export function isEngaged(status: TesterStatus): boolean {
  return status === 'active' || status === 'completed';
}
