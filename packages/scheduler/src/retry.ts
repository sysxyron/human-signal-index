/**
 * @hsi/scheduler — retry decision logic.
 *
 * Pure functions that decide, given a job and a {@link RetryPolicy}, whether a
 * failed job should be retried and when its next run should be scheduled.
 */

import { computeBackoffSeconds, nextRunAt } from './backoff';
import type { Job, RetryPolicy } from './types';

/** True when the job has attempts remaining under the policy. */
export function shouldRetry(
  job: Pick<Job, 'attemptCount' | 'maxAttempts'>,
  policy: RetryPolicy,
): boolean {
  const max = Math.min(job.maxAttempts, policy.maxAttempts);
  return job.attemptCount < max;
}

/** Result of evaluating a failure. */
export interface FailureDecision {
  status: 'retrying' | 'failed';
  nextRunAt?: string;
  backoffSeconds?: number;
}

/**
 * Decide what happens after a job execution fails.
 *
 * If retries remain, schedules `retrying` with an exponential backoff computed
 * for the *next* attempt; otherwise terminal `failed`.
 *
 * @param job    the job whose `attemptCount` reflects attempts already made.
 * @param policy retry policy.
 * @param now    ISO timestamp of the failure.
 * @param seed   optional deterministic-jitter seed.
 */
export function decideAfterFailure(
  job: Pick<Job, 'attemptCount' | 'maxAttempts'>,
  policy: RetryPolicy,
  now: string,
  seed?: number,
): FailureDecision {
  if (!shouldRetry(job, policy)) {
    return { status: 'failed' };
  }
  // The attempt we are scheduling is the next one (attemptCount is 1-based
  // count of attempts already made, so the next attempt index === attemptCount).
  const nextAttempt = job.attemptCount;
  const backoffSeconds = computeBackoffSeconds(nextAttempt, policy, seed);
  return {
    status: 'retrying',
    backoffSeconds,
    nextRunAt: nextRunAt(now, backoffSeconds),
  };
}

/**
 * Per-source backoff helper: inflates the effective backoff when a source has
 * accumulated consecutive recent failures, to avoid hammering a flaky source.
 *
 * The multiplier is `1 + failureCount` (linear) and is applied on top of the
 * normal exponential backoff, still capped by `maxBackoffSeconds`. Deterministic.
 *
 * @param job          the failing job.
 * @param policy       retry policy.
 * @param now          ISO timestamp of the failure.
 * @param failureCount number of consecutive recent failures for this source.
 * @param seed         optional deterministic-jitter seed.
 */
export function withPerSourceBackoff(
  job: Pick<Job, 'attemptCount' | 'maxAttempts'>,
  policy: RetryPolicy,
  now: string,
  failureCount: number,
  seed?: number,
): FailureDecision {
  if (!shouldRetry(job, policy)) {
    return { status: 'failed' };
  }
  const nextAttempt = job.attemptCount;
  const base = computeBackoffSeconds(nextAttempt, policy, seed);
  const multiplier = 1 + Math.max(0, Math.floor(failureCount));
  let inflated = base * multiplier;
  const cap = policy.maxBackoffSeconds;
  if (cap !== undefined && inflated > cap) inflated = cap;
  inflated = Math.round(inflated);
  return {
    status: 'retrying',
    backoffSeconds: inflated,
    nextRunAt: nextRunAt(now, inflated),
  };
}
