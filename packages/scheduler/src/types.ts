/**
 * @hsi/scheduler — core types.
 *
 * Pure, dependency-free type definitions for the production scheduler and
 * job-queue engine. All timestamps are ISO-8601 strings; nothing in this
 * package reads the wall clock directly.
 */

/** Open string type for job kinds. Known kinds live in {@link JOB_TYPES}. */
export type JobType = string;

/** Known job-type constants. The set is open — callers may add their own. */
export const JOB_TYPES = {
  capture: 'capture',
  classify: 'classify',
  drift: 'drift',
  alert: 'alert',
  triage: 'triage',
  scheduler: 'scheduler',
} as const;

export type KnownJobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES];

/** Lifecycle status of a job. */
export type JobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'retrying'
  | 'cancelled';

/** A unit of work in the queue. */
export interface Job {
  id: string;
  jobType: string;
  status: JobStatus;
  /** Higher number = higher priority. Claimed priority-desc. */
  priority: number;
  sourceId?: string;
  payload?: Record<string, unknown>;
  /** ISO timestamp; job is not eligible to run before this instant. */
  scheduledFor: string;
  startedAt?: string;
  finishedAt?: string;
  errorMessage?: string;
  /**
   * Visibility lock (Phase 9). When a job is claimed it is held until this ISO
   * timestamp; once `lockedUntil < now` a `running` job is reclaimable. Unset
   * for jobs that are not currently claimed.
   */
  lockedUntil?: string;
  attemptCount: number;
  maxAttempts: number;
  createdAt: string;
  updatedAt: string;
}

/** A single execution attempt of a job. */
export interface JobAttempt {
  id: string;
  jobId: string;
  attemptNumber: number;
  startedAt: string;
  finishedAt?: string;
  status: JobStatus;
  errorMessage?: string;
  log?: Record<string, unknown>;
  createdAt: string;
}

/** Input to enqueue a new job. */
export interface EnqueueInput {
  jobType: string;
  priority?: number;
  sourceId?: string;
  payload?: Record<string, unknown>;
  /** Defaults to `now` when omitted. */
  scheduledFor?: string;
  maxAttempts?: number;
}

/** A cron-driven rule that fires jobs of a given type. */
export interface SchedulerRule {
  id: string;
  sourceId?: string;
  jobType: string;
  cronExpression: string;
  enabled: boolean;
  nextRunAt?: string;
  lastRunAt?: string;
}

/** Retry / backoff configuration. */
export interface RetryPolicy {
  maxAttempts: number;
  /** Base delay in seconds for the first retry. */
  baseSeconds: number;
  /** Exponential factor; defaults to 2. */
  factor?: number;
  /** Fraction (0..1) of the computed delay used as deterministic jitter. */
  jitterRatio?: number;
  /** Upper bound on backoff in seconds. */
  maxBackoffSeconds?: number;
}

/** Audit event kinds emitted by the engine. */
export type AuditEventType =
  | 'job_created'
  | 'job_claimed'
  | 'job_completed'
  | 'job_failed'
  | 'retry_scheduled'
  | 'job_cancelled'
  | 'rule_fired';

/** A structured audit record. */
export interface AuditEvent {
  at: string;
  type: AuditEventType;
  jobId?: string;
  ruleId?: string;
  message: string;
  meta?: Record<string, unknown>;
}

/**
 * DB-agnostic port for the job queue. The app/worker implements this against
 * Supabase (or any store); this package ships an in-memory implementation for
 * tests and offline use.
 */
export interface QueueStore {
  enqueue(input: EnqueueInput, now: string): Promise<Job>;
  /**
   * Atomically move due `queued`/`retrying` jobs whose `scheduledFor <= now`
   * into `running`, ordered oldest/highest-priority first.
   */
  claimNext(opts: {
    now: string;
    jobTypes?: string[];
    limit?: number;
  }): Promise<Job[]>;
  markCompleted(
    jobId: string,
    now: string,
    log?: Record<string, unknown>,
  ): Promise<void>;
  markFailedOrRetry(
    jobId: string,
    now: string,
    error: string,
    policy: RetryPolicy,
  ): Promise<FailureOutcome>;
  recordAttempt(attempt: JobAttempt): Promise<void>;
  cancel(jobId: string, now: string): Promise<void>;
  get(jobId: string): Promise<Job | null>;

  // --- Phase 9 (scaled queue hardening) — optional, visibility-aware ---------
  // These are optional so existing Phase-8 implementations still satisfy the
  // port. The DB store implements `claimBatch` via the Postgres
  // `claim_hsin_jobs` SKIP LOCKED RPC and `deadLetter` via `hsin_dead_letter_jobs`.

  /**
   * Atomic, visibility-aware claim. Selects due `queued`/`retrying` jobs and
   * reclaims `running` jobs whose visibility lock has expired, marks them
   * `running`, sets `lockedUntil = now + visibilitySeconds`, bumps
   * `attemptCount`, and returns them in deterministic order
   * (priority desc, scheduledFor asc, createdAt asc).
   */
  claimBatch?(opts: {
    now: string;
    limit: number;
    visibilitySeconds?: number;
    jobTypes?: string[];
  }): Promise<Job[]>;

  /** Extend a running job's visibility lock (for long-running work). */
  heartbeat?(
    jobId: string,
    now: string,
    visibilitySeconds?: number,
  ): Promise<void>;

  /** Force a job terminal (`failed`) and record a dead-letter entry. */
  deadLetter?(jobId: string, now: string, reason: string): Promise<void>;
}

/**
 * Outcome of {@link QueueStore.markFailedOrRetry}. `deadLettered` is set when
 * a terminal failure also produced a dead-letter entry (Phase 9). Back-compat:
 * `deadLettered` is optional, so existing `{ retried, nextRunAt }` consumers
 * are unaffected.
 */
export interface FailureOutcome {
  retried: boolean;
  nextRunAt?: string;
  deadLettered?: boolean;
}

/**
 * A {@link QueueStore} that also implements the Phase 9 scaled-queue methods as
 * required (non-optional) members. The DB store should satisfy this interface.
 */
export interface ScalableQueueStore extends QueueStore {
  claimBatch(opts: {
    now: string;
    limit: number;
    visibilitySeconds?: number;
    jobTypes?: string[];
  }): Promise<Job[]>;
  heartbeat(
    jobId: string,
    now: string,
    visibilitySeconds?: number,
  ): Promise<void>;
  deadLetter(jobId: string, now: string, reason: string): Promise<void>;
}
