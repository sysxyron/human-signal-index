import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ConsensusGovernanceError,
  approveConsensus,
  archiveConsensus,
  escalateConsensus,
  rejectConsensus,
} from '../src/governance';
import { collectiveDemo, FIXTURE_NOW } from '../src/fixtures';
import { buildConsensusSnapshot } from '@hsi/consensus-engine';
import type { ConsensusFinding } from '@hsi/consensus-engine';

const NOW = FIXTURE_NOW;

const FINDINGS: ConsensusFinding[] = [
  { id: 'f1', position: 'A', contributorId: 'c1', confidence: 0.8, evidenceStrength: 0.8, contributorTrust: 80 },
];
const snap = () => buildConsensusSnapshot('inv-1', FINDINGS, { now: NOW });

// ---- governance -------------------------------------------------------------

test('approveConsensus → CONSENSUS_FORMING', () => {
  const r = approveConsensus(snap(), { reviewer: 'zoe', reason: 'evidence strong' }, { now: NOW });
  assert.equal(r.decision, 'approved');
  assert.equal(r.resultingState, 'CONSENSUS_FORMING');
  assert.equal(r.reviewer, 'zoe');
});

test('rejectConsensus → UNDER_REVIEW', () => {
  const r = rejectConsensus(snap(), { reviewer: 'zoe', reason: 'needs more' }, { now: NOW });
  assert.equal(r.decision, 'rejected');
  assert.equal(r.resultingState, 'UNDER_REVIEW');
});

test('escalateConsensus → UNDER_REVIEW', () => {
  const r = escalateConsensus(snap(), { reviewer: 'zoe', reason: 'senior review' }, { now: NOW });
  assert.equal(r.decision, 'escalated');
  assert.equal(r.resultingState, 'UNDER_REVIEW');
});

test('archiveConsensus → ARCHIVED', () => {
  const r = archiveConsensus(snap(), { reviewer: 'zoe', reason: 'closing' }, { now: NOW });
  assert.equal(r.decision, 'archived');
  assert.equal(r.resultingState, 'ARCHIVED');
});

test('decision requires a reviewer', () => {
  assert.throws(() => approveConsensus(snap(), { reviewer: '', reason: 'x' }, { now: NOW }), ConsensusGovernanceError);
});

test('decision requires a reason', () => {
  assert.throws(() => rejectConsensus(snap(), { reviewer: 'zoe', reason: '  ' }, { now: NOW }), ConsensusGovernanceError);
});

test('decision captures consensus context', () => {
  const r = approveConsensus(snap(), { reviewer: 'zoe', reason: 'ok' }, { now: NOW });
  assert.equal(r.consensusPosition, 'A');
  assert.ok(r.agreementScore > 0);
  assert.equal(r.investigationId, 'inv-1');
});

test('decision trims whitespace', () => {
  const r = approveConsensus(snap(), { reviewer: '  zoe  ', reason: '  ok  ' }, { now: NOW });
  assert.equal(r.reviewer, 'zoe');
  assert.equal(r.reason, 'ok');
});

test('deterministic decisions', () => {
  assert.deepEqual(
    approveConsensus(snap(), { reviewer: 'zoe', reason: 'ok' }, { now: NOW }),
    approveConsensus(snap(), { reviewer: 'zoe', reason: 'ok' }, { now: NOW }),
  );
});

// ---- fixtures ---------------------------------------------------------------

test('collectiveDemo runs the full chain', () => {
  const out = collectiveDemo();
  assert.equal(out.now, NOW);
  assert.equal(out.investigation.state, 'ACTIVE');
  assert.ok(out.findings.length >= 3);
  assert.equal(out.snapshot.consensusPosition, 'Earlier settlement');
  assert.equal(out.review.decision, 'approved');
  assert.ok(out.contributors.length >= 2);
});

test('collectiveDemo metrics reflect activity', () => {
  const out = collectiveDemo();
  assert.ok(out.metrics.findingCount >= 3);
  assert.ok(out.metrics.challengeCount >= 1);
  assert.ok(out.metrics.contributorCount >= 4);
});

test('collectiveDemo evidence strength is scored', () => {
  const out = collectiveDemo();
  assert.ok(out.evidenceStrength.strength > 0);
});

test('collectiveDemo is deterministic', () => {
  assert.deepEqual(collectiveDemo(), collectiveDemo());
});
