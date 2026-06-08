import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  amplificationAcceleration,
  computeNarrativeEvolution,
  evolutionSeries,
  signalVelocity,
} from '../src/evolution';
import { captureNarrativeSnapshot } from '../src/snapshots';
import type { NarrativeSnapshot, NarrativeStats } from '../src/types';

const NOW = '2026-02-01T00:00:00.000Z';

function mk(
  id: string,
  capturedAt: string,
  stats: Partial<NarrativeStats>,
  metadata?: Record<string, unknown>,
): NarrativeSnapshot {
  const base: NarrativeStats = {
    narrativeId: 'n1',
    signalCount: 0,
    sourceCount: 0,
    communityCount: 0,
    amplificationScore: 0,
    reliabilityScore: 0,
    supportRatio: 0,
    contradictionRatio: 0,
  };
  return captureNarrativeSnapshot({ ...base, ...stats }, capturedAt, { id, metadata });
}

test('growth: 100→300 signals = +200% growth', () => {
  const prev = mk('p', '2026-01-01T00:00:00.000Z', { signalCount: 100, amplificationScore: 20 });
  const curr = mk('c', '2026-01-08T00:00:00.000Z', { signalCount: 300, amplificationScore: 55 });
  const evo = computeNarrativeEvolution(prev, curr, NOW);
  assert.equal(evo.growthPct, 200);
  assert.equal(evo.changeType, 'growth');
  assert.equal(evo.amplificationDelta, 35);
  // reasoning includes the percentage string
  assert.ok(evo.reasoning.some((r) => r.includes('+200%')));
  assert.ok(evo.reasoning.some((r) => r.includes('100→300 signals')));
});

test('decline: signals drop materially', () => {
  const prev = mk('p', '2026-01-01T00:00:00.000Z', { signalCount: 100, amplificationScore: 60 });
  const curr = mk('c', '2026-01-08T00:00:00.000Z', { signalCount: 30, amplificationScore: 25 });
  const evo = computeNarrativeEvolution(prev, curr, NOW);
  assert.equal(evo.changeType, 'decline');
  assert.equal(evo.growthPct, -70);
  assert.ok(evo.amplificationDelta < 0);
});

test('split: breadth jumps while amplification diverges', () => {
  const prev = mk('p', '2026-01-01T00:00:00.000Z', {
    signalCount: 10,
    sourceCount: 2,
    communityCount: 1,
    amplificationScore: 60,
  });
  const curr = mk('c', '2026-01-08T00:00:00.000Z', {
    signalCount: 14,
    sourceCount: 6,
    communityCount: 4,
    amplificationScore: 45,
  });
  const evo = computeNarrativeEvolution(prev, curr, NOW);
  assert.equal(evo.changeType, 'split');
  assert.equal(evo.communityDelta, 3);
  assert.equal(evo.sourceDelta, 4);
});

test('merge: communities converge while signals & sources rise', () => {
  const prev = mk('p', '2026-01-01T00:00:00.000Z', {
    signalCount: 4,
    sourceCount: 2,
    communityCount: 3,
    amplificationScore: 30,
  });
  const curr = mk('c', '2026-01-08T00:00:00.000Z', {
    signalCount: 16,
    sourceCount: 5,
    communityCount: 1,
    amplificationScore: 38,
  });
  const evo = computeNarrativeEvolution(prev, curr, NOW);
  assert.equal(evo.changeType, 'merge');
  assert.equal(evo.communityDelta, -2);
});

test('mutation: category shift with modest growth', () => {
  const prev = mk('p', '2026-01-01T00:00:00.000Z', { signalCount: 10 }, { category: 'economy' });
  const curr = mk('c', '2026-01-08T00:00:00.000Z', { signalCount: 11 }, { category: 'politics' });
  const evo = computeNarrativeEvolution(prev, curr, NOW);
  assert.equal(evo.changeType, 'mutation');
  assert.ok(evo.reasoning.some((r) => r.includes('category')));
});

test('mutation: contradiction stance swing without size change', () => {
  const prev = mk('p', '2026-01-01T00:00:00.000Z', { signalCount: 10, contradictionRatio: 0.1 }, { category: 'x' });
  const curr = mk('c', '2026-01-08T00:00:00.000Z', { signalCount: 11, contradictionRatio: 0.5 }, { category: 'x' });
  const evo = computeNarrativeEvolution(prev, curr, NOW);
  assert.equal(evo.changeType, 'mutation');
  assert.ok(Math.abs(evo.contradictionDelta - 0.4) < 1e-9);
});

test('deltas: all six deltas computed correctly', () => {
  const prev = mk('p', '2026-01-01T00:00:00.000Z', {
    signalCount: 10,
    sourceCount: 2,
    communityCount: 2,
    amplificationScore: 30,
    reliabilityScore: 50,
    contradictionRatio: 0.2,
  });
  const curr = mk('c', '2026-01-08T00:00:00.000Z', {
    signalCount: 20,
    sourceCount: 5,
    communityCount: 3,
    amplificationScore: 45,
    reliabilityScore: 55,
    contradictionRatio: 0.3,
  });
  const evo = computeNarrativeEvolution(prev, curr, NOW);
  assert.equal(evo.sourceDelta, 3);
  assert.equal(evo.communityDelta, 1);
  assert.equal(evo.amplificationDelta, 15);
  assert.equal(evo.reliabilityDelta, 5);
  assert.ok(Math.abs(evo.contradictionDelta - 0.1) < 1e-9);
});

test('confidence: in [0,1] and higher for large consistent moves', () => {
  const small = computeNarrativeEvolution(
    mk('p', '2026-01-01T00:00:00.000Z', { signalCount: 10, amplificationScore: 10 }),
    mk('c', '2026-01-08T00:00:00.000Z', { signalCount: 11, amplificationScore: 11 }),
    NOW,
  );
  const big = computeNarrativeEvolution(
    mk('p', '2026-01-01T00:00:00.000Z', { signalCount: 10, amplificationScore: 10, sourceCount: 1 }),
    mk('c', '2026-01-08T00:00:00.000Z', { signalCount: 200, amplificationScore: 60, sourceCount: 6 }),
    NOW,
  );
  assert.ok(small.confidence >= 0 && small.confidence <= 1);
  assert.ok(big.confidence >= 0 && big.confidence <= 1);
  assert.ok(big.confidence > small.confidence);
});

test('evolutionSeries: pairwise over ordered history', () => {
  const snaps = [
    mk('s3', '2026-01-15T00:00:00.000Z', { signalCount: 30 }),
    mk('s1', '2026-01-01T00:00:00.000Z', { signalCount: 10 }),
    mk('s2', '2026-01-08T00:00:00.000Z', { signalCount: 20 }),
  ];
  const series = evolutionSeries(snaps, NOW);
  assert.equal(series.length, 2);
  // ordered by time → first pair s1→s2
  assert.equal(series[0].parentSnapshotId, 's1');
  assert.equal(series[0].childSnapshotId, 's2');
  assert.equal(series[1].childSnapshotId, 's3');
});

test('signalVelocity: signals/day over the window', () => {
  const snaps = [
    mk('s1', '2026-01-01T00:00:00.000Z', { signalCount: 10 }),
    mk('s2', '2026-01-11T00:00:00.000Z', { signalCount: 110 }),
  ];
  // 100 signals over 10 days = 10/day
  assert.equal(signalVelocity(snaps), 10);
  assert.equal(signalVelocity([snaps[0]]), 0);
});

test('amplificationAcceleration: positive when accelerating', () => {
  const accelerating = [
    mk('s1', '2026-01-01T00:00:00.000Z', { amplificationScore: 10 }),
    mk('s2', '2026-01-02T00:00:00.000Z', { amplificationScore: 15 }), // +5
    mk('s3', '2026-01-03T00:00:00.000Z', { amplificationScore: 30 }), // +15
  ];
  const decelerating = [
    mk('s1', '2026-01-01T00:00:00.000Z', { amplificationScore: 10 }),
    mk('s2', '2026-01-02T00:00:00.000Z', { amplificationScore: 30 }), // +20
    mk('s3', '2026-01-03T00:00:00.000Z', { amplificationScore: 35 }), // +5
  ];
  assert.ok(amplificationAcceleration(accelerating) > 0);
  assert.ok(amplificationAcceleration(decelerating) < 0);
  assert.equal(amplificationAcceleration([accelerating[0]]), 0);
});
