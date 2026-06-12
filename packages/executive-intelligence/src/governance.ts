// =============================================================================
// @hsi/executive-intelligence — EXECUTIVE GOVERNANCE.
//
// queueExecutiveReview() queues a strategic priority for human review.
// approve/reject/archiveExecutiveDecision() record a HUMAN decision (reviewer +
// reason required; throws otherwise) with an append-only audit trail and a
// reversible flag. NEVER auto-governs, NEVER auto-approves, NEVER auto-acts.
// =============================================================================

import type {
  ExecutiveDecision,
  ExecutiveDecisionType,
  ExecutiveReviewQueueItem,
  StrategicPriority,
} from './types';

export class ExecutiveGovernanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExecutiveGovernanceError';
  }
}

/** Queue a strategic priority for executive review (status `queued`). */
export function queueExecutiveReview(priority: StrategicPriority, opts: { now: string; id: string }): ExecutiveReviewQueueItem {
  const severity = priority.attentionLevel === 'urgent' ? 'CRITICAL' : priority.attentionLevel === 'elevated' ? 'HIGH' : priority.attentionLevel === 'notable' ? 'MEDIUM' : 'LOW';
  return { id: opts.id, priorityId: priority.id, title: priority.title, kind: priority.kind, severity, queuedAt: opts.now, status: 'queued' };
}

function decide(
  review: ExecutiveReviewQueueItem,
  decision: ExecutiveDecisionType,
  input: { reviewer: string; reason: string },
  opts: { now: string },
): ExecutiveDecision {
  if (!input.reviewer || input.reviewer.trim().length === 0) throw new ExecutiveGovernanceError('An executive decision requires an identified reviewer.');
  if (!input.reason || input.reason.trim().length === 0) throw new ExecutiveGovernanceError('An executive decision requires a non-blank reason.');
  const by = input.reviewer.trim();
  const reason = input.reason.trim();
  return {
    reviewId: review.id,
    priorityId: review.priorityId,
    decision,
    reviewer: by,
    reason,
    previousStatus: review.status,
    reversible: true,
    auditTrail: [
      `${opts.now} — review ${review.id} for "${review.title}" (${review.kind}, ${review.severity}).`,
      `${opts.now} — ${decision.toUpperCase()} by ${by}. Reason: ${reason}.`,
      `${opts.now} — previous status '${review.status}' preserved; decision is reversible.`,
    ],
    at: opts.now,
  };
}

/** APPROVE an executive review item. Requires reviewer + reason. */
export function approveExecutiveDecision(review: ExecutiveReviewQueueItem, input: { reviewer: string; reason: string }, opts: { now: string }): ExecutiveDecision {
  return decide(review, 'approved', input, opts);
}
/** REJECT an executive review item. Requires reviewer + reason. */
export function rejectExecutiveDecision(review: ExecutiveReviewQueueItem, input: { reviewer: string; reason: string }, opts: { now: string }): ExecutiveDecision {
  return decide(review, 'rejected', input, opts);
}
/** ARCHIVE an executive review item. Requires reviewer + reason. */
export function archiveExecutiveDecision(review: ExecutiveReviewQueueItem, input: { reviewer: string; reason: string }, opts: { now: string }): ExecutiveDecision {
  return decide(review, 'archived', input, opts);
}
