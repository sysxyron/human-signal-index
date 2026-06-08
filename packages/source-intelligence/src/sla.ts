// =============================================================================
// @hsi/source-intelligence — SLA policies + deadline computation (Phase 8).
//
// Pure, deterministic SLA math for review/escalation deadlines. Callers inject
// the creation timestamp and `now` (no Date.now() in pure code). Used by triage
// (assign_sla) and the review UI to show whether an item is on track or overdue.
//
// These deadlines drive HUMAN review prioritization — they never auto-action.
// =============================================================================

import { round } from './internal/text';

/** Severity ladder (mirrors AlertSeverity for consistency). */
export type SlaSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** An SLA policy: hours allowed before review, then before escalation. */
export interface SlaPolicy {
  name: string;
  severity: SlaSeverity;
  /** Hours from creation by which a human review should START/complete. */
  reviewDeadlineHours: number;
  /** Hours from creation by which the item must be escalated if unreviewed. */
  escalationDeadlineHours: number;
}

/** The status of an item against its SLA at a given `now`. */
export interface SlaStatus {
  state: 'on_track' | 'due_soon' | 'overdue_review' | 'overdue_escalation';
  reviewDeadline: string;
  escalationDeadline: string;
  /** Hours remaining until the NEXT relevant deadline (negative = overdue). */
  hoursRemaining: number;
}

const HOUR_MS = 60 * 60 * 1000;

/** "Due soon" window: within this many hours of the review deadline. */
export const DUE_SOON_HOURS = 4;

/** Default SLA policies by severity (tune per deployment). */
export const DEFAULT_SLA_POLICIES: SlaPolicy[] = [
  { name: 'Critical', severity: 'CRITICAL', reviewDeadlineHours: 2, escalationDeadlineHours: 4 },
  { name: 'High', severity: 'HIGH', reviewDeadlineHours: 8, escalationDeadlineHours: 24 },
  { name: 'Medium', severity: 'MEDIUM', reviewDeadlineHours: 48, escalationDeadlineHours: 96 },
  { name: 'Low', severity: 'LOW', reviewDeadlineHours: 168, escalationDeadlineHours: 336 },
];

function addHours(iso: string, hours: number): string {
  return new Date(Date.parse(iso) + hours * HOUR_MS).toISOString();
}

/**
 * Compute the review + escalation deadlines for an item created at
 * `createdAtISO` under `policy`. Pure & deterministic.
 */
export function computeSlaDeadlines(
  policy: SlaPolicy,
  createdAtISO: string,
): { reviewDeadline: string; escalationDeadline: string } {
  return {
    reviewDeadline: addHours(createdAtISO, policy.reviewDeadlineHours),
    escalationDeadline: addHours(createdAtISO, policy.escalationDeadlineHours),
  };
}

/**
 * Determine an item's SLA status at `nowISO`. If `reviewedAtISO` is provided and
 * is before the review deadline, the item is on track regardless of `now`
 * (a completed review stops the review clock). Pure & deterministic.
 */
export function slaStatus(
  policy: SlaPolicy,
  createdAtISO: string,
  nowISO: string,
  reviewedAtISO?: string,
): SlaStatus {
  const { reviewDeadline, escalationDeadline } = computeSlaDeadlines(policy, createdAtISO);
  const now = Date.parse(nowISO);
  const reviewBy = Date.parse(reviewDeadline);
  const escalateBy = Date.parse(escalationDeadline);

  // A completed review stops the review clock.
  if (reviewedAtISO) {
    const reviewedAt = Date.parse(reviewedAtISO);
    if (reviewedAt <= reviewBy) {
      return {
        state: 'on_track',
        reviewDeadline,
        escalationDeadline,
        hoursRemaining: round((escalateBy - now) / HOUR_MS),
      };
    }
  }

  if (now > escalateBy) {
    return {
      state: 'overdue_escalation',
      reviewDeadline,
      escalationDeadline,
      hoursRemaining: round((escalateBy - now) / HOUR_MS),
    };
  }
  if (now > reviewBy) {
    return {
      state: 'overdue_review',
      reviewDeadline,
      escalationDeadline,
      hoursRemaining: round((escalateBy - now) / HOUR_MS),
    };
  }
  const hoursToReview = (reviewBy - now) / HOUR_MS;
  return {
    state: hoursToReview <= DUE_SOON_HOURS ? 'due_soon' : 'on_track',
    reviewDeadline,
    escalationDeadline,
    hoursRemaining: round(hoursToReview),
  };
}
