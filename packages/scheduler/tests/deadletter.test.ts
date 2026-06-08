import { test } from 'node:test';
import assert from 'node:assert/strict';

import { InMemoryQueueStore } from '../src/queue';
import {
  InMemoryDeadLetterStore,
  shouldDeadLetter,
  toDeadLetterEntry,
} from '../src/deadletter';
import { createRunner } from '../src/runner';
import type { Job, RetryPolicy } from '../src/types';

const NOW = '2026-06-06T10:00:00.000Z';
const POLICY: RetryPolicy = { maxAttempts: 1, baseSeconds: 30, factor: 2 };

function mkJob(over: Partial<Job> = {}): Job {
  return {
    id: 'j1',
    jobType: 'capture',
    status: 'running',
    priority: 0,
    sourceId: 'src-1',
    payload: { url: 'x' },
    scheduledFor: NOW,
    attemptCount: 1,
    maxAttempts: 1,
    createdAt: NOW,
    updatedAt: NOW,
    errorMessage: 'boom',
    ...over,
  };
}

test('shouldDeadLetter: true once attempts exhausted', () => {
  assert.equal(shouldDeadLetter({ attemptCount: 1, maxAttempts: 1 }, POLICY), true);
  assert.equal(shouldDeadLetter({ attemptCount: 0, maxAttempts: 1 }, POLICY), false);
  // policy.maxAttempts is the tighter bound
  assert.equal(
    shouldDeadLetter({ attemptCount: 1, maxAttempts: 5 }, POLICY),
    true,
  );
});

test('toDeadLetterEntry: snapshots job fields', () => {
  const entry = toDeadLetterEntry(mkJob(), NOW, 'exhausted');
  assert.equal(entry.jobId, 'j1');
  assert.equal(entry.jobType, 'capture');
  assert.equal(entry.sourceId, 'src-1');
  assert.deepEqual(entry.payload, { url: 'x' });
  assert.equal(entry.attemptCount, 1);
  assert.equal(entry.maxAttempts, 1);
  assert.equal(entry.reason, 'exhausted');
  assert.equal(entry.lastError, 'boom');
  assert.equal(entry.deadLetteredAt, NOW);
});

test('markFailedOrRetry: exhausted job -> failed + dead-letter entry, not retried', async () => {
  const dl = new InMemoryDeadLetterStore();
  const store = new InMemoryQueueStore({ deadLetterStore: dl });
  const job = await store.enqueue({ jobType: 'capture', maxAttempts: 1 }, NOW);
  await store.claimNext({ now: NOW }); // attemptCount -> 1

  const outcome = await store.markFailedOrRetry(job.id, NOW, 'boom', POLICY);
  assert.equal(outcome.retried, false);
  assert.equal(outcome.deadLettered, true);

  const after = await store.get(job.id);
  assert.equal(after?.status, 'failed');

  const entries = await dl.list();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].jobId, job.id);
  assert.equal(entries[0].lastError, 'boom');
});

test('markFailedOrRetry: retry still has attempts -> no dead-letter', async () => {
  const dl = new InMemoryDeadLetterStore();
  const store = new InMemoryQueueStore({ deadLetterStore: dl, jitterSeed: 1 });
  const job = await store.enqueue({ jobType: 'capture', maxAttempts: 3 }, NOW);
  await store.claimNext({ now: NOW });
  const outcome = await store.markFailedOrRetry(job.id, NOW, 'boom', {
    maxAttempts: 3,
    baseSeconds: 30,
  });
  assert.equal(outcome.retried, true);
  assert.equal(outcome.deadLettered, undefined);
  assert.equal(dl.size(), 0);
});

test('requeue: re-creates a fresh queued job and consumes the entry', async () => {
  const dl = new InMemoryDeadLetterStore();
  const store = new InMemoryQueueStore({ deadLetterStore: dl });
  const job = await store.enqueue(
    { jobType: 'capture', sourceId: 's', payload: { a: 1 }, maxAttempts: 1 },
    NOW,
  );
  await store.claimNext({ now: NOW });
  await store.markFailedOrRetry(job.id, NOW, 'boom', POLICY);
  assert.equal(dl.size(), 1);

  const later = '2026-06-06T11:00:00.000Z';
  const fresh = await store.requeueFromDeadLetter(job.id, later);
  assert.ok(fresh);
  assert.notEqual(fresh!.id, job.id);
  assert.equal(fresh!.status, 'queued');
  assert.equal(fresh!.attemptCount, 0);
  assert.equal(fresh!.sourceId, 's');
  assert.deepEqual(fresh!.payload, { a: 1 });
  // Entry consumed + requeue signalled.
  assert.equal(dl.size(), 0);
  assert.equal(dl.wasRequeued(job.id), true);
});

test('runner: terminal failure increments deadLettered in summary', async () => {
  const dl = new InMemoryDeadLetterStore();
  const store = new InMemoryQueueStore({ deadLetterStore: dl });
  await store.enqueue({ jobType: 'x', maxAttempts: 1 }, NOW);
  const runner = createRunner({
    store,
    handlers: { x: async () => ({ ok: false, error: 'nope' }) },
    policy: POLICY,
    now: NOW,
  });
  const summary = await runner.runOnce({ now: NOW, limit: 10 });
  assert.equal(summary.failed, 1);
  assert.equal(summary.deadLettered, 1);
  assert.equal((await dl.list()).length, 1);
});

test('InMemoryDeadLetterStore: list newest-first and limit', async () => {
  const dl = new InMemoryDeadLetterStore();
  await dl.record(toDeadLetterEntry(mkJob({ id: 'a' }), NOW, 'r'));
  await dl.record(toDeadLetterEntry(mkJob({ id: 'b' }), NOW, 'r'));
  await dl.record(toDeadLetterEntry(mkJob({ id: 'c' }), NOW, 'r'));
  const all = await dl.list();
  assert.deepEqual(all.map((e) => e.jobId), ['c', 'b', 'a']);
  const limited = await dl.list(2);
  assert.deepEqual(limited.map((e) => e.jobId), ['c', 'b']);
});
