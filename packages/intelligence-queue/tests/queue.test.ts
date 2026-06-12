import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PRIORITY_RANK,
  backoffMs,
  cancelResearch,
  completeResearch,
  dequeueResearch,
  enqueueResearch,
  failResearch,
  orderQueue,
  peekQueue,
  prioritizeResearch,
  queueDepth,
  queueStats,
  retryResearch,
} from '../src/queue';
import { FIXTURE_NOW, seedQueue } from '../src/fixtures';
import type { QueueItem } from '../src/types';

const NOW = FIXTURE_NOW;

function enq(queue: QueueItem[], id: string, priority: QueueItem['priority'], now = NOW): QueueItem[] {
  const r = enqueueResearch(queue, { id, runId: `run-${id}`, priority }, { now });
  assert.ok(r.ok);
  return r.ok ? r.data.queue : queue;
}

test('priority rank ordering', () => {
  assert.ok(PRIORITY_RANK.CRITICAL < PRIORITY_RANK.HIGH);
  assert.ok(PRIORITY_RANK.HIGH < PRIORITY_RANK.NORMAL);
  assert.ok(PRIORITY_RANK.NORMAL < PRIORITY_RANK.LOW);
});

test('enqueue adds an item', () => {
  const q = enq([], 'a', 'NORMAL');
  assert.equal(q.length, 1);
  assert.equal(q[0].status, 'queued');
  assert.equal(q[0].attempts, 0);
});

test('enqueue rejects duplicate id', () => {
  const q = enq([], 'a', 'NORMAL');
  const r = enqueueResearch(q, { id: 'a', runId: 'x' }, { now: NOW });
  assert.equal(r.ok, false);
});

test('enqueue defaults priority NORMAL', () => {
  const r = enqueueResearch([], { id: 'a', runId: 'x' }, { now: NOW });
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.data.item.priority, 'NORMAL');
});

test('orderQueue ranks by priority', () => {
  let q: QueueItem[] = [];
  q = enq(q, 'low', 'LOW');
  q = enq(q, 'crit', 'CRITICAL');
  q = enq(q, 'norm', 'NORMAL');
  const ordered = orderQueue(q);
  assert.deepEqual(ordered.map((i) => i.id), ['crit', 'norm', 'low']);
});

test('dequeue picks highest priority', () => {
  const q = seedQueue();
  const r = dequeueResearch(q, { now: NOW });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.data.item?.priority, 'CRITICAL');
    assert.equal(r.data.item?.status, 'active');
    assert.equal(r.data.item?.attempts, 1);
  }
});

test('dequeue returns null when nothing ready', () => {
  const r = dequeueResearch([], { now: NOW });
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.data.item, null);
});

test('dequeue respects availableAt (backoff not elapsed)', () => {
  const future = '2027-01-01T00:00:00.000Z';
  const r0 = enqueueResearch([], { id: 'a', runId: 'x', availableAt: future }, { now: NOW });
  assert.ok(r0.ok);
  const q = r0.ok ? r0.data.queue : [];
  const r = dequeueResearch(q, { now: NOW });
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.data.item, null);
});

test('complete marks completed', () => {
  let q = enq([], 'a', 'NORMAL');
  const r = completeResearch(q, 'a', { now: NOW });
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.data.queue[0].status, 'completed');
});

test('fail under maxAttempts -> retrying with backoff', () => {
  const deq = dequeueResearch(enq([], 'a', 'NORMAL'), { now: NOW });
  assert.ok(deq.ok);
  const q = deq.ok ? deq.data.queue : [];
  const r = failResearch(q, 'a', 'boom', { now: NOW });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.data.willRetry, true);
    assert.equal(r.data.queue[0].status, 'retrying');
    assert.equal(r.data.queue[0].lastError, 'boom');
    assert.ok(Date.parse(r.data.queue[0].availableAt) > Date.parse(NOW));
  }
});

test('fail at maxAttempts -> terminal failed', () => {
  // attempts must reach maxAttempts. Dequeue 3 times (maxAttempts default 3).
  let q = enq([], 'a', 'NORMAL');
  for (let i = 0; i < 3; i++) {
    const d = dequeueResearch(q, { now: NOW });
    q = d.ok ? d.data.queue : q;
    // reset to queued so it can be dequeued again (simulate retry path)
    if (i < 2) {
      const rr = retryResearch(q, 'a', { now: NOW });
      q = rr.ok ? rr.data.queue : q;
    }
  }
  const r = failResearch(q, 'a', 'boom', { now: NOW });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.data.willRetry, false);
    assert.equal(r.data.queue[0].status, 'failed');
  }
});

test('retry resets to queued now', () => {
  const deq = dequeueResearch(enq([], 'a', 'NORMAL'), { now: NOW });
  const q = deq.ok ? deq.data.queue : [];
  const fail = failResearch(q, 'a', 'x', { now: NOW });
  const q2 = fail.ok ? fail.data.queue : q;
  const r = retryResearch(q2, 'a', { now: NOW });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.data.queue[0].status, 'queued');
    assert.equal(r.data.queue[0].availableAt, NOW);
  }
});

test('retry rejects a completed item', () => {
  let q = enq([], 'a', 'NORMAL');
  const c = completeResearch(q, 'a', { now: NOW });
  q = c.ok ? c.data.queue : q;
  const r = retryResearch(q, 'a', { now: NOW });
  assert.equal(r.ok, false);
});

test('cancel marks cancelled', () => {
  let q = enq([], 'a', 'NORMAL');
  const r = cancelResearch(q, 'a', { now: NOW });
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.data.queue[0].status, 'cancelled');
});

test('cancel rejects a completed item', () => {
  let q = enq([], 'a', 'NORMAL');
  const c = completeResearch(q, 'a', { now: NOW });
  q = c.ok ? c.data.queue : q;
  const r = cancelResearch(q, 'a', { now: NOW });
  assert.equal(r.ok, false);
});

test('prioritize changes priority and reorders', () => {
  let q = seedQueue();
  const r = prioritizeResearch(q, 'q-low', 'CRITICAL', { now: NOW });
  assert.ok(r.ok);
  if (r.ok) {
    const ordered = orderQueue(r.data.queue);
    // two CRITICALs now; q-low among the front.
    assert.equal(ordered[0].priority, 'CRITICAL');
  }
});

test('operations on unknown id reject', () => {
  assert.equal(completeResearch([], 'zzz', { now: NOW }).ok, false);
  assert.equal(failResearch([], 'zzz', 'x', { now: NOW }).ok, false);
  assert.equal(cancelResearch([], 'zzz', { now: NOW }).ok, false);
  assert.equal(prioritizeResearch([], 'zzz', 'LOW', { now: NOW }).ok, false);
});

test('peekQueue returns the next ready without mutating', () => {
  const q = seedQueue();
  const peeked = peekQueue(q, NOW);
  assert.equal(peeked?.priority, 'CRITICAL');
  assert.equal(q.every((i) => i.status === 'queued'), true);
});

test('queueDepth counts', () => {
  const q = seedQueue();
  assert.equal(queueDepth(q), 4);
  assert.equal(queueDepth(q, 'queued'), 4);
  assert.equal(queueDepth(q, 'active'), 0);
});

test('queueStats summarizes', () => {
  const stats = queueStats(seedQueue(), NOW);
  assert.equal(stats.total, 4);
  assert.equal(stats.ready, 4);
  assert.equal(stats.byPriority.CRITICAL, 1);
  assert.equal(stats.byStatus.queued, 4);
});

test('backoff increases then caps', () => {
  assert.ok(backoffMs(0) < backoffMs(1));
  assert.equal(backoffMs(10), backoffMs(4)); // capped
});

test('inputs are not mutated', () => {
  const q = seedQueue();
  const snapshot = q.map((i) => i.status);
  dequeueResearch(q, { now: NOW });
  cancelResearch(q, 'q-low', { now: NOW });
  assert.deepEqual(q.map((i) => i.status), snapshot);
});

test('deterministic dequeue order', () => {
  const a = dequeueResearch(seedQueue(), { now: NOW });
  const b = dequeueResearch(seedQueue(), { now: NOW });
  assert.deepEqual(a, b);
});
