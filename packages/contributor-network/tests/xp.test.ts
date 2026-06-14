import { test } from 'node:test';
import assert from 'node:assert/strict';

import { XP_VALUES, xpFor, xpAdjustment, totalXp, xpByEvent } from '../src/xp';

test('XP values match the spec', () => {
  assert.equal(XP_VALUES.signal_submitted, 10);
  assert.equal(XP_VALUES.signal_accepted, 25);
  assert.equal(XP_VALUES.evidence_package_created, 50);
  assert.equal(XP_VALUES.investigation_completed, 100);
  assert.equal(XP_VALUES.review_completed, 40);
  assert.equal(XP_VALUES.governance_action_completed, 75);
});

test('xpFor builds the canonical entry', () => {
  const e = xpFor('signal_accepted', '2026-06-01T00:00:00Z');
  assert.equal(e.event, 'signal_accepted');
  assert.equal(e.amount, 25);
});

test('totalXp sums the ledger', () => {
  const ledger = [xpFor('signal_submitted', 't'), xpFor('signal_accepted', 't'), xpFor('review_completed', 't')];
  assert.equal(totalXp(ledger), 10 + 25 + 40);
});

test('adjustments are append-only and may be negative', () => {
  const ledger = [xpFor('signal_accepted', 't'), xpAdjustment(-5, 't', 'correction')];
  assert.equal(totalXp(ledger), 20);
  assert.equal(ledger[1].event, 'adjustment');
});

test('xpByEvent groups amounts', () => {
  const ledger = [xpFor('signal_submitted', 't'), xpFor('signal_submitted', 't'), xpFor('review_completed', 't')];
  const by = xpByEvent(ledger);
  assert.equal(by.signal_submitted, 20);
  assert.equal(by.review_completed, 40);
});

test('totalXp ignores non-finite amounts', () => {
  assert.equal(totalXp([{ event: 'adjustment', amount: NaN, at: 't' }]), 0);
});
