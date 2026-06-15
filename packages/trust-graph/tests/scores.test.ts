import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  signalAccuracy, reviewAccuracy, publicationQuality, reliability, computeTrust,
  AUTHORITY_WEIGHTS, TRUST_WEIGHTS,
} from '../src/scores';
import { NEUTRAL_INPUTS, demoHighTrust, demoLowTrust } from '../src/fixtures';

test('weights sum to 1 (deterministic, well-formed model)', () => {
  const a = Object.values(AUTHORITY_WEIGHTS).reduce((x, y) => x + y, 0);
  const t = Object.values(TRUST_WEIGHTS).reduce((x, y) => x + y, 0);
  assert.ok(Math.abs(a - 1) < 1e-9);
  assert.ok(Math.abs(t - 1) < 1e-9);
});

test('neutral inputs → all scores neutral (50)', () => {
  const s = computeTrust(NEUTRAL_INPUTS);
  assert.equal(s.signalAccuracy, 50);
  assert.equal(s.reviewAccuracy, 50);
  assert.equal(s.publicationQuality, 50);
  assert.equal(s.trust, 50);
  assert.equal(s.authority, 50);
});

test('signal accuracy = accepted / submitted', () => {
  assert.equal(signalAccuracy({ signalsSubmitted: 100, signalsAccepted: 80, signalsRejected: 20 }), 80);
  assert.equal(signalAccuracy({ signalsSubmitted: 0, signalsAccepted: 0, signalsRejected: 0 }), 50);
});

test('review accuracy reports agreement/disagreement %', () => {
  const r = reviewAccuracy({ reviewAgreements: 9, reviewDisagreements: 1 });
  assert.equal(r.agreementPct, 90);
  assert.equal(r.disagreementPct, 10);
  assert.equal(r.score, 90);
});

test('publication quality blends accept ratio + traceability + governance', () => {
  const hi = publicationQuality({ publicationsApproved: 10, publicationsRejected: 0, publicationTraceability: 1, governanceApprovalRate: 1 });
  const lo = publicationQuality({ publicationsApproved: 0, publicationsRejected: 10, publicationTraceability: 0, governanceApprovalRate: 0 });
  assert.ok(hi > lo);
  assert.equal(hi, 100);
  assert.equal(lo, 0);
});

test('reliability penalises abandonment + overdue', () => {
  const good = reliability({ investigationsCompleted: 10, investigationsAbandoned: 0, overdueAssignments: 0, activeWindows: 12, totalWindows: 12 });
  const bad = reliability({ investigationsCompleted: 1, investigationsAbandoned: 9, overdueAssignments: 8, activeWindows: 2, totalWindows: 12 });
  assert.ok(good > bad);
  assert.ok(good >= 90);
});

test('overdue penalty saturates (never below 0)', () => {
  const r = reliability({ investigationsCompleted: 0, investigationsAbandoned: 0, overdueAssignments: 1000, activeWindows: 0, totalWindows: 12 });
  assert.ok(r >= 0 && r <= 100);
});

test('high-trust contributor scores well above low-trust', () => {
  const hi = computeTrust(demoHighTrust);
  const lo = computeTrust(demoLowTrust);
  assert.ok(hi.trust > lo.trust);
  assert.ok(hi.authority > lo.authority);
  assert.ok(hi.authority > 70);
  assert.ok(lo.authority < 45);
});

test('authority is NOT volume — more submissions alone do not raise it', () => {
  const small = computeTrust({ ...demoHighTrust, signalsSubmitted: 10, signalsAccepted: 9, signalsRejected: 1 });
  const big = computeTrust({ ...demoHighTrust, signalsSubmitted: 1000, signalsAccepted: 900, signalsRejected: 100 });
  // same ~90% ratio at different volumes → near-identical authority
  assert.ok(Math.abs(small.authority - big.authority) <= 1);
});

test('all scores stay within 0..100', () => {
  for (const s of [computeTrust(demoHighTrust), computeTrust(demoLowTrust), computeTrust(NEUTRAL_INPUTS)]) {
    for (const v of Object.values(s)) assert.ok(v >= 0 && v <= 100, String(v));
  }
});
