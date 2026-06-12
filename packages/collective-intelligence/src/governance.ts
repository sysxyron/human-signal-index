// =============================================================================
// @hsi/collective-intelligence — GOVERNANCE review of a forming consensus.
//
// approveConsensus / rejectConsensus / escalateConsensus / archiveConsensus record
// a HUMAN governance decision over a consensus snapshot. Each REQUIRES a reviewer
// + reason (throws ConsensusGovernanceError otherwise) and produces a ConsensusReview
// with the resulting investigation state. NEVER auto-approves, NEVER auto-publishes,
// NEVER auto-consensus. Pure; the caller persists the review + transitions the
// investigation.
//
//   approved  → CONSENSUS_FORMING (cleared to proceed toward publication)
//   rejected  → UNDER_REVIEW       (sent back for more work)
//   escalated → UNDER_REVIEW       (needs senior attention; stays in review)
//   archived  → ARCHIVED           (investigation closed)
// =============================================================================

import type {
  ConsensusDecision,
  ConsensusReview,
  InvestigationState,
} from './types';
import type { ConsensusSnapshot } from '@hsi/consensus-engine';

export class ConsensusGovernanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConsensusGovernanceError';
  }
}

const RESULTING_STATE: Record<ConsensusDecision, InvestigationState> = {
  approved: 'CONSENSUS_FORMING',
  rejected: 'UNDER_REVIEW',
  escalated: 'UNDER_REVIEW',
  archived: 'ARCHIVED',
};

function decide(
  snapshot: ConsensusSnapshot,
  decision: ConsensusDecision,
  input: { reviewer: string; reason: string },
  opts: { now: string },
): ConsensusReview {
  if (!input.reviewer || input.reviewer.trim().length === 0) {
    throw new ConsensusGovernanceError('A consensus decision requires an identified reviewer.');
  }
  if (!input.reason || input.reason.trim().length === 0) {
    throw new ConsensusGovernanceError('A consensus decision requires a non-blank reason.');
  }
  return {
    investigationId: snapshot.investigationId,
    decision,
    reviewer: input.reviewer.trim(),
    reason: input.reason.trim(),
    consensusPosition: snapshot.consensusPosition,
    agreementScore: snapshot.agreementScore,
    resultingState: RESULTING_STATE[decision],
    at: opts.now,
  };
}

/** APPROVE a forming consensus (→ CONSENSUS_FORMING). Requires reviewer + reason. */
export function approveConsensus(snapshot: ConsensusSnapshot, input: { reviewer: string; reason: string }, opts: { now: string }): ConsensusReview {
  return decide(snapshot, 'approved', input, opts);
}

/** REJECT a forming consensus (→ UNDER_REVIEW). Requires reviewer + reason. */
export function rejectConsensus(snapshot: ConsensusSnapshot, input: { reviewer: string; reason: string }, opts: { now: string }): ConsensusReview {
  return decide(snapshot, 'rejected', input, opts);
}

/** ESCALATE a forming consensus (→ UNDER_REVIEW; needs senior attention). */
export function escalateConsensus(snapshot: ConsensusSnapshot, input: { reviewer: string; reason: string }, opts: { now: string }): ConsensusReview {
  return decide(snapshot, 'escalated', input, opts);
}

/** ARCHIVE an investigation's consensus (→ ARCHIVED). Requires reviewer + reason. */
export function archiveConsensus(snapshot: ConsensusSnapshot, input: { reviewer: string; reason: string }, opts: { now: string }): ConsensusReview {
  return decide(snapshot, 'archived', input, opts);
}
