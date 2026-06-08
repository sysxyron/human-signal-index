import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  captureNarrativeSnapshot,
  captureSnapshots,
  dueForCadence,
  statsFromNarrative,
} from '../src/snapshots';
import type { NarrativeInput, NarrativeStats, SignalInput } from '../src/types';

const NOW = '2026-02-01T00:00:00.000Z';

const baseStats: NarrativeStats = {
  narrativeId: 'n1',
  signalCount: 5,
  sourceCount: 2,
  communityCount: 1,
  amplificationScore: 40,
  reliabilityScore: 60,
  supportRatio: 0.6,
  contradictionRatio: 0.1,
};

test('captureNarrativeSnapshot: stamps now + derives a stable id', () => {
  const s1 = captureNarrativeSnapshot(baseStats, NOW);
  const s2 = captureNarrativeSnapshot(baseStats, NOW);
  assert.equal(s1.capturedAt, NOW);
  assert.equal(s1.id, s2.id); // deterministic id
  assert.match(s1.id, /^snap_n1_/);
  assert.equal(s1.signalCount, 5);
});

test('captureNarrativeSnapshot: honors explicit id + metadata', () => {
  const s = captureNarrativeSnapshot(baseStats, NOW, {
    id: 'custom',
    metadata: { category: 'econ' },
  });
  assert.equal(s.id, 'custom');
  assert.deepEqual(s.metadata, { category: 'econ' });
});

test('captureNarrativeSnapshot: clamps out-of-range scores', () => {
  const s = captureNarrativeSnapshot(
    { ...baseStats, amplificationScore: 150, supportRatio: 2, contradictionRatio: -1 },
    NOW,
  );
  assert.equal(s.amplificationScore, 100);
  assert.equal(s.supportRatio, 1);
  assert.equal(s.contradictionRatio, 0);
});

test('statsFromNarrative: derives signalCount/sourceCount from inputs', () => {
  const narrative: NarrativeInput = {
    id: 'n1',
    name: 'n',
    signalIds: ['a', 'b', 'c'],
    sourceIds: ['srcX'],
  };
  const signals: SignalInput[] = [
    { id: 'a', sourceId: 'src1' },
    { id: 'b', sourceId: 'src2' },
    { id: 'z', narrativeId: 'n1', sourceId: 'src3' },
  ];
  const stats = statsFromNarrative(narrative, signals);
  // signalIds=3, owned (a,b,z)=3 → max=3 (well, a,b in idSet + z tagged = 3)
  assert.equal(stats.signalCount, 3);
  // sources: srcX (declared) + src1 + src2 + src3 = 4
  assert.equal(stats.sourceCount, 4);
});

test('statsFromNarrative: applies extras', () => {
  const stats = statsFromNarrative(
    { id: 'n', name: 'n', signalIds: ['a'] },
    [{ id: 'a', sourceId: 's' }],
    { amplificationScore: 50, reliabilityScore: 70, communityCount: 3, supportRatio: 0.8, contradictionRatio: 0.2 },
  );
  assert.equal(stats.amplificationScore, 50);
  assert.equal(stats.communityCount, 3);
  assert.equal(stats.supportRatio, 0.8);
});

test('captureSnapshots: one per narrative with cadence metadata', () => {
  const narratives: NarrativeInput[] = [
    { id: 'n1', name: 'A', signalIds: ['a'] },
    { id: 'n2', name: 'B', signalIds: ['b', 'c'] },
  ];
  const signals: SignalInput[] = [
    { id: 'a', sourceId: 's1' },
    { id: 'b', sourceId: 's2' },
    { id: 'c', sourceId: 's2' },
  ];
  const snaps = captureSnapshots(narratives, signals, NOW, 'weekly');
  assert.equal(snaps.length, 2);
  assert.equal(snaps[0].metadata?.cadence, 'weekly');
  assert.equal(snaps[1].signalCount, 2);
  assert.equal(snaps[1].sourceCount, 1);
});

test('dueForCadence: no prior capture → always due', () => {
  assert.equal(dueForCadence(undefined, NOW, 'daily'), true);
});

test('dueForCadence: daily boundary', () => {
  const oneDayBefore = '2026-01-31T00:00:00.000Z';
  const halfDayBefore = '2026-01-31T12:00:00.000Z';
  assert.equal(dueForCadence(oneDayBefore, NOW, 'daily'), true);
  assert.equal(dueForCadence(halfDayBefore, NOW, 'daily'), false);
});

test('dueForCadence: weekly boundary', () => {
  const sevenDaysBefore = '2026-01-25T00:00:00.000Z';
  const fiveDaysBefore = '2026-01-27T00:00:00.000Z';
  assert.equal(dueForCadence(sevenDaysBefore, NOW, 'weekly'), true);
  assert.equal(dueForCadence(fiveDaysBefore, NOW, 'weekly'), false);
});

test('dueForCadence: monthly boundary', () => {
  const thirtyDaysBefore = '2026-01-02T00:00:00.000Z';
  const tenDaysBefore = '2026-01-22T00:00:00.000Z';
  assert.equal(dueForCadence(thirtyDaysBefore, NOW, 'monthly'), true);
  assert.equal(dueForCadence(tenDaysBefore, NOW, 'monthly'), false);
});
