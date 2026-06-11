import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  bandForScore,
  clamp,
  clamp01,
  getTrustHistory,
  groupTrustHistory,
  recordTrustSnapshot,
  round,
  scoreSeries,
  snapshotFromTrustScore,
} from '../src/history';
import { FIXTURE_NOW, isoDay, seriesFromScores } from '../src/fixtures';
import type { TrustSnapshot } from '../src/types';

const NOW = FIXTURE_NOW;

test('clamp bounds a value', () => {
  assert.equal(clamp(150, 0, 100), 100);
  assert.equal(clamp(-5, 0, 100), 0);
  assert.equal(clamp(50, 0, 100), 50);
});

test('clamp NaN -> low', () => {
  assert.equal(clamp(NaN, 0, 100), 0);
});

test('clamp01 bounds to unit interval', () => {
  assert.equal(clamp01(2), 1);
  assert.equal(clamp01(-1), 0);
  assert.equal(clamp01(0.5), 0.5);
});

test('round to default 2 dp', () => {
  assert.equal(round(1.23456), 1.23);
});

test('round to custom dp', () => {
  assert.equal(round(1.23456, 4), 1.2346);
});

test('bandForScore high at 70', () => {
  assert.equal(bandForScore(70), 'high');
});

test('bandForScore medium at 40', () => {
  assert.equal(bandForScore(40), 'medium');
});

test('bandForScore low below 40', () => {
  assert.equal(bandForScore(39.9), 'low');
});

test('bandForScore clamps out-of-range', () => {
  assert.equal(bandForScore(200), 'high');
  assert.equal(bandForScore(-10), 'low');
});

test('recordTrustSnapshot clamps score and derives band', () => {
  const s = recordTrustSnapshot(
    { entityType: 'source', entityId: 'e', trustScore: 120 },
    { now: NOW },
  );
  assert.equal(s.trustScore, 100);
  assert.equal(s.band, 'high');
});

test('recordTrustSnapshot stamps now into at', () => {
  const s = recordTrustSnapshot(
    { entityType: 'source', entityId: 'e', trustScore: 50 },
    { now: NOW },
  );
  assert.equal(s.at, NOW);
});

test('recordTrustSnapshot defaults missing signals safely', () => {
  const s = recordTrustSnapshot(
    { entityType: 'narrative', entityId: 'n', trustScore: 55 },
    { now: NOW },
  );
  assert.equal(s.confidence, 0);
  assert.equal(s.calibrationScore, 0);
  assert.equal(s.evidenceCount, 0);
  assert.equal(s.band, 'medium');
});

test('recordTrustSnapshot floors evidenceCount', () => {
  const s = recordTrustSnapshot(
    { entityType: 'source', entityId: 'e', trustScore: 50, evidenceCount: 7.8 },
    { now: NOW },
  );
  assert.equal(s.evidenceCount, 7);
});

test('recordTrustSnapshot keeps a supplied id', () => {
  const s = recordTrustSnapshot(
    { entityType: 'source', entityId: 'e', trustScore: 50, id: 'snap-1' },
    { now: NOW },
  );
  assert.equal(s.id, 'snap-1');
});

test('recordTrustSnapshot omits id when not supplied', () => {
  const s = recordTrustSnapshot(
    { entityType: 'source', entityId: 'e', trustScore: 50 },
    { now: NOW },
  );
  assert.equal(s.id, undefined);
});

test('recordTrustSnapshot is deterministic', () => {
  const a = recordTrustSnapshot(
    { entityType: 'source', entityId: 'e', trustScore: 63, confidence: 0.5 },
    { now: NOW },
  );
  const b = recordTrustSnapshot(
    { entityType: 'source', entityId: 'e', trustScore: 63, confidence: 0.5 },
    { now: NOW },
  );
  assert.deepEqual(a, b);
});

test('snapshotFromTrustScore maps engine fields', () => {
  const s = snapshotFromTrustScore(
    {
      entityType: 'decision',
      entityId: 'd1',
      trustScore: 72,
      confidence: 0.8,
      evidenceCount: 12,
      calibrationScore: 0.66,
      band: 'high',
      explanation: [],
      limitations: [],
      lastUpdated: NOW,
    },
    { now: NOW },
  );
  assert.equal(s.entityType, 'decision');
  assert.equal(s.trustScore, 72);
  assert.equal(s.calibrationScore, 0.66);
  assert.equal(s.evidenceCount, 12);
  assert.equal(s.band, 'high');
});

function pool(): TrustSnapshot[] {
  return [
    ...seriesFromScores('source', 'a', [50, 55, 60]),
    ...seriesFromScores('narrative', 'b', [40, 45]),
    ...seriesFromScores('source', 'c', [70, 72, 74, 76]),
  ];
}

test('getTrustHistory filters to one entity', () => {
  const h = getTrustHistory(pool(), { entityType: 'source', entityId: 'a' });
  assert.equal(h.length, 3);
  assert.ok(h.every((s) => s.entityId === 'a'));
});

test('getTrustHistory returns empty for an unknown entity', () => {
  const h = getTrustHistory(pool(), { entityType: 'source', entityId: 'zzz' });
  assert.equal(h.length, 0);
});

test('getTrustHistory sorts ascending by time', () => {
  const unsorted: TrustSnapshot[] = [
    recordTrustSnapshot({ entityType: 'source', entityId: 'x', trustScore: 60, id: '1' }, { now: isoDay(3) }),
    recordTrustSnapshot({ entityType: 'source', entityId: 'x', trustScore: 50, id: '0' }, { now: isoDay(1) }),
    recordTrustSnapshot({ entityType: 'source', entityId: 'x', trustScore: 70, id: '2' }, { now: isoDay(5) }),
  ];
  const h = getTrustHistory(unsorted, { entityType: 'source', entityId: 'x' });
  assert.deepEqual(h.map((s) => s.trustScore), [50, 60, 70]);
});

test('getTrustHistory respects a limit (keeps most recent)', () => {
  const h = getTrustHistory(pool(), { entityType: 'source', entityId: 'c', limit: 2 });
  assert.equal(h.length, 2);
  assert.deepEqual(h.map((s) => s.trustScore), [74, 76]);
});

test('getTrustHistory does not mutate its input', () => {
  const p = pool();
  const before = p.map((s) => s.trustScore);
  getTrustHistory(p, { entityType: 'source', entityId: 'a' });
  assert.deepEqual(p.map((s) => s.trustScore), before);
});

test('groupTrustHistory buckets per entity', () => {
  const g = groupTrustHistory(pool());
  assert.equal(g.get('source:a')?.length, 3);
  assert.equal(g.get('narrative:b')?.length, 2);
  assert.equal(g.get('source:c')?.length, 4);
});

test('groupTrustHistory sorts each bucket ascending', () => {
  const g = groupTrustHistory(pool());
  const c = g.get('source:c')!;
  assert.deepEqual(c.map((s) => s.trustScore), [70, 72, 74, 76]);
});

test('scoreSeries extracts the score series', () => {
  const h = getTrustHistory(pool(), { entityType: 'source', entityId: 'a' });
  assert.deepEqual(scoreSeries(h), [50, 55, 60]);
});

test('getTrustHistory zero limit -> empty', () => {
  const h = getTrustHistory(pool(), { entityType: 'source', entityId: 'a', limit: 0 });
  assert.equal(h.length, 0);
});
