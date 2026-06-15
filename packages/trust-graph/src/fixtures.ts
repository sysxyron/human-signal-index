// =============================================================================
// Deterministic demo fixtures for OFFLINE trust views + tests. No randomness.
// =============================================================================

import type { TrustInputs } from './types';

export const NEUTRAL_INPUTS: TrustInputs = {
  signalsSubmitted: 0, signalsAccepted: 0, signalsRejected: 0,
  reviewAgreements: 0, reviewDisagreements: 0,
  publicationsApproved: 0, publicationsRejected: 0, publicationTraceability: 0, governanceApprovalRate: 0,
  investigationsCompleted: 0, investigationsAbandoned: 0, overdueAssignments: 0, activeWindows: 0, totalWindows: 0,
};

export const demoHighTrust: TrustInputs = {
  signalsSubmitted: 80, signalsAccepted: 70, signalsRejected: 10,
  reviewAgreements: 45, reviewDisagreements: 5,
  publicationsApproved: 9, publicationsRejected: 1, publicationTraceability: 0.9, governanceApprovalRate: 0.85,
  investigationsCompleted: 12, investigationsAbandoned: 1, overdueAssignments: 0, activeWindows: 11, totalWindows: 12,
};

export const demoLowTrust: TrustInputs = {
  signalsSubmitted: 60, signalsAccepted: 12, signalsRejected: 48,
  reviewAgreements: 6, reviewDisagreements: 24,
  publicationsApproved: 1, publicationsRejected: 6, publicationTraceability: 0.3, governanceApprovalRate: 0.2,
  investigationsCompleted: 2, investigationsAbandoned: 9, overdueAssignments: 6, activeWindows: 3, totalWindows: 12,
};

export interface DemoContributorTrust { id: string; name: string; team: string; inputs: TrustInputs }
export const demoContributorTrust: DemoContributorTrust[] = [
  { id: 'u1', name: 'Ada Lin', team: 'Research', inputs: demoHighTrust },
  { id: 'u2', name: 'Marco Reyes', team: 'Review', inputs: { ...demoHighTrust, signalsSubmitted: 20, signalsAccepted: 16, signalsRejected: 4, reviewAgreements: 90, reviewDisagreements: 4 } },
  { id: 'u3', name: 'Priya Shah', team: 'Governance', inputs: { ...demoHighTrust, publicationsApproved: 14, publicationTraceability: 0.95 } },
  { id: 'u4', name: 'Sam Okoye', team: 'Research', inputs: demoLowTrust },
];
