// =============================================================================
// @hsi/publishing-engine — GOVERNANCE publishing controls.
//
// canPublish() gates publication on FOUR requirements (reviewer approval, trust
// threshold, evidence threshold, governance review) and returns an explainable
// verdict — never a silent gate. publishReview() records a human decision with the
// gate snapshot. publicationAuditTrail() renders the full audited history.
//
// Publishing requires a HUMAN decision; canPublish only reports eligibility.
// =============================================================================

import type {
  CanPublishResult,
  Publication,
  PublishCheck,
  PublishReview,
  PublishThresholds,
} from './types';

/** Default publish thresholds (documented). */
export const DEFAULT_PUBLISH_THRESHOLDS: PublishThresholds = {
  minTrust: 60,
  minEvidence: 3,
  minSources: 2,
};

/**
 * Evaluate whether a publication is ELIGIBLE to be published. Checks reviewer
 * approval (state ≥ APPROVED), the trust threshold, the evidence threshold, the
 * source threshold, and the governance status. Returns an explainable verdict.
 * Eligibility is NOT publication — a human must still decide.
 */
export function canPublish(
  publication: Publication,
  thresholds: PublishThresholds = DEFAULT_PUBLISH_THRESHOLDS,
): CanPublishResult {
  const checks: PublishCheck[] = [];

  const approved = publication.state === 'APPROVED' || publication.state === 'PUBLISHED';
  checks.push({
    label: 'reviewer-approved',
    ok: approved,
    detail: approved
      ? `Publication is '${publication.state}' (reviewer-approved).`
      : `Publication is '${publication.state}'; it must be APPROVED first.`,
  });

  const trust = publication.trustScore ?? 0;
  const trustOk = trust >= thresholds.minTrust;
  checks.push({
    label: 'trust-threshold',
    ok: trustOk,
    detail: trustOk
      ? `Trust ${trust} ≥ ${thresholds.minTrust}.`
      : `Trust ${trust} below the ${thresholds.minTrust} threshold.`,
  });

  const evidenceOk = publication.evidenceCount >= thresholds.minEvidence;
  checks.push({
    label: 'evidence-threshold',
    ok: evidenceOk,
    detail: evidenceOk
      ? `${publication.evidenceCount} evidence items ≥ ${thresholds.minEvidence}.`
      : `${publication.evidenceCount} evidence items below the ${thresholds.minEvidence} minimum.`,
  });

  const sourcesOk = publication.sourceCount >= thresholds.minSources;
  checks.push({
    label: 'source-threshold',
    ok: sourcesOk,
    detail: sourcesOk
      ? `${publication.sourceCount} sources ≥ ${thresholds.minSources}.`
      : `${publication.sourceCount} sources below the ${thresholds.minSources} minimum.`,
  });

  const govOk = publication.governanceStatus === 'cleared' || publication.governanceStatus === 'approved';
  checks.push({
    label: 'governance-review',
    ok: govOk,
    detail: govOk
      ? 'Governance review cleared.'
      : `Governance status '${publication.governanceStatus ?? 'pending'}' — not cleared.`,
  });

  const blockers = checks.filter((c) => !c.ok).map((c) => c.detail);
  const can = blockers.length === 0;
  return {
    canPublish: can,
    checks,
    blockers,
    summary: can
      ? `Eligible to publish — all ${checks.length} gates passed. A human must still approve.`
      : `Not eligible — ${blockers.length} gate(s) failed. Resolve them before publishing.`,
  };
}

/**
 * Record a human publish-review decision. REQUIRES a non-blank reviewer + reason
 * (throws PublishReviewError otherwise). Captures the canPublish gate snapshot.
 * Pure — does not mutate the publication (the caller transitions it).
 */
export function publishReview(
  publication: Publication,
  decision: { decision: 'approved' | 'rejected'; reviewer: string; reason: string },
  opts: { now: string; thresholds?: PublishThresholds },
): PublishReview {
  if (!decision.reviewer || decision.reviewer.trim().length === 0) {
    throw new PublishReviewError('A publish review requires an identified reviewer.');
  }
  if (!decision.reason || decision.reason.trim().length === 0) {
    throw new PublishReviewError('A publish review requires a non-blank reason.');
  }
  return {
    publicationId: publication.id,
    decision: decision.decision,
    reviewer: decision.reviewer.trim(),
    reason: decision.reason.trim(),
    gate: canPublish(publication, opts.thresholds),
    at: opts.now,
  };
}

export class PublishReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublishReviewError';
  }
}

/** Render the full audited history of a publication as human-readable lines. */
export function publicationAuditTrail(publication: Publication): string[] {
  return publication.events.map(
    (e) => `${e.at} — ${e.from} → ${e.to} by ${e.actor}: ${e.reason}`,
  );
}
