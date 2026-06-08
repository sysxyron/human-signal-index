/**
 * @hsi/scheduler — visibility-timeout helpers (Phase 9, scaled queue hardening).
 *
 * A claimed (`running`) job holds a visibility lock (`lockedUntil`). If the
 * worker dies mid-job the lock eventually expires and the job becomes
 * reclaimable, so work is never lost. All functions are pure — `now` is
 * injected by the caller; nothing reads the wall clock.
 */

import type { Job } from './types';

/** Default visibility window, in seconds (5 minutes). */
export const VISIBILITY_DEFAULT_SECONDS = 300;

/**
 * Compute the `lockedUntil` ISO timestamp for a job claimed at `now` with the
 * given visibility window. Throws on an invalid `now`.
 */
export function lockedUntil(now: string, visibilitySeconds: number): string {
  const ms = Date.parse(now);
  if (Number.isNaN(ms)) {
    throw new RangeError(`lockedUntil: invalid ISO timestamp "${now}"`);
  }
  const secs = Math.max(0, Math.round(visibilitySeconds));
  return new Date(ms + secs * 1000).toISOString();
}

/**
 * True when a running job's lock has expired and it is reclaimable: the lock is
 * missing/unparsable, or `lockedUntil < now`. A lock exactly at `now` is still
 * considered held (not yet expired).
 */
export function isExpired(
  lockedUntilISO: string | undefined,
  now: string,
): boolean {
  if (lockedUntilISO === undefined) return true;
  const lockedMs = Date.parse(lockedUntilISO);
  if (Number.isNaN(lockedMs)) return true;
  const nowMs = Date.parse(now);
  if (Number.isNaN(nowMs)) {
    throw new RangeError(`isExpired: invalid ISO timestamp "${now}"`);
  }
  return lockedMs < nowMs;
}

/**
 * Filter a set of jobs down to the `running` ones whose visibility window has
 * lapsed (reclaimable). Pure — does not mutate the input.
 *
 * The visibility lock is read from the optional `lockedUntil` field carried on
 * the {@link Job} record (set when claimed via {@link lockedUntil}).
 */
export function reclaimableFilter(jobs: readonly Job[], now: string): Job[] {
  return jobs.filter((j) => {
    if (j.status !== 'running') return false;
    const locked = (j as Job & { lockedUntil?: string }).lockedUntil;
    return isExpired(locked, now);
  });
}
