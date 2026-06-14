import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computePerformance, perActorThroughput, type WorkEvent } from '../src/index';

const NOW = '2026-06-13T12:00:00.000Z';

function ev(o: Partial<WorkEvent> = {}): WorkEvent {
  return { type: 'completed', at: '2026-06-10T12:00:00.000Z', ...o };
}

test('counts by type within the window', () => {
  const m = computePerformance([
    ev({ type: 'completed' }), ev({ type: 'completed' }),
    ev({ type: 'reviewed' }), ev({ type: 'published' }), ev({ type: 'escalated' }),
  ], { now: NOW });
  assert.equal(m.casesCompleted, 2);
  assert.equal(m.reviewThroughput, 1);
  assert.equal(m.publicationThroughput, 1);
  assert.equal(m.escalationVolume, 1);
});

test('events outside the window are ignored', () => {
  const m = computePerformance([
    ev({ type: 'completed', at: '2026-06-10T12:00:00.000Z' }),
    ev({ type: 'completed', at: '2026-01-01T00:00:00.000Z' }),
  ], { now: NOW, windowDays: 30 });
  assert.equal(m.casesCompleted, 1);
});

test('avg response + completion times', () => {
  const m = computePerformance([
    ev({ type: 'completed', responseMs: 1000, completionMs: 4000 }),
    ev({ type: 'completed', responseMs: 3000, completionMs: 8000 }),
  ], { now: NOW });
  assert.equal(m.avgResponseMs, 2000);
  assert.equal(m.avgCompletionMs, 6000);
});

test('avg null when no timing data', () => {
  const m = computePerformance([ev({ type: 'reviewed' })], { now: NOW });
  assert.equal(m.avgResponseMs, null);
  assert.equal(m.avgCompletionMs, null);
});

test('backlog reduction = completed - assigned', () => {
  const m = computePerformance([
    ev({ type: 'completed' }), ev({ type: 'completed' }), ev({ type: 'completed' }),
    ev({ type: 'assigned' }),
  ], { now: NOW });
  assert.equal(m.backlogReduction, 2);
});

test('negative backlog reduction when more assigned than completed', () => {
  const m = computePerformance([ev({ type: 'completed' }), ev({ type: 'assigned' }), ev({ type: 'assigned' })], { now: NOW });
  assert.equal(m.backlogReduction, -1);
});

test('empty events → zeros + nulls', () => {
  const m = computePerformance([], { now: NOW });
  assert.equal(m.casesCompleted, 0);
  assert.equal(m.avgResponseMs, null);
  assert.equal(m.backlogReduction, 0);
});

test('metrics are informational (no gamification note)', () => {
  const m = computePerformance([], { now: NOW });
  assert.match(m.note, /not a ranking|informational/i);
});

test('windowDays is reported', () => {
  assert.equal(computePerformance([], { now: NOW, windowDays: 7 }).windowDays, 7);
});

test('perActorThroughput sorts alphabetically (not ranked)', () => {
  const rows = perActorThroughput([
    ev({ type: 'completed', actor: 'zoe' }),
    ev({ type: 'completed', actor: 'amy' }),
    ev({ type: 'reviewed', actor: 'amy' }),
  ], { now: NOW });
  assert.equal(rows[0].actor, 'amy');
  assert.equal(rows[1].actor, 'zoe');
  assert.equal(rows[0].completed, 1);
  assert.equal(rows[0].reviewed, 1);
});

test('perActorThroughput ignores actorless + out-of-window', () => {
  const rows = perActorThroughput([
    ev({ type: 'completed' }),
    ev({ type: 'completed', actor: 'amy', at: '2026-01-01T00:00:00.000Z' }),
  ], { now: NOW });
  assert.equal(rows.length, 0);
});

test('deterministic', () => {
  const events = [ev({ type: 'completed', responseMs: 100 }), ev({ type: 'reviewed' })];
  assert.deepEqual(computePerformance(events, { now: NOW }), computePerformance(events, { now: NOW }));
});
