// =============================================================================
// @hsi/publishing-engine — the RETRACTION system.
//
// retractPublication() moves a publication to RETRACTED and produces a visible,
// reasoned RetractionRecord. Retractions remain VISIBLE — history is NEVER
// deleted; the publication keeps its full event trail and the retraction is shown
// publicly. REQUIRES a non-blank actor + detail.
// =============================================================================

import { transitionPublication } from './states';
import type {
  Publication,
  RetractionReason,
  RetractionRecord,
} from './types';

const REASON_LABEL: Record<RetractionReason, string> = {
  evidence_error: 'Evidence error',
  trust_collapse: 'Trust collapse',
  governance_decision: 'Governance decision',
  data_quality_issue: 'Data quality issue',
  methodology_issue: 'Methodology issue',
};

export class RetractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetractionError';
  }
}

/**
 * Retract a publication. Valid from APPROVED or PUBLISHED. Returns the retracted
 * publication (state RETRACTED, history preserved) + a visible RetractionRecord.
 * REQUIRES a non-blank actor + detail — otherwise throws. Pure.
 */
export function retractPublication(
  publication: Publication,
  input: { reason: RetractionReason; detail: string; retractedBy: string },
  opts: { now: string },
): { publication: Publication; retraction: RetractionRecord } {
  if (!input.retractedBy || input.retractedBy.trim().length === 0) {
    throw new RetractionError('A retraction requires an identified actor.');
  }
  const detail = (input.detail ?? '').trim();
  if (detail.length === 0) {
    throw new RetractionError('A retraction requires a non-blank detail explaining why.');
  }

  const previousState = publication.state;
  const res = transitionPublication(publication, 'RETRACTED', {
    now: opts.now,
    actor: input.retractedBy.trim(),
    reason: `Retracted (${REASON_LABEL[input.reason]}): ${detail}`,
  });
  if (!res.ok) {
    throw new RetractionError(res.reason);
  }

  const retraction: RetractionRecord = {
    publicationId: publication.id,
    reason: input.reason,
    detail,
    retractedBy: input.retractedBy.trim(),
    previousState,
    at: opts.now,
  };
  return { publication: res.publication, retraction };
}

/** Human label for a retraction reason. */
export function retractionReasonLabel(reason: RetractionReason): string {
  return REASON_LABEL[reason] ?? reason;
}
