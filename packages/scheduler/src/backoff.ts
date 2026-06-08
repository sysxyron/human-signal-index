/**
 * @hsi/scheduler — deterministic exponential backoff.
 *
 * No `Math.random()`: jitter is derived from a caller-supplied seed via a
 * small integer hash, so identical inputs always yield identical delays.
 */

import type { RetryPolicy } from './types';

/**
 * Deterministic pseudo-random value in [0, 1) derived from an integer seed.
 * Uses a mulberry32-style mix — pure, no global state.
 */
function deterministicUnit(seed: number): number {
  let t = (seed | 0) + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Compute the backoff delay (in seconds) for a given attempt number.
 *
 * Exponential: `baseSeconds * factor^(attempt-1)`, capped at
 * `maxBackoffSeconds`. When `jitterRatio` > 0 a deterministic jitter in
 * `[-jitter, +jitter]` (jitter = delay * jitterRatio) is applied using `seed`.
 *
 * @param attempt 1-based attempt number (the retry being scheduled).
 * @param policy  retry policy.
 * @param seed    optional integer seed for deterministic jitter.
 */
export function computeBackoffSeconds(
  attempt: number,
  policy: RetryPolicy,
  seed?: number,
): number {
  const n = attempt < 1 ? 1 : Math.floor(attempt);
  const factor = policy.factor ?? 2;
  const base = policy.baseSeconds;

  let delay = base * Math.pow(factor, n - 1);

  const cap = policy.maxBackoffSeconds;
  if (cap !== undefined && delay > cap) delay = cap;

  const jitterRatio = policy.jitterRatio ?? 0;
  if (jitterRatio > 0) {
    // Mix attempt into the seed so successive retries jitter differently.
    const u = deterministicUnit((seed ?? 0) * 1000003 + n * 97);
    const jitterSpan = delay * jitterRatio;
    // Map u in [0,1) to [-jitterSpan, +jitterSpan).
    const jitter = (u * 2 - 1) * jitterSpan;
    delay += jitter;
    if (delay < 0) delay = 0;
    // Re-apply cap after jitter so we never exceed the bound.
    if (cap !== undefined && delay > cap) delay = cap;
  }

  // Round to whole seconds for stable, comparable timestamps.
  return Math.round(delay);
}

/**
 * Add `backoffSeconds` to an ISO timestamp and return the resulting ISO
 * timestamp. Pure — `now` is supplied by the caller.
 */
export function nextRunAt(now: string, backoffSeconds: number): string {
  const ms = Date.parse(now);
  if (Number.isNaN(ms)) {
    throw new RangeError(`nextRunAt: invalid ISO timestamp "${now}"`);
  }
  return new Date(ms + Math.round(backoffSeconds) * 1000).toISOString();
}
