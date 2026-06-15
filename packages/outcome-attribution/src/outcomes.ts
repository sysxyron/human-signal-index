// =============================================================================
// Outcome taxonomy (Deliverable 9) + per-type impact weight. PURE.
// The weight expresses how much each outcome TYPE counts toward impact — a
// verified finding or governance action matters more than a generic completion.
// =============================================================================

import type { OutcomeType } from './types';

export const OUTCOME_TYPES: OutcomeType[] = [
  'VERIFIED_FINDING',
  'GOVERNANCE_ACTION',
  'POLICY_CHANGE',
  'RISK_REDUCTION',
  'NARRATIVE_CORRECTION',
  'INVESTIGATION_COMPLETED',
  'PUBLICATION_RELEASED',
  'EXTERNAL_ACTION',
  'OTHER',
];

/** Relative weight of each outcome type (0..1). Higher = more impactful. */
export const OUTCOME_WEIGHTS: Record<OutcomeType, number> = {
  VERIFIED_FINDING: 1.0,
  GOVERNANCE_ACTION: 0.9,
  POLICY_CHANGE: 1.0,
  RISK_REDUCTION: 0.85,
  NARRATIVE_CORRECTION: 0.8,
  INVESTIGATION_COMPLETED: 0.5,
  PUBLICATION_RELEASED: 0.7,
  EXTERNAL_ACTION: 0.95,
  OTHER: 0.3,
};

export function isOutcomeType(s: string): s is OutcomeType {
  return (OUTCOME_TYPES as string[]).includes(s);
}

export function outcomeWeight(type: OutcomeType): number {
  return OUTCOME_WEIGHTS[type] ?? OUTCOME_WEIGHTS.OTHER;
}
