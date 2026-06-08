import { test } from 'node:test';
import assert from 'node:assert/strict';

import { InMemoryQueueStore } from '../src/queue';
import { createRunner, enqueue } from '../src/runner';
import { createAuditSink } from '../src/audit';
import type { JobHandler } from '../src/runner';
import type { RetryPolicy } from '../src/types';

const NOW = '2026-06-06T10:00:00.000Z';
const POLICY: RetryPolicy = { maxAttempts: 3, baseSeconds: 30, factor: 2 };

test('runOnce: completes a successful job and audits it', async () => {
  const store = new InMemoryQueueStore();
  const audit = createAuditSink();
  await enqueue(store, { jobType: 'capture' }, NOW, audit);

  const runner = createRunner({
    store,
    handlers: { capture: async () => ({ ok: true, log: { n: 1 } }) },
    policy: POLICY,
    audit,
    now: NOW,
  });

  const summary = await runner.runOnce({ now: NOW, limit: 10 });
  assert.deepEqual(summary, { claimed: 1, completed: 1, failed: 0, retried: 0 });

  const jobs = store.listJobs();
  assert.equal(jobs[0].status, 'completed');
  const types = audit.events().map((e) => e.type);
  assert.ok(types.includes('job_created'));
  assert.ok(types.includes('job_claimed'));
  assert.ok(types.includes('job_completed'));
});

test('runOnce: a throwing handler is isolated; others still complete; never throws', async () => {
  const store = new InMemoryQueueStore();
  const audit = createAuditSink();
  await enqueue(store, { jobType: 'boom' }, NOW);
  await enqueue(store, { jobType: 'ok' }, NOW);

  const handlers: Record<string, JobHandler> = {
    boom: async () => {
      throw new Error('kaboom');
    },
    ok: async () => ({ ok: true }),
  };

  const runner = createRunner({ store, handlers, policy: POLICY, audit, now: NOW });

  let threw = false;
  let summary;
  try {
    summary = await runner.runOnce({ now: NOW, limit: 10 });
  } catch {
    threw = true;
  }
  assert.equal(threw, false, 'runOnce must never throw');
  assert.equal(summary!.claimed, 2);
  assert.equal(summary!.completed, 1);
  // boom has maxAttempts 3 and attemptCount 1 -> retried, not failed
  assert.equal(summary!.retried, 1);
  assert.equal(summary!.failed, 0);

  const jobs = store.listJobs();
  const boom = jobs.find((j) => j.jobType === 'boom')!;
  const okJob = jobs.find((j) => j.jobType === 'ok')!;
  assert.equal(boom.status, 'retrying');
  assert.equal(okJob.status, 'completed');

  const types = audit.events().map((e) => e.type);
  assert.ok(types.includes('retry_scheduled'));
});

test('runOnce: handler ok=false on last attempt -> failed', async () => {
  const store = new InMemoryQueueStore();
  // maxAttempts 1 so first failure is terminal
  await enqueue(store, { jobType: 'x', maxAttempts: 1 }, NOW);
  const runner = createRunner({
    store,
    handlers: { x: async () => ({ ok: false, error: 'nope' }) },
    policy: { maxAttempts: 1, baseSeconds: 5 },
    now: NOW,
  });
  const summary = await runner.runOnce({ now: NOW, limit: 10 });
  assert.equal(summary.failed, 1);
  assert.equal(summary.retried, 0);
  assert.equal(store.listJobs()[0].status, 'failed');
});

test('runOnce: missing handler -> failure routed through policy', async () => {
  const store = new InMemoryQueueStore();
  await enqueue(store, { jobType: 'unknown', maxAttempts: 1 }, NOW);
  const runner = createRunner({
    store,
    handlers: {},
    policy: { maxAttempts: 1, baseSeconds: 5 },
    now: NOW,
  });
  const summary = await runner.runOnce({ now: NOW, limit: 10 });
  assert.equal(summary.failed, 1);
  assert.equal(store.listJobs()[0].status, 'failed');
});

test('runOnce: records attempts (running -> completed)', async () => {
  const store = new InMemoryQueueStore();
  await enqueue(store, { jobType: 'capture' }, NOW);
  const runner = createRunner({
    store,
    handlers: { capture: async () => ({ ok: true }) },
    policy: POLICY,
    now: NOW,
  });
  await runner.runOnce({ now: NOW, limit: 10 });
  const attempts = store.listAttempts();
  assert.ok(attempts.length >= 2);
  assert.ok(attempts.some((a) => a.status === 'running'));
  assert.ok(attempts.some((a) => a.status === 'completed'));
});
