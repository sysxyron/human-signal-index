// =============================================================================
// @hsi/collective-intelligence — deterministic offline fixtures + end-to-end demo.
//
// `collectiveDemo()` builds an investigation, submits findings/challenges/
// alternatives/endorsements + evidence claims, scores contributors, computes the
// consensus snapshot, and records a governance review — all offline + deterministic.
// =============================================================================

import { buildConsensusSnapshot, type ConsensusFinding } from '@hsi/consensus-engine';
import {
  advanceInvestigation,
  createInvestigation,
} from './investigation';
import {
  calculateDiscussionMetrics,
  endorseFinding,
  submitAlternativeNarrative,
  submitChallenge,
  submitFinding,
} from './findings';
import { createEvidenceClaim, reviewEvidence, scoreEvidenceStrength, supportEvidence } from './evidence';
import { computeContributorScore } from './reputation';
import { approveConsensus } from './governance';
import type { Endorsement, Investigation } from './types';

export const FIXTURE_NOW = '2026-06-09T12:00:00.000Z';

/** A fully populated demo investigation. */
export function collectiveDemo() {
  const now = FIXTURE_NOW;

  // Investigation, advanced to ACTIVE.
  let investigation: Investigation = createInvestigation(
    { id: 'inv-1', slug: 'early-settlement', title: 'When was the settlement founded?', question: 'Does the evidence support an earlier founding date?', createdBy: 'c-ana' },
    { now },
  );
  const adv = advanceInvestigation(investigation, { now, actor: 'c-ana' });
  if (adv.ok) investigation = adv.investigation;

  // Findings (two positions).
  const findings = [
    submitFinding({ id: 'fd1', investigationId: 'inv-1', contributorId: 'c-ana', position: 'Earlier settlement', summary: 'Stratigraphy supports an earlier date.', confidence: 0.82, evidenceRefs: ['ev1'] }, { now }),
    submitFinding({ id: 'fd2', investigationId: 'inv-1', contributorId: 'c-ben', position: 'Earlier settlement', summary: 'Radiocarbon agrees.', confidence: 0.78, evidenceRefs: ['ev2'] }, { now }),
    submitFinding({ id: 'fd3', investigationId: 'inv-1', contributorId: 'c-dan', position: 'Conventional date', summary: 'Existing chronology still holds.', confidence: 0.6, evidenceRefs: ['ev3'] }, { now }),
  ];

  // Challenges + alternatives + endorsements.
  const challenges = [
    submitChallenge({ id: 'ch1', investigationId: 'inv-1', targetFindingId: 'fd3', contributorId: 'c-ana', reason: 'Ignores the new stratigraphy.' }, { now }),
  ];
  const alternatives = [
    submitAlternativeNarrative({ id: 'an1', investigationId: 'inv-1', contributorId: 'c-eve', title: 'Climate displacement', summary: 'Movement driven by climate.', position: 'Climate displacement' }, { now }),
  ];
  let endorsements: Endorsement[] = [];
  const e1 = endorseFinding(findings[0], endorsements, 'c-ben', 'en1', { now });
  endorsements = e1.endorsements;
  findings[0] = e1.finding;
  const e2 = endorseFinding(findings[0], endorsements, 'c-cara', 'en2', { now });
  endorsements = e2.endorsements;
  findings[0] = e2.finding;

  const metrics = calculateDiscussionMetrics({ findings, challenges, alternatives, endorsements });

  // Evidence claim debate.
  let claim = createEvidenceClaim({ id: 'evc1', investigationId: 'inv-1', contributorId: 'c-ana', claim: 'Stratum III predates the conventional date.', sourceRef: 'source:strat-2025', sourceQuality: 0.85 }, { now });
  claim = supportEvidence(claim, { now });
  claim = supportEvidence(claim, { now });
  const rev = reviewEvidence(claim, { id: 'evr1', reviewerId: 'c-ben', decision: 'approved', reason: 'Methodology sound.' }, { now });
  claim = rev.claim;
  const evidenceStrength = scoreEvidenceStrength(claim);

  // Contributor scores.
  const contributors = [
    computeContributorScore({ contributorId: 'c-ana', findingsAligned: 8, findingsMisaligned: 1, challengesUpheld: 3, challengesRejected: 1, reviewsConfirmed: 4, reviewsOverturned: 0, evidenceQuality: 0.82, baseTrust: 84, contributionCount: 12 }),
    computeContributorScore({ contributorId: 'c-dan', findingsAligned: 2, findingsMisaligned: 3, challengesUpheld: 1, challengesRejected: 2, evidenceQuality: 0.55, baseTrust: 58, contributionCount: 6 }),
  ];

  // Consensus snapshot.
  const consensusFindings: ConsensusFinding[] = [
    { id: 'fd1', position: 'Earlier settlement', contributorId: 'c-ana', confidence: 0.82, evidenceStrength: 0.85, contributorTrust: 84, historicalAccuracy: 0.8, governanceStanding: 0.9, reviewsApproved: 3, endorsements: 2 },
    { id: 'fd2', position: 'Earlier settlement', contributorId: 'c-ben', confidence: 0.78, evidenceStrength: 0.8, contributorTrust: 76, historicalAccuracy: 0.72 },
    { id: 'fd3', position: 'Conventional date', contributorId: 'c-dan', confidence: 0.6, evidenceStrength: 0.55, contributorTrust: 58, historicalAccuracy: 0.55, challengesUpheld: 1 },
  ];
  const snapshot = buildConsensusSnapshot('inv-1', consensusFindings, { now });

  // Governance review.
  const review = approveConsensus(snapshot, { reviewer: 'curator-zoe', reason: 'Evidence is strong and dissent is recorded; proceed.' }, { now });

  return { now, investigation, findings, challenges, alternatives, endorsements, metrics, claim, evidenceStrength, contributors, snapshot, review };
}
