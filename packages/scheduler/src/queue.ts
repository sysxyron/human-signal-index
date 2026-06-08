/**
 * @hsi/scheduler — in-memory queue store and rule helpers.
 *
 * {@link InMemoryQueueStore} is a deterministic, Map-backed {@link QueueStore}
 * for tests and offline use. Ids are generated from a monotonically increasing
 * counter (optionally seeded) so runs are reproducible — no `Math.random()`.
 */

import { isDue, nextRunAfter } from './cron';
import {
  InMemoryDeadLetterStore,
  shouldDeadLetter,
  toDeadLetterEntry,
} from './deadletter';
import type { DeadLetterStore } from './deadletter';
import { decideAfterFailure } from './retry';
import type {
  EnqueueInput,
  FailureOutcome,
  Job,
  JobAttempt,
  JobStatus,
  ScalableQueueStore,
  RetryPolicy,
  SchedulerRule,
} from './types';
import {
  isExpired,
  lockedUntil as computeLockedUntil,
  VISIBILITY_DEFAULT_SECONDS,
} from './visibility';

const CLAIMABLE: ReadonlySet<JobStatus> = new Set<JobStatus>([
  'queued',
  'retrying',
]);

/** Deterministic ordering: priority desc, scheduledFor asc, createdAt asc. */
function compareJobs(a: Job, b: Job): number {
  if (a.priority !== b.priority) return b.priority - a.priority;
  const sa = Date.parse(a.scheduledFor);
  const sb = Date.parse(b.scheduledFor);
  if (sa !== sb) return sa - sb;
  const ca = Date.parse(a.createdAt);
  const cb = Date.parse(b.createdAt);
  if (ca !== cb) return ca - cb;
  // Final tie-break on id for full determinism.
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Options for {@link InMemoryQueueStore}. */
export interface InMemoryQueueStoreOptions {
  /** Starting value for the deterministic id counter. Defaults to 0. */
  seed?: number;
  /** Optional seed used for deterministic backoff jitter on retries. */
  jitterSeed?: number;
  /** Prefix for generated job ids. Defaults to "job". */
  idPrefix?: string;
  /**
   * Dead-letter store to record entries into when a job exhausts its retries
   * (Phase 9). Defaults to an owned {@link InMemoryDeadLetterStore}. The
   * store's `requeue` re-creates the parked job on this queue.
   */
  deadLetterStore?: DeadLetterStore;
  /** Default visibility window (seconds) for `claimBatch`/`heartbeat`. */
  visibilitySeconds?: number;
}

export class InMemoryQueueStore implements ScalableQueueStore {
  private readonly jobs = new Map<string, Job>();
  private readonly attempts: JobAttempt[] = [];
  private counter: number;
  private readonly jitterSeed?: number;
  private readonly idPrefix: string;
  private readonly deadLetters: DeadLetterStore;
  private readonly defaultVisibilitySeconds: number;

  constructor(opts: InMemoryQueueStoreOptions = {}) {
    this.counter = opts.seed ?? 0;
    this.jitterSeed = opts.jitterSeed;
    this.idPrefix = opts.idPrefix ?? 'job';
    this.deadLetters = opts.deadLetterStore ?? new InMemoryDeadLetterStore();
    this.defaultVisibilitySeconds =
      opts.visibilitySeconds ?? VISIBILITY_DEFAULT_SECONDS;
  }

  /** The dead-letter store backing this queue (owned or injected). */
  deadLetterStore(): DeadLetterStore {
    return this.deadLetters;
  }

  private nextId(prefix: string): string {
    this.counter += 1;
    return `${prefix}-${this.counter}`;
  }

  async enqueue(input: EnqueueInput, now: string): Promise<Job> {
    const id = this.nextId(this.idPrefix);
    const job: Job = {
      id,
      jobType: input.jobType,
      status: 'queued',
      priority: input.priority ?? 0,
      sourceId: input.sourceId,
      payload: input.payload,
      scheduledFor: input.scheduledFor ?? now,
      attemptCount: 0,
      maxAttempts: input.maxAttempts ?? 3,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(id, job);
    return { ...job };
  }

  async claimNext(opts: {
    now: string;
    jobTypes?: string[];
    limit?: number;
  }): Promise<Job[]> {
    const nowMs = Date.parse(opts.now);
    const typeFilter = opts.jobTypes ? new Set(opts.jobTypes) : null;
    const limit = opts.limit ?? 1;

    const eligible = Array.from(this.jobs.values()).filter((j) => {
      if (!CLAIMABLE.has(j.status)) return false;
      if (Date.parse(j.scheduledFor) > nowMs) return false;
      if (typeFilter && !typeFilter.has(j.jobType)) return false;
      return true;
    });

    eligible.sort(compareJobs);

    const claimed: Job[] = [];
    for (const job of eligible) {
      if (claimed.length >= limit) break;
      job.status = 'running';
      job.startedAt = opts.now;
      job.updatedAt = opts.now;
      job.attemptCount += 1;
      this.jobs.set(job.id, job);
      claimed.push({ ...job });
    }
    return claimed;
  }

  async markCompleted(
    jobId: string,
    now: string,
    log?: Record<string, unknown>,
  ): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;
    job.status = 'completed';
    job.finishedAt = now;
    job.updatedAt = now;
    job.errorMessage = undefined;
    this.jobs.set(jobId, job);
    void log;
  }

  async markFailedOrRetry(
    jobId: string,
    now: string,
    error: string,
    policy: RetryPolicy,
  ): Promise<FailureOutcome> {
    const job = this.jobs.get(jobId);
    if (!job) return { retried: false };

    const decision = decideAfterFailure(job, policy, now, this.jitterSeed);
    job.errorMessage = error;
    job.updatedAt = now;

    if (decision.status === 'retrying' && decision.nextRunAt) {
      job.status = 'retrying';
      job.scheduledFor = decision.nextRunAt;
      job.startedAt = undefined;
      job.lockedUntil = undefined;
      this.jobs.set(jobId, job);
      return { retried: true, nextRunAt: decision.nextRunAt };
    }

    // Terminal failure. If attempts are exhausted, dead-letter it: keep the job
    // 'failed' AND record a dead-letter entry for inspection/requeue.
    job.status = 'failed';
    job.finishedAt = now;
    job.lockedUntil = undefined;
    this.jobs.set(jobId, job);

    if (shouldDeadLetter(job, policy)) {
      const reason = `max attempts (${job.attemptCount}/${Math.min(
        job.maxAttempts,
        policy.maxAttempts,
      )}) exhausted`;
      await this.deadLetters.record(toDeadLetterEntry(job, now, reason));
      return { retried: false, deadLettered: true };
    }
    return { retried: false };
  }

  async claimBatch(opts: {
    now: string;
    limit: number;
    visibilitySeconds?: number;
    jobTypes?: string[];
  }): Promise<Job[]> {
    const nowMs = Date.parse(opts.now);
    const typeFilter = opts.jobTypes ? new Set(opts.jobTypes) : null;
    const limit = opts.limit;
    const visibilitySeconds =
      opts.visibilitySeconds ?? this.defaultVisibilitySeconds;
    const lock = computeLockedUntil(opts.now, visibilitySeconds);

    const eligible = Array.from(this.jobs.values()).filter((j) => {
      if (typeFilter && !typeFilter.has(j.jobType)) return false;
      // Due queued/retrying jobs.
      if (CLAIMABLE.has(j.status)) {
        return Date.parse(j.scheduledFor) <= nowMs;
      }
      // Reclaim running jobs whose visibility lock has expired.
      if (j.status === 'running') {
        return isExpired(j.lockedUntil, opts.now);
      }
      return false;
    });

    eligible.sort(compareJobs);

    const claimed: Job[] = [];
    for (const job of eligible) {
      if (claimed.length >= limit) break;
      // Atomic single-process claim: flip to running + set lock + bump attempt.
      // Because this runs synchronously over the Map, a concurrently-awaited
      // second claim sees the job already running with a fresh (unexpired) lock
      // and cannot re-issue it.
      job.status = 'running';
      job.startedAt = opts.now;
      job.updatedAt = opts.now;
      job.lockedUntil = lock;
      job.attemptCount += 1;
      this.jobs.set(job.id, job);
      claimed.push({ ...job });
    }
    return claimed;
  }

  async heartbeat(
    jobId: string,
    now: string,
    visibilitySeconds?: number,
  ): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'running') return;
    const secs = visibilitySeconds ?? this.defaultVisibilitySeconds;
    job.lockedUntil = computeLockedUntil(now, secs);
    job.updatedAt = now;
    this.jobs.set(jobId, job);
  }

  async deadLetter(jobId: string, now: string, reason: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;
    job.status = 'failed';
    job.finishedAt = now;
    job.updatedAt = now;
    job.lockedUntil = undefined;
    this.jobs.set(jobId, job);
    await this.deadLetters.record(toDeadLetterEntry(job, now, reason));
  }

  async recordAttempt(attempt: JobAttempt): Promise<void> {
    this.attempts.push({ ...attempt });
  }

  async cancel(jobId: string, now: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;
    job.status = 'cancelled';
    job.finishedAt = now;
    job.updatedAt = now;
    this.jobs.set(jobId, job);
  }

  async get(jobId: string): Promise<Job | null> {
    const job = this.jobs.get(jobId);
    return job ? { ...job } : null;
  }

  /**
   * Re-create a fresh `queued` job from a parked dead-letter entry and consume
   * that entry (signals {@link DeadLetterStore.requeue}). Returns the new job,
   * or `null` if no matching parked entry exists. The new job resets
   * `attemptCount` to 0 so it gets a clean run.
   */
  async requeueFromDeadLetter(jobId: string, now: string): Promise<Job | null> {
    const parked = (await this.deadLetters.list()).find(
      (e) => e.jobId === jobId,
    );
    if (!parked) return null;
    await this.deadLetters.requeue(jobId);
    const input: EnqueueInput = { jobType: parked.jobType };
    if (parked.sourceId !== undefined) input.sourceId = parked.sourceId;
    if (parked.payload !== undefined) input.payload = parked.payload;
    input.maxAttempts = parked.maxAttempts;
    return this.enqueue(input, now);
  }

  // --- test / inspection helpers -------------------------------------------

  /** All recorded attempts (copy). */
  listAttempts(): JobAttempt[] {
    return this.attempts.map((a) => ({ ...a }));
  }

  /** All jobs (copy), in insertion order. */
  listJobs(): Job[] {
    return Array.from(this.jobs.values()).map((j) => ({ ...j }));
  }

  /** Generate an id with the store's deterministic counter (e.g. for attempts). */
  generateId(prefix = 'att'): string {
    return this.nextId(prefix);
  }
}

/** Rules that are enabled and whose `nextRunAt <= now`. */
export function nextDueRules(
  rules: SchedulerRule[],
  now: string,
): SchedulerRule[] {
  const nowMs = Date.parse(now);
  return rules.filter((r) => {
    if (!r.enabled) return false;
    if (r.nextRunAt === undefined) {
      // No precomputed next run — fall back to cron match at this minute.
      return isDue(r.cronExpression, now, r.lastRunAt);
    }
    return Date.parse(r.nextRunAt) <= nowMs;
  });
}

/**
 * Advance a rule after firing: set `lastRunAt = now` and recompute
 * `nextRunAt` from the cron expression. Returns a new rule object (pure).
 */
export function advanceRule(rule: SchedulerRule, now: string): SchedulerRule {
  return {
    ...rule,
    lastRunAt: now,
    nextRunAt: nextRunAfter(rule.cronExpression, now),
  };
}
