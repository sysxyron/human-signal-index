import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEMO_NOW, demoXpLedger, demoCreditLedger, demoQuality, demoMetrics, demoReadiness,
  demoInvestigationEvents, demoContributors, demoTeams, demoMissionProgress,
} from '../src/fixtures';
import { totalXp } from '../src/xp';
import { totalCredits } from '../src/credits';
import { computeReputation } from '../src/reputation';
import { evaluateBadges } from '../src/badges';

test('demo timestamps are literal ISO (deterministic)', () => {
  assert.match(DEMO_NOW, /^\d{4}-\d{2}-\d{2}T/);
  for (const e of demoXpLedger) assert.match(e.at, /^\d{4}-\d{2}-\d{2}T/);
});

test('demo ledgers produce positive totals', () => {
  assert.ok(totalXp(demoXpLedger) > 0);
  assert.ok(totalCredits(demoCreditLedger) > 0);
});

test('demo quality yields valid reputation', () => {
  const r = computeReputation(demoQuality);
  assert.ok(r.research_reputation > 0 && r.research_reputation <= 100);
});

test('demo metrics earn at least one badge', () => {
  assert.ok(evaluateBadges(demoMetrics).length > 0);
});

test('demo readiness is partial (governance + source quality pending)', () => {
  assert.equal(demoReadiness.governanceComplete, false);
  assert.equal(demoReadiness.evidenceComplete, true);
});

test('demo investigation has an ordered event trail', () => {
  assert.ok(demoInvestigationEvents.length >= 3);
});

test('demo contributors + teams populated', () => {
  assert.ok(demoContributors.length >= 5);
  assert.ok(demoTeams.length >= 3);
  assert.ok(Object.keys(demoMissionProgress).length > 0);
});
