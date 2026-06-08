import { test } from 'node:test';
import assert from 'node:assert/strict';

import { InMemoryQueueStore } from '../src/queue';

const NOW = '2026-06-06T10:00:00.000Z';

test('claimBatch: ordering priority desc, scheduledFor asc, createdAt asc', async () => {
  const store = new InMemoryQueueStore();
  await store.enqueue({ jobType: 'a', priority: 1 }, '2026-06-06T09:00:00.000Z');
  await store.enqueue({ jobType: 'b', priority: 5 }, '2026-06-06T09:30:00.000Z');
  await store.enqueue({ jobType: 'c', priority: 5 }, '2026-06-06T09:10:00.000Z');

  const claimed = await store.claimBatch({ now: NOW, limit: 3 });
  assert.deepEqual(claimed.map((j) => j.jobType), ['c', 'b', 'a']);
});

test('claimBatch: jobTypes filter and limit', async () => {
  const store = new InMemoryQueueStore();
  await store.enqueue({ jobType: 'capture' }, NOW);
  await store.enqueue({ jobType: 'classify' }, NOW);
  await store.enqueue({ jobType: 'classify' }, NOW);

  const onlyClassify = await store.claimBatch({
    now: NOW,
    limit: 10,
    jobTypes: ['classify'],
  });
  assert.equal(onlyClassify.length, 2);
  assert.ok(onlyClassify.every((j) => j.jobType === 'classify'));

  // limit caps the batch
  const store2 = new InMemoryQueueStore();
  await store2.enqueue({ jobType: 'x' }, NOW);
  await store2.enqueue({ jobType: 'x' }, NOW);
  await store2.enqueue({ jobType: 'x' }, NOW);
  const capped = await store2.claimBatch({ now: NOW, limit: 2 });
  assert.equal(capped.length, 2);
});

test('claimBatch: future scheduledFor is not claimed', async () => {
  const store = new InMemoryQueueStore();
  await store.enqueue(
    { jobType: 'future', scheduledFor: '2026-06-06T11:00:00.000Z' },
    NOW,
  );
  const claimed = await store.claimBatch({ now: NOW, limit: 10 });
  assert.equal(claimed.length, 0);
});

test('claimBatch: concurrent-ish double claim does not double-issue the same job', async () => {
  const store = new InMemoryQueueStore({ visibilitySeconds: 300 });
  await store.enqueue({ jobType: 'capture' }, NOW);

  // Two overlapping claim passes at the same instant. The first claims+locks the
  // job; the second sees it running with a fresh (unexpired) lock and gets none.
  const [first, second] = await Promise.all([
    store.claimBatch({ now: NOW, limit: 10 }),
    store.claimBatch({ now: NOW, limit: 10 }),
  ]);

  const totalClaimed = first.length + second.length;
  assert.equal(totalClaimed, 1, 'the job must be issued to exactly one claimer');

  const job = store.listJobs()[0];
  assert.equal(job.status, 'running');
  assert.equal(job.attemptCount, 1, 'attemptCount must be bumped exactly once');
});

test('claimBatch: a completed/cancelled job is never claimed', async () => {
  const store = new InMemoryQueueStore();
  const j1 = await store.enqueue({ jobType: 'a' }, NOW);
  const j2 = await store.enqueue({ jobType: 'b' }, NOW);
  await store.markCompleted(j1.id, NOW);
  await store.cancel(j2.id, NOW);
  const claimed = await store.claimBatch({ now: NOW, limit: 10 });
  assert.equal(claimed.length, 0);
});
