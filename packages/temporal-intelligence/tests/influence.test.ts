import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildInfluenceNetwork, topInfluencers } from '../src/influence';
import { captureNarrativeSnapshot } from '../src/snapshots';
import type {
  NarrativeInput,
  NarrativeSnapshot,
  NarrativeStats,
  TemporalDeps,
} from '../src/types';

const NOW = '2026-02-01T00:00:00.000Z';
const deps: TemporalDeps = { now: NOW };

function days(n: number): string {
  return new Date(Date.parse(NOW) - n * 86400000).toISOString();
}

function snap(
  narrativeId: string,
  ageDays: number,
  s: Partial<NarrativeStats>,
): NarrativeSnapshot {
  const base: NarrativeStats = {
    narrativeId,
    signalCount: 0,
    sourceCount: 0,
    communityCount: 0,
    amplificationScore: 0,
    reliabilityScore: 0,
    supportRatio: 0,
    contradictionRatio: 0,
  };
  return captureNarrativeSnapshot({ ...base, ...s }, days(ageDays));
}

test('A→B when A precedes and shares sources/entities', () => {
  const narratives: NarrativeInput[] = [
    {
      id: 'A',
      name: 'A',
      signalIds: [],
      entityIds: ['e1', 'e2'],
      sourceIds: ['s1', 's2'],
      communityIds: ['c1'],
      firstSeenAt: days(20),
    },
    {
      id: 'B',
      name: 'B',
      signalIds: [],
      entityIds: ['e1', 'e2'],
      sourceIds: ['s1', 's2'],
      communityIds: ['c1'],
      firstSeenAt: days(5),
    },
  ];
  const snaps = [
    snap('A', 20, { amplificationScore: 20 }),
    snap('A', 12, { amplificationScore: 50 }), // A rises early
    snap('B', 5, { signalCount: 1 }),
    snap('B', 1, { signalCount: 10 }), // B grows after
  ];
  const edges = buildInfluenceNetwork(narratives, snaps, [], deps);
  const ab = edges.find((e) => e.sourceNarrativeId === 'A' && e.targetNarrativeId === 'B');
  assert.ok(ab, 'expected A→B influence');
  assert.ok(ab!.influenceScore > 0);
  // no backward edge
  assert.ok(!edges.some((e) => e.sourceNarrativeId === 'B' && e.targetNarrativeId === 'A'));
});

test('no influence when no overlap', () => {
  const narratives: NarrativeInput[] = [
    { id: 'A', name: 'A', signalIds: [], entityIds: ['x'], sourceIds: ['sa'], firstSeenAt: days(20) },
    { id: 'B', name: 'B', signalIds: [], entityIds: ['y'], sourceIds: ['sb'], firstSeenAt: days(5) },
  ];
  const edges = buildInfluenceNetwork(narratives, [], [], deps);
  assert.equal(edges.length, 0);
});

test('no backward influence when time-ordering forbids', () => {
  const narratives: NarrativeInput[] = [
    { id: 'late', name: 'L', signalIds: [], entityIds: ['e'], sourceIds: ['s'], firstSeenAt: days(5) },
    { id: 'early', name: 'E', signalIds: [], entityIds: ['e'], sourceIds: ['s'], firstSeenAt: days(20) },
  ];
  const edges = buildInfluenceNetwork(narratives, [], [], deps);
  // only early→late allowed
  assert.ok(edges.every((e) => e.sourceNarrativeId === 'early'));
});

test('score ordering: more overlap → higher score', () => {
  const narratives: NarrativeInput[] = [
    {
      id: 'A',
      name: 'A',
      signalIds: [],
      entityIds: ['e1', 'e2', 'e3', 'e4'],
      sourceIds: ['s1', 's2', 's3', 's4'],
      communityIds: ['c1', 'c2'],
      firstSeenAt: days(30),
    },
    {
      id: 'B',
      name: 'B',
      signalIds: [],
      entityIds: ['e1', 'e2', 'e3', 'e4'],
      sourceIds: ['s1', 's2', 's3', 's4'],
      communityIds: ['c1', 'c2'],
      firstSeenAt: days(20),
    },
    {
      id: 'C',
      name: 'C',
      signalIds: [],
      entityIds: ['e1'],
      sourceIds: ['s1'],
      communityIds: [],
      firstSeenAt: days(10),
    },
  ];
  const edges = buildInfluenceNetwork(narratives, [], [], deps);
  const ab = edges.find((e) => e.sourceNarrativeId === 'A' && e.targetNarrativeId === 'B');
  const ac = edges.find((e) => e.sourceNarrativeId === 'A' && e.targetNarrativeId === 'C');
  assert.ok(ab && ac);
  assert.ok(ab!.influenceScore > ac!.influenceScore);
});

test('influence chain A→B→C', () => {
  const narratives: NarrativeInput[] = [
    { id: 'A', name: 'A', signalIds: [], entityIds: ['e1', 'e2'], sourceIds: ['s1', 's2'], firstSeenAt: days(30) },
    { id: 'B', name: 'B', signalIds: [], entityIds: ['e1', 'e2'], sourceIds: ['s1', 's2'], firstSeenAt: days(20) },
    { id: 'C', name: 'C', signalIds: [], entityIds: ['e1', 'e2'], sourceIds: ['s1', 's2'], firstSeenAt: days(10) },
  ];
  const edges = buildInfluenceNetwork(narratives, [], [], deps);
  assert.ok(edges.some((e) => e.sourceNarrativeId === 'A' && e.targetNarrativeId === 'B'));
  assert.ok(edges.some((e) => e.sourceNarrativeId === 'B' && e.targetNarrativeId === 'C'));
});

test('topInfluencers: ranks by total out-score, honors k', () => {
  const narratives: NarrativeInput[] = [
    { id: 'A', name: 'A', signalIds: [], entityIds: ['e1', 'e2'], sourceIds: ['s1', 's2'], firstSeenAt: days(30) },
    { id: 'B', name: 'B', signalIds: [], entityIds: ['e1', 'e2'], sourceIds: ['s1', 's2'], firstSeenAt: days(20) },
    { id: 'C', name: 'C', signalIds: [], entityIds: ['e1', 'e2'], sourceIds: ['s1', 's2'], firstSeenAt: days(10) },
  ];
  const edges = buildInfluenceNetwork(narratives, [], [], deps);
  const top = topInfluencers(edges);
  assert.ok(top.length >= 1);
  // A influences both B and C, so it should rank first
  assert.equal(top[0].narrativeId, 'A');
  const top1 = topInfluencers(edges, 1);
  assert.equal(top1.length, 1);
  // sorted descending
  for (let i = 1; i < top.length; i += 1) {
    assert.ok(top[i - 1].outScore >= top[i].outScore);
  }
});

test('amplification transfer adds to score', () => {
  const narratives: NarrativeInput[] = [
    { id: 'A', name: 'A', signalIds: [], entityIds: ['e1'], sourceIds: ['s1'], firstSeenAt: days(20) },
    { id: 'B', name: 'B', signalIds: [], entityIds: ['e1'], sourceIds: ['s1'], firstSeenAt: days(5) },
  ];
  const withTransfer = [
    snap('A', 20, { amplificationScore: 10 }),
    snap('A', 15, { amplificationScore: 40 }), // rise at day-15
    snap('B', 5, { signalCount: 1 }),
    snap('B', 1, { signalCount: 10 }), // growth after A rose
  ];
  const noSnaps = buildInfluenceNetwork(narratives, [], [], deps);
  const withSnaps = buildInfluenceNetwork(narratives, withTransfer, [], deps);
  const a1 = noSnaps.find((e) => e.sourceNarrativeId === 'A')!;
  const a2 = withSnaps.find((e) => e.sourceNarrativeId === 'A')!;
  assert.ok(a2.influenceScore > a1.influenceScore);
  assert.ok(a2.rationale.includes('amplification rose'));
});

test('deterministic: identical edges across runs', () => {
  const narratives: NarrativeInput[] = [
    { id: 'A', name: 'A', signalIds: [], entityIds: ['e1'], sourceIds: ['s1'], firstSeenAt: days(20) },
    { id: 'B', name: 'B', signalIds: [], entityIds: ['e1'], sourceIds: ['s1'], firstSeenAt: days(5) },
  ];
  const e1 = buildInfluenceNetwork(narratives, [], [], deps);
  const e2 = buildInfluenceNetwork(narratives, [], [], deps);
  assert.deepEqual(e1, e2);
});
