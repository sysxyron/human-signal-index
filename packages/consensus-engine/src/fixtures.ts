// =============================================================================
// @hsi/consensus-engine — deterministic offline fixtures + demo.
// =============================================================================

import { buildConsensusSnapshot, computeConsensus } from './consensus';
import type { ConsensusFinding } from './types';

export const FIXTURE_NOW = '2026-06-09T12:00:00.000Z';

/** A contested investigation: a strong leading position + two dissents. */
export const DEMO_FINDINGS: ConsensusFinding[] = [
  { id: 'f1', position: 'Earlier settlement', contributorId: 'c-ana', confidence: 0.82, evidenceStrength: 0.85, contributorTrust: 84, historicalAccuracy: 0.8, governanceStanding: 0.9, challengesRejected: 2, reviewsApproved: 3, endorsements: 4 },
  { id: 'f2', position: 'Earlier settlement', contributorId: 'c-ben', confidence: 0.78, evidenceStrength: 0.8, contributorTrust: 76, historicalAccuracy: 0.72, governanceStanding: 0.8, reviewsApproved: 1 },
  { id: 'f3', position: 'Earlier settlement', contributorId: 'c-cara', confidence: 0.7, evidenceStrength: 0.74, contributorTrust: 70, historicalAccuracy: 0.68 },
  { id: 'f4', position: 'Trade-driven growth', contributorId: 'c-dan', confidence: 0.66, evidenceStrength: 0.6, contributorTrust: 62, historicalAccuracy: 0.6, challengesUpheld: 1 },
  { id: 'f5', position: 'Climate displacement', contributorId: 'c-eve', confidence: 0.55, evidenceStrength: 0.45, contributorTrust: 50, historicalAccuracy: 0.5, challengesUpheld: 2, reviewsRejected: 1 },
];

/** Run the consensus chain offline for a UI/demo. Deterministic. */
export function consensusDemo(): {
  now: string;
  result: ReturnType<typeof computeConsensus>;
  snapshot: ReturnType<typeof buildConsensusSnapshot>;
} {
  const now = FIXTURE_NOW;
  return {
    now,
    result: computeConsensus(DEMO_FINDINGS),
    snapshot: buildConsensusSnapshot('inv-demo', DEMO_FINDINGS, { now }),
  };
}
