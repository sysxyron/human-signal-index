// =============================================================================
// Deterministic demo data for OFFLINE tester views + tests. No randomness.
// =============================================================================

import type { AssignableMission, CohortAnalyticsInput, TesterStats } from './types';

export const demoMissions: AssignableMission[] = [
  { id: 'viewer_explore', role: 'viewer', title: 'Get oriented' },
  { id: 'contributor_build', role: 'viewer', title: 'Build your credibility' },
  { id: 'researcher_verify', role: 'researcher', title: 'Verify and investigate' },
  { id: 'reviewer_validate', role: 'reviewer', title: 'Validate the queue' },
];

export const demoCohortAnalytics: CohortAnalyticsInput = {
  total: 40, invited: 35, active: 22, completed: 6, activeLastPeriod: 18, missionsAssigned: 120, missionsCompleted: 74,
};

export const demoTesterStats: TesterStats = {
  issuesReported: 3, missionsCompleted: 11, signalsAccepted: 28, reviewsCompleted: 12, governanceActions: 2,
};

export const demoNps: number[] = [9, 10, 8, 7, 9, 6, 10, 9, 4, 8];
