// =============================================================================
// Trust EVENTS (Deliverable 9) + ANTI-GAMING (Deliverable 14). PURE.
//
// Trust scores are recomputed from aggregates (deterministic), so events here are
// the audit/explanation layer. The anti-gaming guard is the important part: any
// SELF-generated validation (a contributor accepting/reviewing/approving their own
// work) is EXCLUDED from trust — this is what blocks circular authority boosting.
// =============================================================================

import type { TrustEventType, ValidationEvent } from './types';

/** Signed weights for explaining a trust change (history reasons). */
export const TRUST_EVENT_WEIGHTS: Record<TrustEventType, number> = {
  SIGNAL_ACCEPTED: +3,
  SIGNAL_REJECTED: -2,
  REVIEW_AGREEMENT: +2,
  REVIEW_DISAGREEMENT: -2,
  PUBLICATION_APPROVED: +4,
  PUBLICATION_REJECTED: -3,
  INVESTIGATION_COMPLETED: +3,
  INVESTIGATION_ABANDONED: -4,
};

/** Validation events where the actor acted on their OWN work (circular boosting). */
const VALIDATION_TYPES = new Set<TrustEventType>([
  'SIGNAL_ACCEPTED', 'SIGNAL_REJECTED', 'REVIEW_AGREEMENT', 'REVIEW_DISAGREEMENT',
  'PUBLICATION_APPROVED', 'PUBLICATION_REJECTED',
]);

/** True when an event is self-validation (must be ignored by trust). */
export function isSelfValidation(e: ValidationEvent): boolean {
  return VALIDATION_TYPES.has(e.type) && e.subjectId !== null && e.subjectId === e.actorId;
}

/** Drop self-generated validation before aggregation (anti-gaming). PURE. */
export function filterSelfValidation<E extends ValidationEvent>(events: E[]): E[] {
  return events.filter((e) => !isSelfValidation(e));
}

/** Count how many events were rejected as self-validation (for transparency). */
export function countSelfValidation(events: ValidationEvent[]): number {
  return events.reduce((n, e) => n + (isSelfValidation(e) ? 1 : 0), 0);
}
