import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CREDIT_VALUES, creditFor, creditAdjustment, totalCredits } from '../src/credits';

test('credit values defined for each earn event', () => {
  assert.ok(CREDIT_VALUES.mission_completed > 0);
  assert.ok(CREDIT_VALUES.badge_earned > 0);
  assert.ok(CREDIT_VALUES.investigation_approved > 0);
});

test('totalCredits sums the ledger', () => {
  const ledger = [creditFor('mission_completed', 't'), creditFor('badge_earned', 't')];
  assert.equal(totalCredits(ledger), CREDIT_VALUES.mission_completed + CREDIT_VALUES.badge_earned);
});

test('adjustments append (may be negative)', () => {
  const ledger = [creditFor('badge_earned', 't'), creditAdjustment(-10, 't', 'reversal')];
  assert.equal(totalCredits(ledger), CREDIT_VALUES.badge_earned - 10);
});
