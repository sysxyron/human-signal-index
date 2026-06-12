// =============================================================================
// @hsi/collective-intelligence — findings, challenges, alternative narratives,
// endorsements, and discussion metrics.
//
// submitFinding / submitChallenge / submitAlternativeNarrative / attachEvidence /
// endorseFinding / withdrawEndorsement build immutable, attributed records.
// calculateDiscussionMetrics summarises the collaboration. Nothing is silently
// edited — endorsements are withdrawn (flagged), never deleted; challenges are
// resolved (upheld/rejected), never erased.
// =============================================================================

import type {
  AlternativeNarrative,
  Challenge,
  ChallengeStatus,
  DiscussionMetrics,
  Endorsement,
  Finding,
  FindingInput,
} from './types';

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
function round(n: number, dp = 4): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

/** Submit a finding (a position + its support). Attributed + timestamped. */
export function submitFinding(input: FindingInput, opts: { now: string }): Finding {
  return {
    id: input.id,
    investigationId: input.investigationId,
    contributorId: input.contributorId,
    position: input.position,
    summary: input.summary,
    confidence: clamp01(input.confidence ?? 0.5),
    evidenceRefs: input.evidenceRefs ? [...input.evidenceRefs] : [],
    endorsements: 0,
    createdAt: opts.now,
    updatedAt: opts.now,
  };
}

/** Submit a challenge against a finding (starts `open`). */
export function submitChallenge(
  input: { id: string; investigationId: string; targetFindingId: string; contributorId: string; reason: string },
  opts: { now: string },
): Challenge {
  return {
    id: input.id,
    investigationId: input.investigationId,
    targetFindingId: input.targetFindingId,
    contributorId: input.contributorId,
    reason: input.reason,
    status: 'open',
    createdAt: opts.now,
  };
}

/** Resolve a challenge (upheld / rejected). Never erased; records who + when. */
export function resolveChallenge(
  challenge: Challenge,
  status: Exclude<ChallengeStatus, 'open'>,
  opts: { now: string; resolvedBy: string },
): Challenge {
  return { ...challenge, status, resolvedAt: opts.now, resolvedBy: opts.resolvedBy };
}

/** Submit an alternative narrative (a competing position + its argument). */
export function submitAlternativeNarrative(
  input: { id: string; investigationId: string; contributorId: string; title: string; summary: string; position: string },
  opts: { now: string },
): AlternativeNarrative {
  return { ...input, createdAt: opts.now };
}

/** Attach an evidence reference to a finding (appends; never overwrites). */
export function attachEvidence(finding: Finding, evidenceRef: string, opts: { now: string }): Finding {
  if (finding.evidenceRefs.includes(evidenceRef)) return finding;
  return { ...finding, evidenceRefs: [...finding.evidenceRefs, evidenceRef], updatedAt: opts.now };
}

/** Endorse a finding (idempotent per contributor; increments the count). */
export function endorseFinding(
  finding: Finding,
  existing: Endorsement[],
  contributorId: string,
  endorsementId: string,
  opts: { now: string },
): { finding: Finding; endorsements: Endorsement[] } {
  const prior = existing.find((e) => e.findingId === finding.id && e.contributorId === contributorId);
  if (prior && !prior.withdrawn) {
    return { finding, endorsements: existing }; // already endorsed.
  }
  let endorsements: Endorsement[];
  if (prior) {
    endorsements = existing.map((e) => (e === prior ? { ...e, withdrawn: false, updatedAt: opts.now } : e));
  } else {
    endorsements = [...existing, { id: endorsementId, findingId: finding.id, contributorId, withdrawn: false, createdAt: opts.now, updatedAt: opts.now }];
  }
  return {
    finding: { ...finding, endorsements: countActive(endorsements, finding.id), updatedAt: opts.now },
    endorsements,
  };
}

/** Withdraw an endorsement (flagged, never deleted). */
export function withdrawEndorsement(
  finding: Finding,
  existing: Endorsement[],
  contributorId: string,
  opts: { now: string },
): { finding: Finding; endorsements: Endorsement[] } {
  const prior = existing.find((e) => e.findingId === finding.id && e.contributorId === contributorId && !e.withdrawn);
  if (!prior) return { finding, endorsements: existing };
  const endorsements = existing.map((e) => (e === prior ? { ...e, withdrawn: true, updatedAt: opts.now } : e));
  return {
    finding: { ...finding, endorsements: countActive(endorsements, finding.id), updatedAt: opts.now },
    endorsements,
  };
}

function countActive(endorsements: Endorsement[], findingId: string): number {
  return endorsements.filter((e) => e.findingId === findingId && !e.withdrawn).length;
}

/** Summarise the discussion activity of an investigation. */
export function calculateDiscussionMetrics(input: {
  findings: Finding[];
  challenges: Challenge[];
  alternatives: AlternativeNarrative[];
  endorsements: Endorsement[];
}): DiscussionMetrics {
  const findingCount = input.findings.length;
  const challengeCount = input.challenges.length;
  const openChallengeCount = input.challenges.filter((c) => c.status === 'open').length;
  const alternativeCount = input.alternatives.length;
  const endorsementCount = input.endorsements.filter((e) => !e.withdrawn).length;

  const contributors = new Set<string>();
  for (const f of input.findings) contributors.add(f.contributorId);
  for (const c of input.challenges) contributors.add(c.contributorId);
  for (const a of input.alternatives) contributors.add(a.contributorId);

  const contentiousness = findingCount > 0 ? round(clamp01(challengeCount / findingCount)) : 0;
  const activity = findingCount + challengeCount + alternativeCount + endorsementCount;
  const activityScore = round(clamp01(activity / 20)); // 20+ interactions → fully active.

  return {
    findingCount,
    challengeCount,
    openChallengeCount,
    alternativeCount,
    endorsementCount,
    contributorCount: contributors.size,
    contentiousness,
    activityScore,
  };
}
