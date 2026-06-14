import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BADGE_DEFINITIONS, badgeById, evaluateBadges, newlyEarnedBadges, badgeProgress } from '../src/badges';
import type { ContributionMetrics } from '../src/types';

const ZERO: ContributionMetrics = {
  accepted_signals: 0, approved_sources: 0, evidence_packages: 0, linked_signals: 0,
  completed_reviews: 0, traceability_days: 0, confirmed_early_detections: 0, approved_reports: 0, governance_actions: 0,
};

test('all 10 badges defined with positive thresholds + unique ids', () => {
  assert.equal(BADGE_DEFINITIONS.length, 10);
  const ids = BADGE_DEFINITIONS.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const b of BADGE_DEFINITIONS) assert.ok(b.threshold > 0);
});

test('no badges with zero metrics', () => {
  assert.equal(evaluateBadges(ZERO).length, 0);
});

test('signal_hunter at 25 accepted signals; signal_veteran at 100', () => {
  const at25 = evaluateBadges({ ...ZERO, accepted_signals: 25 }).map((a) => a.badgeId);
  assert.ok(at25.includes('signal_hunter'));
  assert.ok(!at25.includes('signal_veteran'));
  const at100 = evaluateBadges({ ...ZERO, accepted_signals: 100 }).map((a) => a.badgeId);
  assert.ok(at100.includes('signal_hunter'));
  assert.ok(at100.includes('signal_veteran'));
});

test('newlyEarnedBadges excludes already-held', () => {
  const m = { ...ZERO, accepted_signals: 100 };
  const fresh = newlyEarnedBadges(m, ['signal_hunter']).map((a) => a.badgeId);
  assert.ok(fresh.includes('signal_veteran'));
  assert.ok(!fresh.includes('signal_hunter'));
});

test('award records the metric + value that earned it', () => {
  const [a] = evaluateBadges({ ...ZERO, approved_sources: 60 });
  assert.equal(a.badgeId, 'source_scout');
  assert.equal(a.earnedByMetric, 'approved_sources');
  assert.equal(a.value, 60);
  assert.equal(a.threshold, 50);
});

test('badgeProgress is 0..1', () => {
  assert.equal(badgeProgress({ ...ZERO, accepted_signals: 0 }, 'signal_hunter'), 0);
  assert.equal(badgeProgress({ ...ZERO, accepted_signals: 25 }, 'signal_hunter'), 1);
  assert.ok(Math.abs(badgeProgress({ ...ZERO, accepted_signals: 5 }, 'signal_hunter') - 0.2) < 1e-9);
});

test('badgeById resolves and unknown returns undefined', () => {
  assert.equal(badgeById('fact_checker')?.threshold, 250);
  assert.equal(badgeById('nope'), undefined);
});
