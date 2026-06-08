import { test } from 'node:test';
import assert from 'node:assert/strict';

import { InMemoryQueueStore } from '../src/queue';
import {
  VISIBILITY_DEFAULT_SECONDS,
  lockedUntil,
  isExpired,
  reclaimableFilter,
} from '../src/visibility';
import type { Job } from '../src/types';

const NOW = '2026-06-06T10:00:00.000Z';

test('VISIBILITY_DEFAULT_SECONDS is 300', () => {
  assert.equal(VISIBILITY_DEFAULT_SECONDS, 300);
});

test('lockedUntil: adds seconds to now', () => {
  assert.equal(lockedUntil(NOW, 300), '2026-06-06T10:05:00.000Z');
  assert.throws(() => lockedUntil('not-a-date', 60), RangeError);
});

test('isExpired: missing/expired vs held', () => {
  assert.equal(isExpired(undefined, NOW), true);
  // lock in the past -> expired
  assert.equal(isExpired('2026-06-06T09:59:59.000Z', NOW), true);
  // lock exactly at now -> still held
  assert.equal(isExpired(NOW, NOW), false);
  // lock in future -> held
  assert.equal(isExpired('2026-06-06T10:05:00.000Z', NOW), false);
});

test('reclaimableFilter: only running + expired-lock jobs', () => {
  const base: Omit<Job, 'id' | 'status'> = {
    jobType: 'capture',
    priority: 0,
    scheduledFor: NOW,
    attemptCount: 1,
    maxAttempts: 3,
    createdAt: NOW,
    updatedAt: NOW,
  };
  const jobs: Job[] = [
    { ...base, id: 'expired', status: 'running', lockedUntil: '2026-06-06T09:00:00.000Z' },
    { ...base, id: 'held', status: 'running', lockedUntil: '2026-06-06T11:00:00.000Z' },
    { ...base, id: 'queued', status: 'queued' },
    { ...base, id: 'nolock', status: 'running' },
  ];
  const reclaimable = reclaimableFilter(jobs, NOW).map((j) => j.id).sort();
  assert.deepEqual(reclaimable, ['expired', 'nolock']);
});

test('claimBatch: sets lockedUntil and reclaims expired running jobs', async () => {
  const store = new InMemoryQueueStore({ visibilitySeconds: 300 });
  const job = await store.enqueue({ jobType: 'capture' }, NOW);

  const claimed = await store.claimBatch({ now: NOW, limit: 5 });
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].status, 'running');
  assert.equal(claimed[0].lockedUntil, '2026-06-06T10:05:00.000Z');
  assert.equal(claimed[0].attemptCount, 1);

  // Within the window -> not reclaimed.
  const within = '2026-06-06T10:04:00.000Z';
  const none = await store.claimBatch({ now: within, limit: 5 });
  assert.equal(none.length, 0);

  // After the window -> reclaimed (attemptCount bumps again).
  const after = '2026-06-06T10:06:00.000Z';
  const reclaimed = await store.claimBatch({ now: after, limit: 5 });
  assert.equal(reclaimed.length, 1);
  assert.equal(reclaimed[0].id, job.id);
  assert.equal(reclaimed[0].attemptCount, 2);
  assert.equal(reclaimed[0].lockedUntil, '2026-06-06T10:11:00.000Z');
});

test('heartbeat: extends the visibility lock so job is not reclaimed', async () => {
  const store = new InMemoryQueueStore({ visibilitySeconds: 300 });
  const job = await store.enqueue({ jobType: 'capture' }, NOW);
  await store.claimBatch({ now: NOW, limit: 1 }); // locked until 10:05

  // Heartbeat at 10:04 extends to 10:09.
  await store.heartbeat(job.id, '2026-06-06T10:04:00.000Z');
  const hb = await store.get(job.id);
  assert.equal(hb?.lockedUntil, '2026-06-06T10:09:00.000Z');

  // At 10:06 (past the original lock) it is NOT reclaimable thanks to heartbeat.
  const none = await store.claimBatch({ now: '2026-06-06T10:06:00.000Z', limit: 5 });
  assert.equal(none.length, 0);

  // Past the extended lock -> reclaimable.
  const reclaimed = await store.claimBatch({
    now: '2026-06-06T10:10:00.000Z',
    limit: 5,
  });
  assert.equal(reclaimed.length, 1);
});
