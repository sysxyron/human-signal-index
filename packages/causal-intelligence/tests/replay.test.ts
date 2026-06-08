import { test } from 'node:test';
import assert from 'node:assert/strict';

import { captureNarrativeSnapshot, evolutionSeries } from '@hsi/temporal-intelligence';
import type { NarrativeSnapshot, NarrativeStats } from '@hsi/temporal-intelligence';

import { buildReplayFrames, frameForTimestamp, milestoneFrames } from '../src/replay';
import { detectNarrativeMilestones } from '../src/milestones';
import { detectCausalEvents } from '../src/events';
import { DEMO_CAUSAL_INPUTS } from '../src/fixtures';
import type { CausalInput } from '../src/types';

const NOW = '2026-03-01T00:00:00.000Z';

function daysBefore(d: number): string {
  return new Date(Date.parse(NOW) - d * 86400000).toISOString();
}

function mk(ageDays: number, stats: Partial<NarrativeStats>): NarrativeSnapshot {
  const base: NarrativeStats = {
    narrativeId: 'n1',
    signalCount: 0,
    sourceCount: 0,
    communityCount: 0,
    amplificationScore: 0,
    reliabilityScore: 50,
    supportRatio: 0.5,
    contradictionRatio: 0.1,
  };
  return captureNarrativeSnapshot({ ...base, ...stats }, daysBefore(ageDays));
}

function input(snaps: NarrativeSnapshot[]): CausalInput {
  return { narrativeId: 'n1', snapshots: snaps, evolution: evolutionSeries(snaps, NOW), now: NOW };
}

const SNAPS = [
  mk(28, { signalCount: 5, sourceCount: 1, communityCount: 1, amplificationScore: 20 }),
  mk(21, { signalCount: 12, sourceCount: 3, communityCount: 2, amplificationScore: 42 }),
  mk(14, { signalCount: 30, sourceCount: 5, communityCount: 4, amplificationScore: 72 }),
  mk(7, { signalCount: 40, sourceCount: 6, communityCount: 5, amplificationScore: 90 }),
];

test('daily cadence → one frame per snapshot, time-ordered', () => {
  const frames = buildReplayFrames(input(SNAPS), 'daily');
  assert.equal(frames.length, SNAPS.length);
  for (let i = 1; i < frames.length; i += 1) {
    assert.ok(Date.parse(frames[i].frameTimestamp) >= Date.parse(frames[i - 1].frameTimestamp));
  }
});

test('frame fields are populated from the snapshot', () => {
  const frames = buildReplayFrames(input(SNAPS), 'daily');
  const last = frames[frames.length - 1];
  assert.equal(last.signals, 40);
  assert.equal(last.sources, 6);
  assert.equal(last.communities, 5);
  assert.equal(last.amplification, 90);
  assert.equal(last.narrativeId, 'n1');
  assert.ok(typeof last.forecast === 'string');
  assert.ok(last.data.snapshotId);
});

test('event types fired in a window appear on the corresponding frame', () => {
  const i = input(SNAPS);
  const frames = buildReplayFrames(i, 'daily');
  const events = detectCausalEvents(i);
  // The second snapshot boundary should carry the events detected there.
  const boundaryTs = SNAPS[1].capturedAt;
  const frame = frames.find((f) => f.frameTimestamp === boundaryTs)!;
  const expected = events.filter((e) => e.occurredAt === boundaryTs).map((e) => e.eventType);
  assert.deepEqual(new Set(frame.events), new Set(expected));
  assert.ok(frame.events.length > 0);
});

test('changeType is populated from the evolution record', () => {
  const frames = buildReplayFrames(input(SNAPS), 'daily');
  // First frame has no prior → no changeType; later frames do.
  assert.equal(frames[0].changeType, undefined);
  assert.ok(frames.slice(1).some((f) => typeof f.changeType === 'string'));
});

test('frameForTimestamp returns the active (latest ≤ ts) frame', () => {
  const frames = buildReplayFrames(input(SNAPS), 'daily');
  // Exactly on a boundary.
  const exact = frameForTimestamp(frames, SNAPS[2].capturedAt);
  assert.equal(exact!.frameTimestamp, SNAPS[2].capturedAt);
  // Between boundaries → returns the earlier one.
  const between = new Date(Date.parse(SNAPS[1].capturedAt) + 86400000).toISOString();
  assert.equal(frameForTimestamp(frames, between)!.frameTimestamp, SNAPS[1].capturedAt);
  // Before everything → undefined.
  assert.equal(frameForTimestamp(frames, daysBefore(100)), undefined);
});

test('milestoneFrames maps each milestone to its active frame', () => {
  const i = input(SNAPS);
  const frames = buildReplayFrames(i, 'daily');
  const milestones = detectNarrativeMilestones(i, detectCausalEvents(i));
  const mapped = milestoneFrames(frames, milestones);
  assert.equal(mapped.length, milestones.length);
  for (const { milestone, frame } of mapped) {
    if (frame) {
      assert.ok(Date.parse(frame.frameTimestamp) <= Date.parse(milestone.occurredAt));
    }
  }
});

test('weekly cadence resamples (keeps first + last, thins the middle)', () => {
  // Many daily snapshots → weekly should collapse to fewer frames.
  const dense: NarrativeSnapshot[] = [];
  for (let d = 30; d >= 0; d -= 1) {
    dense.push(mk(d, { signalCount: 10 + (30 - d) }));
  }
  const i = input(dense);
  const weekly = buildReplayFrames(i, 'weekly');
  const daily = buildReplayFrames(i, 'daily');
  assert.ok(weekly.length < daily.length, 'weekly < daily frame count');
  // First + last preserved.
  assert.equal(weekly[0].frameTimestamp, daily[0].frameTimestamp);
  assert.equal(weekly[weekly.length - 1].frameTimestamp, daily[daily.length - 1].frameTimestamp);
});

test('influence in/out sums are reflected in frames', () => {
  const i: CausalInput = { ...DEMO_CAUSAL_INPUTS[0], now: NOW }; // ai-jobs has in+out edges
  const frames = buildReplayFrames(i, 'daily');
  assert.ok(frames[0].influenceIn > 0);
  assert.ok(frames[0].influenceOut > 0);
});

test('replay is deterministic', () => {
  const i = input(SNAPS);
  assert.deepEqual(buildReplayFrames(i, 'weekly'), buildReplayFrames(i, 'weekly'));
});

test('two-snapshot history is not resampled away', () => {
  const i = input([mk(14, { signalCount: 5 }), mk(7, { signalCount: 9 })]);
  assert.equal(buildReplayFrames(i, 'monthly').length, 2);
});
