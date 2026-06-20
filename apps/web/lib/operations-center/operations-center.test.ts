import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ratioStatus, inverseRatioStatus, backlogStatus, overallMission, statusRank } from './mission';
import { buildAttentionQueue, severityRank, type AttentionInputs } from './attention';
import { windowCounts, withinDays } from './timeline';
import { MISSION_STATUSES, type MissionDomain } from './types';

const NOW = '2026-06-20T00:00:00.000Z';
const daysAgo = (d: number) => new Date(new Date(NOW).getTime() - d * 86400000).toISOString();

// ---- mission status (Step 13, deterministic thresholds) --------------------

test('ratioStatus: higher is better', () => {
  assert.equal(ratioStatus(8, 10), 'GREEN');   // 0.8
  assert.equal(ratioStatus(5, 10), 'YELLOW');  // 0.5
  assert.equal(ratioStatus(2, 10), 'RED');     // 0.2
  assert.equal(ratioStatus(0, 0), 'YELLOW');   // empty universe
});
test('inverseRatioStatus: lower is better', () => {
  assert.equal(inverseRatioStatus(0, 10), 'GREEN');
  assert.equal(inverseRatioStatus(2, 10), 'YELLOW'); // 0.2
  assert.equal(inverseRatioStatus(5, 10), 'RED');    // 0.5
  assert.equal(inverseRatioStatus(0, 0), 'GREEN');   // nothing bad, nothing exists
});
test('backlogStatus: absolute thresholds', () => {
  assert.equal(backlogStatus(5), 'GREEN');
  assert.equal(backlogStatus(25), 'YELLOW');
  assert.equal(backlogStatus(100), 'RED');
});
test('overallMission: worst domain wins; all valid statuses', () => {
  const d = (status: 'GREEN' | 'YELLOW' | 'RED'): MissionDomain => ({ key: 'k', label: 'L', status, detail: '' });
  assert.equal(overallMission([d('GREEN'), d('YELLOW'), d('GREEN')]), 'YELLOW');
  assert.equal(overallMission([d('GREEN'), d('RED')]), 'RED');
  assert.equal(overallMission([d('GREEN'), d('GREEN')]), 'GREEN');
  assert.equal(overallMission([]), 'YELLOW');
  assert.ok(statusRank('RED') > statusRank('GREEN'));
  for (const s of MISSION_STATUSES) assert.ok(['GREEN', 'YELLOW', 'RED'].includes(s));
});

// ---- attention queue (Step 4, deterministic) -------------------------------

function inputs(over: Partial<AttentionInputs> = {}): AttentionInputs {
  return { blockedSources: 0, offlineSources: 0, missingFeeds: 0, lowTrustSources: 0, blindSpots: 0, forecastsAwaitingReview: 0, narrativesMissingEvidence: 0, signalsMissingAttribution: 0, missingGeoSources: 0, brokenTransparencyChains: 0, ...over };
}
test('attention: only conditions with count>0 appear', () => {
  const q = buildAttentionQueue(inputs({ blockedSources: 2 }));
  assert.equal(q.length, 1); assert.equal(q[0].key, 'blockedSources'); assert.equal(q[0].count, 2);
});
test('attention: empty inputs → empty queue (no fabricated items)', () => {
  assert.deepEqual(buildAttentionQueue(inputs()), []);
});
test('attention: ordered by severity, then count desc', () => {
  const q = buildAttentionQueue(inputs({ blockedSources: 1, missingFeeds: 9, offlineSources: 3, lowTrustSources: 100 }));
  // critical first (blocked, offline), then medium (missingFeeds, lowTrust)
  assert.equal(q[0].key, 'offlineSources'); // critical, count 3 > blocked 1
  assert.equal(q[1].key, 'blockedSources'); // critical, count 1
  assert.equal(q[2].key, 'lowTrustSources'); // medium, count 100 > missingFeeds 9
  assert.equal(q[3].key, 'missingFeeds');
  assert.ok(severityRank('critical') < severityRank('low'));
});
test('attention: every item carries an href + detail for traceability', () => {
  for (const i of buildAttentionQueue(inputs({ blockedSources: 1, missingGeoSources: 1, forecastsAwaitingReview: 1 }))) {
    assert.ok(i.href.startsWith('/')); assert.ok(i.detail.length > 0);
  }
});

// ---- timeline (Step 11) ----------------------------------------------------

test('windowCounts: last7 ⊆ last30; out-of-range excluded', () => {
  const ts = [daysAgo(1), daysAgo(3), daysAgo(20), daysAgo(45), null];
  const w = windowCounts(ts, NOW);
  assert.equal(w.last7, 2); assert.equal(w.last30, 3);
});
test('withinDays: future + invalid excluded', () => {
  assert.equal(withinDays(daysAgo(-1), NOW, 7), false); // future
  assert.equal(withinDays('not-a-date', NOW, 7), false);
  assert.equal(withinDays(daysAgo(2), NOW, 7), true);
});
