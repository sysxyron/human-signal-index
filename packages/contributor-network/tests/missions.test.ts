import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MISSION_TEMPLATES, missionsForRole, missionTemplate, missionView, isClaimable,
} from '../src/missions';

const NOW = '2026-06-14T12:00:00.000Z';

test('templates exist for every role', () => {
  for (const role of ['viewer', 'researcher', 'reviewer', 'curator', 'admin']) {
    assert.ok(missionsForRole(role).length > 0, role);
  }
});

test('missionsForRole defaults to viewer for null', () => {
  assert.ok(missionsForRole(null).every((m) => m.role === 'viewer'));
});

test('mission ids are unique', () => {
  const ids = MISSION_TEMPLATES.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('not_started when no progress', () => {
  const t = missionTemplate('viewer_explore')!;
  const v = missionView({ template: t, progress: {}, now: NOW });
  assert.equal(v.status, 'not_started');
  assert.equal(v.percent, 0);
});

test('in_progress + percent computed across steps', () => {
  const t = missionTemplate('viewer_explore')!; // 3 + 2 + 3 = 8 target
  const v = missionView({ template: t, progress: { signals: 3, follow: 1, trails: 0 }, now: NOW });
  assert.equal(v.status, 'in_progress');
  assert.equal(v.percent, Math.round((4 / 8) * 100));
});

test('completed when all steps meet target; claimable', () => {
  const t = missionTemplate('viewer_explore')!;
  const v = missionView({ template: t, progress: { signals: 5, follow: 2, trails: 3 }, now: NOW });
  assert.equal(v.status, 'completed');
  assert.equal(v.percent, 100);
  assert.ok(isClaimable(v));
});

test('claimed overrides completed; not claimable', () => {
  const t = missionTemplate('viewer_explore')!;
  const v = missionView({ template: t, progress: { signals: 5, follow: 2, trails: 3 }, claimed: true, now: NOW });
  assert.equal(v.status, 'claimed');
  assert.ok(!isClaimable(v));
});

test('expired when deadline passed and not complete', () => {
  const t = missionTemplate('viewer_explore')!;
  const v = missionView({ template: t, progress: { signals: 1 }, expiredAt: '2026-06-13T00:00:00.000Z', now: NOW });
  assert.equal(v.status, 'expired');
});

test('progress is clamped to target (no overflow percent)', () => {
  const t = missionTemplate('viewer_explore')!;
  const v = missionView({ template: t, progress: { signals: 99, follow: 99, trails: 99 }, now: NOW });
  assert.equal(v.percent, 100);
});
