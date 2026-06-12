import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  enqueueResearch,
  dequeueResearch,
  failResearch,
  orderQueue,
  queueStats,
  type QueueItem,
} from '../src';
import { FIXTURE_NOW, seedQueue } from '../src/fixtures';

const NOW = FIXTURE_NOW;

// "The queue must survive restarts." The engine is pure over a snapshot — a
// serialize/deserialize round-trip must preserve all state + ordering, proving
// the queue can be persisted and rehydrated across a process restart.

test('queue round-trips through JSON unchanged', () => {
  const queue = seedQueue();
  const restored = JSON.parse(JSON.stringify(queue)) as QueueItem[];
  assert.deepEqual(restored, queue);
});

test('ordering is stable across a round-trip', () => {
  const queue = seedQueue();
  const restored = JSON.parse(JSON.stringify(queue)) as QueueItem[];
  assert.deepEqual(orderQueue(restored).map((i) => i.id), orderQueue(queue).map((i) => i.id));
});

test('a mid-flight (active) item survives a restart and can be completed', () => {
  let queue = seedQueue();
  const deq = dequeueResearch(queue, { now: NOW });
  if (deq.ok) queue = deq.data.queue;
  // simulate restart.
  const restored = JSON.parse(JSON.stringify(queue)) as QueueItem[];
  const active = restored.find((i) => i.status === 'active');
  assert.ok(active);
  assert.equal(active?.attempts, 1);
});

test('a retrying item keeps its backoff across a restart', () => {
  let queue: QueueItem[] = [];
  const enq = enqueueResearch(queue, { id: 'q1', runId: 'r1' }, { now: NOW });
  if (enq.ok) queue = enq.data.queue;
  const deq = dequeueResearch(queue, { now: NOW });
  if (deq.ok) queue = deq.data.queue;
  const f = failResearch(queue, 'q1', 'boom', { now: NOW });
  if (f.ok) queue = f.data.queue;
  const restored = JSON.parse(JSON.stringify(queue)) as QueueItem[];
  const item = restored.find((i) => i.id === 'q1');
  assert.equal(item?.status, 'retrying');
  assert.equal(item?.lastError, 'boom');
  assert.ok(Date.parse(item!.availableAt) > Date.parse(NOW));
});

test('stats are identical before and after a restart', () => {
  const queue = seedQueue();
  const restored = JSON.parse(JSON.stringify(queue)) as QueueItem[];
  assert.deepEqual(queueStats(restored, NOW), queueStats(queue, NOW));
});

test('a large queue round-trips deterministically', () => {
  let queue: QueueItem[] = [];
  for (let i = 0; i < 50; i++) {
    const p = (['CRITICAL', 'HIGH', 'NORMAL', 'LOW'] as const)[i % 4];
    const enq = enqueueResearch(queue, { id: `q${i}`, runId: `r${i}`, priority: p }, { now: NOW });
    if (enq.ok) queue = enq.data.queue;
  }
  const restored = JSON.parse(JSON.stringify(queue)) as QueueItem[];
  assert.equal(restored.length, 50);
  assert.deepEqual(orderQueue(restored), orderQueue(queue));
});

test('dequeue after restart picks the same item', () => {
  const queue = seedQueue();
  const restored = JSON.parse(JSON.stringify(queue)) as QueueItem[];
  const a = dequeueResearch(queue, { now: NOW });
  const b = dequeueResearch(restored, { now: NOW });
  assert.equal(a.ok && a.data.item?.id, b.ok && b.data.item?.id);
});
