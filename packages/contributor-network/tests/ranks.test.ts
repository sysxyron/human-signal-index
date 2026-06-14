import { test } from 'node:test';
import assert from 'node:assert/strict';

import { RANK_TRACKS, TRACK_REPUTATION, trackForRole, rankProgress } from '../src/ranks';
import type { ContributionMetrics } from '../src/types';

const ZERO: ContributionMetrics = {
  accepted_signals: 0, approved_sources: 0, evidence_packages: 0, linked_signals: 0,
  completed_reviews: 0, traceability_days: 0, confirmed_early_detections: 0, approved_reports: 0, governance_actions: 0,
};

test('every track has an ordered, contiguous ladder', () => {
  for (const track of Object.keys(RANK_TRACKS) as Array<keyof typeof RANK_TRACKS>) {
    const ladder = RANK_TRACKS[track];
    ladder.forEach((r, i) => assert.equal(r.level, i + 1));
    for (let i = 1; i < ladder.length; i++) assert.ok(ladder[i].minXp >= ladder[i - 1].minXp);
  }
});

test('viewer path is Viewer → Contributor → Trusted Contributor', () => {
  assert.deepEqual(RANK_TRACKS.viewer.map((r) => r.name), ['Viewer', 'Contributor', 'Trusted Contributor']);
});

test('trackForRole maps roles to tracks', () => {
  assert.equal(trackForRole('researcher'), 'research');
  assert.equal(trackForRole('reviewer'), 'review');
  assert.equal(trackForRole('curator'), 'curation');
  assert.equal(trackForRole('admin'), 'governance');
  assert.equal(trackForRole('viewer'), 'viewer');
  assert.equal(trackForRole(null), 'viewer');
});

test('each track gates on a reputation category', () => {
  assert.equal(TRACK_REPUTATION.research, 'research_reputation');
  assert.equal(TRACK_REPUTATION.review, 'review_reputation');
});

test('new contributor starts at level 1 with a next rank', () => {
  const p = rankProgress('viewer', 0, 0, ZERO);
  assert.equal(p.current.name, 'Viewer');
  assert.equal(p.next?.name, 'Contributor');
  assert.equal(p.xpToNext, 100);
  assert.equal(p.reputationToNext, 40);
});

test('advancing to Contributor needs XP + reputation (no admin approval)', () => {
  const below = rankProgress('viewer', 100, 30, ZERO); // reputation short
  assert.equal(below.current.name, 'Viewer');
  const ok = rankProgress('viewer', 100, 40, ZERO);
  assert.equal(ok.current.name, 'Contributor');
  assert.equal(ok.needsAdminApproval, true); // next rank (Trusted) is approval-gated
});

test('admin-approval ranks do NOT auto-advance even when XP/rep/badges are met', () => {
  const metrics = { ...ZERO, accepted_signals: 30 }; // earns signal_hunter
  const noGrant = rankProgress('viewer', 1000, 90, metrics, 1);
  assert.equal(noGrant.current.name, 'Contributor'); // capped below Trusted (approval-gated)
  const granted = rankProgress('viewer', 1000, 90, metrics, 3);
  assert.equal(granted.current.name, 'Trusted Contributor');
});

test('missing required badge blocks the next rank', () => {
  // research II requires signal_hunter (25 accepted)
  const p = rankProgress('research', 600, 60, ZERO);
  assert.equal(p.current.name, 'Researcher I');
  assert.ok(p.missingBadges.includes('signal_hunter'));
});
