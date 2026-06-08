import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeBackoffSeconds, nextRunAt } from '../src/backoff';
import {
  shouldRetry,
  decideAfterFailure,
  withPerSourceBackoff,
} from '../src/retry';
import type { Job, RetryPolicy } from '../src/types';

const POLICY: RetryPolicy = { maxAttempts: 4, baseSeconds: 10, factor: 2 };

function jobWith(attemptCount: number, maxAttempts = 4): Job {
  return {
    id: 'j1',
    jobType: 'capture',
    status: 'running',
    priority: 0,
    scheduledFor: '2026-06-06T10:00:00.000Z',
    attemptCount,
    maxAttempts,
    createdAt: '2026-06-06T10:00:00.000Z',
    updatedAt: '2026-06-06T10:00:00.000Z',
  };
}

test('computeBackoffSeconds: exponential without jitter', () => {
  assert.equal(computeBackoffSeconds(1, POLICY), 10);
  assert.equal(computeBackoffSeconds(2, POLICY), 20);
  assert.equal(computeBackoffSeconds(3, POLICY), 40);
  assert.equal(computeBackoffSeconds(4, POLICY), 80);
});

test('computeBackoffSeconds: monotonic non-decreasing', () => {
  let prev = -1;
  for (let a = 1; a <= 6; a++) {
    const v = computeBackoffSeconds(a, POLICY);
    assert.ok(v >= prev, `attempt ${a} (${v}) >= prev ${prev}`);
    prev = v;
  }
});

test('computeBackoffSeconds: capped at maxBackoffSeconds', () => {
  const capped: RetryPolicy = { ...POLICY, maxBackoffSeconds: 50 };
  assert.equal(computeBackoffSeconds(3, capped), 40);
  assert.equal(computeBackoffSeconds(4, capped), 50);
  assert.equal(computeBackoffSeconds(10, capped), 50);
});

test('computeBackoffSeconds: deterministic jitter (same seed -> same value)', () => {
  const jp: RetryPolicy = { ...POLICY, jitterRatio: 0.5 };
  const a = computeBackoffSeconds(3, jp, 42);
  const b = computeBackoffSeconds(3, jp, 42);
  assert.equal(a, b);
  // jitter stays within [0, base*factor^2 * 1.5] = [0, 60]
  assert.ok(a >= 0 && a <= 60);
});

test('computeBackoffSeconds: jitter respects cap', () => {
  const jp: RetryPolicy = {
    ...POLICY,
    jitterRatio: 0.9,
    maxBackoffSeconds: 45,
  };
  for (let seed = 0; seed < 20; seed++) {
    assert.ok(computeBackoffSeconds(5, jp, seed) <= 45);
  }
});

test('nextRunAt: adds seconds to ISO', () => {
  assert.equal(
    nextRunAt('2026-06-06T10:00:00.000Z', 90),
    '2026-06-06T10:01:30.000Z',
  );
});

test('shouldRetry: attemptCount < maxAttempts', () => {
  assert.equal(shouldRetry(jobWith(1), POLICY), true);
  assert.equal(shouldRetry(jobWith(3), POLICY), true);
  assert.equal(shouldRetry(jobWith(4), POLICY), false);
});

test('decideAfterFailure: schedules retrying with growing backoff until failed', () => {
  const now = '2026-06-06T10:00:00.000Z';

  const d1 = decideAfterFailure(jobWith(1), POLICY, now);
  assert.equal(d1.status, 'retrying');
  assert.equal(d1.backoffSeconds, 10);

  const d2 = decideAfterFailure(jobWith(2), POLICY, now);
  assert.equal(d2.status, 'retrying');
  assert.equal(d2.backoffSeconds, 20);

  const d3 = decideAfterFailure(jobWith(3), POLICY, now);
  assert.equal(d3.status, 'retrying');
  assert.equal(d3.backoffSeconds, 40);

  // attemptCount == maxAttempts -> terminal failed
  const d4 = decideAfterFailure(jobWith(4), POLICY, now);
  assert.equal(d4.status, 'failed');
  assert.equal(d4.nextRunAt, undefined);
});

test('withPerSourceBackoff: inflates backoff with consecutive failures', () => {
  const now = '2026-06-06T10:00:00.000Z';
  const base = decideAfterFailure(jobWith(2), POLICY, now).backoffSeconds!;
  const inflated = withPerSourceBackoff(jobWith(2), POLICY, now, 3).backoffSeconds!;
  assert.ok(inflated > base);
  assert.equal(inflated, base * 4); // multiplier = 1 + 3
});

test('withPerSourceBackoff: terminal when no retries left', () => {
  const now = '2026-06-06T10:00:00.000Z';
  assert.equal(withPerSourceBackoff(jobWith(4), POLICY, now, 5).status, 'failed');
});
