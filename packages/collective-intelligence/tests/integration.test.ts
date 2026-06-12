import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  advanceInvestigation,
  approveConsensus,
  createInvestigation,
  computeContributorScore,
  endorseFinding,
  resolveChallenge,
  submitChallenge,
  submitFinding,
  transitionInvestigation,
} from '../src';
import { buildConsensusSnapshot, type ConsensusFinding } from '@hsi/consensus-engine';
import { FIXTURE_NOW } from '../src/fixtures';
import type { Endorsement } from '../src/types';

const NOW = FIXTURE_NOW;

// End-to-end: an investigation runs from creation through collaboration, consensus
// formation, governance approval, and contributor scoring.

test('full investigation lifecycle to CONSENSUS_FORMING via governance', () => {
  let inv = createInvestigation({ id: 'i', slug: 's', title: 't', question: 'q', createdBy: 'c1' }, { now: NOW });
  // DRAFT → ACTIVE → UNDER_REVIEW.
  for (const to of ['ACTIVE', 'UNDER_REVIEW'] as const) {
    const r = transitionInvestigation(inv, to, { now: NOW });
    if (r.ok) inv = r.investigation;
  }
  // Findings on two positions.
  const findings: ConsensusFinding[] = [
    { id: 'f1', position: 'A', contributorId: 'c1', confidence: 0.85, evidenceStrength: 0.85, contributorTrust: 82, reviewsApproved: 2 },
    { id: 'f2', position: 'A', contributorId: 'c2', confidence: 0.8, evidenceStrength: 0.78, contributorTrust: 74 },
    { id: 'f3', position: 'B', contributorId: 'c3', confidence: 0.5, evidenceStrength: 0.4, contributorTrust: 50, challengesUpheld: 1 },
  ];
  const snap = buildConsensusSnapshot(inv.id, findings, { now: NOW });
  assert.equal(snap.consensusPosition, 'A');
  // Governance approval → CONSENSUS_FORMING.
  const review = approveConsensus(snap, { reviewer: 'zoe', reason: 'strong evidence; dissent recorded' }, { now: NOW });
  const trans = transitionInvestigation(inv, review.resultingState, { now: NOW, actor: 'zoe' });
  assert.ok(trans.ok);
  if (trans.ok) assert.equal(trans.investigation.state, 'CONSENSUS_FORMING');
});

test('challenge that is upheld lowers a position weight', () => {
  const defended: ConsensusFinding[] = [{ id: 'f', position: 'A', contributorId: 'c', confidence: 0.7, evidenceStrength: 0.7, contributorTrust: 70, challengesRejected: 2 }];
  const challenged: ConsensusFinding[] = [{ id: 'f', position: 'A', contributorId: 'c', confidence: 0.7, evidenceStrength: 0.7, contributorTrust: 70, challengesUpheld: 2 }];
  const a = buildConsensusSnapshot('i', defended, { now: NOW });
  const b = buildConsensusSnapshot('i', challenged, { now: NOW });
  assert.ok((a.positions[0]?.weight ?? 0) > (b.positions[0]?.weight ?? 0));
});

test('endorsements + challenge resolution flow', () => {
  let f = submitFinding({ id: 'f1', investigationId: 'i', contributorId: 'c1', position: 'A', summary: 's', confidence: 0.8 }, { now: NOW });
  let endorsements: Endorsement[] = [];
  const e = endorseFinding(f, endorsements, 'c2', 'en1', { now: NOW });
  f = e.finding; endorsements = e.endorsements;
  assert.equal(f.endorsements, 1);

  const ch = submitChallenge({ id: 'ch', investigationId: 'i', targetFindingId: 'f1', contributorId: 'c3', reason: 'r' }, { now: NOW });
  const resolved = resolveChallenge(ch, 'rejected', { now: NOW, resolvedBy: 'judge' });
  assert.equal(resolved.status, 'rejected');
});

test('contributor aligned with consensus scores higher than the misaligned', () => {
  const aligned = computeContributorScore({ contributorId: 'a', findingsAligned: 9, findingsMisaligned: 1, contributionCount: 10 });
  const misaligned = computeContributorScore({ contributorId: 'b', findingsAligned: 1, findingsMisaligned: 9, contributionCount: 10 });
  assert.ok(aligned.overall > misaligned.overall);
  assert.ok(aligned.accuracy > misaligned.accuracy);
});

test('advanceInvestigation walks toward PUBLISHED through the pipeline', () => {
  let inv = createInvestigation({ id: 'i', slug: 's', title: 't', question: 'q', createdBy: 'c' }, { now: NOW });
  const states: string[] = [inv.state];
  for (let n = 0; n < 6; n++) {
    const r = advanceInvestigation(inv, { now: NOW });
    if (!r.ok) break;
    inv = r.investigation;
    states.push(inv.state);
  }
  assert.ok(states.includes('CONSENSUS_FORMING'));
  assert.ok(states.includes('PUBLISHED'));
});

test('dissent is preserved through the snapshot', () => {
  const findings: ConsensusFinding[] = [
    { id: 'f1', position: 'A', contributorId: 'c1', confidence: 0.8, evidenceStrength: 0.8, contributorTrust: 80 },
    { id: 'f2', position: 'B', contributorId: 'c2', confidence: 0.6, evidenceStrength: 0.5, contributorTrust: 55 },
  ];
  const snap = buildConsensusSnapshot('i', findings, { now: NOW });
  assert.ok(snap.dissentPositions.some((d) => d.position === 'B'));
});

test('snapshot limitations never claim truth', () => {
  const snap = buildConsensusSnapshot('i', [{ id: 'f', position: 'A', contributorId: 'c', confidence: 0.8, evidenceStrength: 0.8, contributorTrust: 80 }], { now: NOW });
  assert.ok(snap.limitations.some((l) => /not truth|human governance/i.test(l)));
});

test('deterministic full chain', () => {
  const build = () => {
    const findings: ConsensusFinding[] = [{ id: 'f', position: 'A', contributorId: 'c', confidence: 0.8, evidenceStrength: 0.8, contributorTrust: 80 }];
    return buildConsensusSnapshot('i', findings, { now: NOW });
  };
  assert.deepEqual(build(), build());
});
