import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  InMemoryQueueStore,
  nextDueRules,
  advanceRule,
} from '../src/queue';
import type { SchedulerRule } from '../src/types';

const NOW = '2026-06-06T10:00:00.000Z';

test('enqueue -> claimNext returns it as running -> markCompleted', async () => {
  const store = new InMemoryQueueStore();
  const job = await store.enqueue({ jobType: 'capture' }, NOW);
  assert.equal(job.status, 'queued');
  assert.equal(job.attemptCount, 0);

  const claimed = await store.claimNext({ now: NOW });
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].id, job.id);
  assert.equal(claimed[0].status, 'running');
  assert.equal(claimed[0].attemptCount, 1);

  await store.markCompleted(job.id, NOW, { result: 'ok' });
  const after = await store.get(job.id);
  assert.equal(after?.status, 'completed');
  assert.equal(after?.finishedAt, NOW);
});

test('claimNext: priority desc, then scheduledFor asc, then createdAt asc', async () => {
  const store = new InMemoryQueueStore();
  await store.enqueue({ jobType: 'a', priority: 1 }, '2026-06-06T09:00:00.000Z');
  await store.enqueue({ jobType: 'b', priority: 5 }, '2026-06-06T09:30:00.000Z');
  await store.enqueue({ jobType: 'c', priority: 5 }, '2026-06-06T09:10:00.000Z');

  const claimed = await store.claimNext({ now: NOW, limit: 3 });
  assert.deepEqual(
    claimed.map((j) => j.jobType),
    ['c', 'b', 'a'], // p5@09:10, p5@09:30, p1@09:00
  );
});

test('claimNext: scheduledFor in the future is not claimed', async () => {
  const store = new InMemoryQueueStore();
  await store.enqueue(
    { jobType: 'future', scheduledFor: '2026-06-06T11:00:00.000Z' },
    NOW,
  );
  const claimed = await store.claimNext({ now: NOW, limit: 10 });
  assert.equal(claimed.length, 0);
});

test('claimNext: jobTypes filter', async () => {
  const store = new InMemoryQueueStore();
  await store.enqueue({ jobType: 'capture' }, NOW);
  await store.enqueue({ jobType: 'classify' }, NOW);
  const claimed = await store.claimNext({
    now: NOW,
    jobTypes: ['classify'],
    limit: 10,
  });
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].jobType, 'classify');
});

test('markFailedOrRetry: retries then reschedules; future job not re-claimed', async () => {
  const store = new InMemoryQueueStore({ jitterSeed: 1 });
  const job = await store.enqueue({ jobType: 'capture', maxAttempts: 3 }, NOW);
  await store.claimNext({ now: NOW }); // attemptCount -> 1
  const r = await store.markFailedOrRetry(
    job.id,
    NOW,
    'boom',
    { maxAttempts: 3, baseSeconds: 30, factor: 2 },
  );
  assert.equal(r.retried, true);
  const after = await store.get(job.id);
  assert.equal(after?.status, 'retrying');
  assert.ok(after && Date.parse(after.scheduledFor) > Date.parse(NOW));
  // Not claimable yet at NOW.
  const claimed = await store.claimNext({ now: NOW, limit: 10 });
  assert.equal(claimed.length, 0);
});

test('cancel: moves job to cancelled and out of claim set', async () => {
  const store = new InMemoryQueueStore();
  const job = await store.enqueue({ jobType: 'capture' }, NOW);
  await store.cancel(job.id, NOW);
  const after = await store.get(job.id);
  assert.equal(after?.status, 'cancelled');
  const claimed = await store.claimNext({ now: NOW, limit: 10 });
  assert.equal(claimed.length, 0);
});

test('nextDueRules + advanceRule', () => {
  const rules: SchedulerRule[] = [
    {
      id: 'r1',
      jobType: 'capture',
      cronExpression: '*/5 * * * *',
      enabled: true,
      nextRunAt: '2026-06-06T09:55:00.000Z',
    },
    {
      id: 'r2',
      jobType: 'classify',
      cronExpression: '*/5 * * * *',
      enabled: true,
      nextRunAt: '2026-06-06T10:05:00.000Z',
    },
    {
      id: 'r3',
      jobType: 'drift',
      cronExpression: '*/5 * * * *',
      enabled: false,
      nextRunAt: '2026-06-06T09:00:00.000Z',
    },
  ];
  const due = nextDueRules(rules, NOW);
  assert.deepEqual(due.map((r) => r.id), ['r1']);

  const advanced = advanceRule(rules[0], NOW);
  assert.equal(advanced.lastRunAt, NOW);
  assert.equal(advanced.nextRunAt, '2026-06-06T10:05:00.000Z');
});
