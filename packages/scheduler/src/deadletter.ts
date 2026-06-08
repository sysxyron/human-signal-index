/**
 * @hsi/scheduler — dead-letter handling (Phase 9, scaled queue hardening).
 *
 * Pure, deterministic helpers plus a DB-agnostic {@link DeadLetterStore} port
 * and an in-memory implementation. When a job exhausts its retries it is
 * "dead-lettered": kept terminal (`failed`) on the queue *and* recorded as a
 * {@link DeadLetterEntry} for inspection / manual requeue.
 */

import type { Job, RetryPolicy } from './types';

/** A job that has exhausted its retries and been parked for inspection. */
export interface DeadLetterEntry {
  jobId: string;
  jobType: string;
  sourceId?: string;
  payload?: Record<string, unknown>;
  attemptCount: number;
  maxAttempts: number;
  reason: string;
  lastError?: string;
  /** ISO timestamp the job was dead-lettered. */
  deadLetteredAt: string;
}

/**
 * True when a failed job has exhausted its attempts under the policy and should
 * be moved to the dead-letter store rather than retried.
 *
 * Mirrors the inverse of {@link shouldRetry}: `attemptCount >= effectiveMax`,
 * where the effective max is the tighter of the job's `maxAttempts` and the
 * policy's `maxAttempts`.
 */
export function shouldDeadLetter(
  job: Pick<Job, 'attemptCount' | 'maxAttempts'>,
  policy: RetryPolicy,
): boolean {
  const max = Math.min(job.maxAttempts, policy.maxAttempts);
  return job.attemptCount >= max;
}

/**
 * Build a {@link DeadLetterEntry} snapshot from a job. Pure — `now` and the
 * `reason` are supplied by the caller. `lastError` defaults to the job's
 * `errorMessage` when present.
 */
export function toDeadLetterEntry(
  job: Job,
  now: string,
  reason: string,
): DeadLetterEntry {
  const entry: DeadLetterEntry = {
    jobId: job.id,
    jobType: job.jobType,
    attemptCount: job.attemptCount,
    maxAttempts: job.maxAttempts,
    reason,
    deadLetteredAt: now,
  };
  if (job.sourceId !== undefined) entry.sourceId = job.sourceId;
  if (job.payload !== undefined) entry.payload = job.payload;
  if (job.errorMessage !== undefined) entry.lastError = job.errorMessage;
  return entry;
}

/**
 * DB-agnostic port for the dead-letter table. The app/worker implements this
 * against Supabase (e.g. an `hsin_dead_letter_jobs` table); this package ships
 * an in-memory implementation for tests and offline use.
 */
export interface DeadLetterStore {
  /** Persist a dead-letter entry. */
  record(entry: DeadLetterEntry): Promise<void>;
  /** List the most-recent dead-letter entries (newest first), up to `limit`. */
  list(limit?: number): Promise<DeadLetterEntry[]>;
  /**
   * Signal that the parked job should be re-created on the queue. The dead-letter
   * entry is consumed (removed) — the queue store performs the actual re-enqueue.
   */
  requeue(jobId: string): Promise<void>;
}

/** In-memory {@link DeadLetterStore} for tests and offline use. */
export class InMemoryDeadLetterStore implements DeadLetterStore {
  /** Insertion-ordered; newest appended last. */
  private readonly entries: DeadLetterEntry[] = [];
  /** Job ids flagged for requeue (consumed by the queue store). */
  private readonly requeued = new Set<string>();

  async record(entry: DeadLetterEntry): Promise<void> {
    this.entries.push({ ...entry });
  }

  async list(limit?: number): Promise<DeadLetterEntry[]> {
    // Newest first for inspection.
    const copy = this.entries.map((e) => ({ ...e })).reverse();
    if (limit === undefined) return copy;
    return copy.slice(0, Math.max(0, limit));
  }

  async requeue(jobId: string): Promise<void> {
    this.requeued.add(jobId);
    // Consume the parked entry, if present.
    const idx = this.entries.findIndex((e) => e.jobId === jobId);
    if (idx >= 0) this.entries.splice(idx, 1);
  }

  // --- test / inspection helpers -------------------------------------------

  /** Whether `requeue` has been signalled for a job id. */
  wasRequeued(jobId: string): boolean {
    return this.requeued.has(jobId);
  }

  /** Job ids signalled for requeue (copy). */
  requeuedIds(): string[] {
    return Array.from(this.requeued);
  }

  /** Number of parked entries. */
  size(): number {
    return this.entries.length;
  }
}
