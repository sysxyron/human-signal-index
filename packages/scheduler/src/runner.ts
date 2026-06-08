/**
 * @hsi/scheduler — job runner.
 *
 * Claims due jobs, dispatches them to per-type handlers, records attempts, and
 * routes failures through the retry policy. A handler that throws (or returns
 * `ok: false`) must never crash the runner: failures are isolated per job.
 */

import {
  jobClaimed,
  jobCompleted,
  jobFailed,
  retryScheduled,
} from './audit';
import type { InMemoryQueueStore } from './queue';
import type {
  AuditEvent,
  EnqueueInput,
  Job,
  JobAttempt,
  QueueStore,
  RetryPolicy,
} from './types';

/** Result returned by a job handler. */
export interface HandlerResult {
  ok: boolean;
  log?: Record<string, unknown>;
  error?: string;
}

/** A handler for a single job type. */
export type JobHandler = (job: Job) => Promise<HandlerResult>;

/** Minimal sink shape the runner needs. */
export interface RunnerAudit {
  record(event: AuditEvent): void;
}

/** Configuration for {@link createRunner}. */
export interface RunnerConfig {
  store: QueueStore;
  handlers: Record<string, JobHandler>;
  policy: RetryPolicy;
  audit?: RunnerAudit;
  /** Wall-clock supplied by the caller — never read internally. */
  now: string;
}

/** Options for a single run pass. */
export interface RunOnceOptions {
  now: string;
  jobTypes?: string[];
  limit?: number;
}

/** Summary of a run pass. */
export interface RunSummary {
  claimed: number;
  completed: number;
  failed: number;
  retried: number;
}

/** A runner instance bound to a store + handlers + policy. */
export interface Runner {
  runOnce(opts: RunOnceOptions): Promise<RunSummary>;
}

let attemptSeq = 0;

/** Best-effort deterministic attempt id; uses the store counter when available. */
function attemptId(store: QueueStore, jobId: string, attemptNumber: number): string {
  const maybe = store as Partial<InMemoryQueueStore>;
  if (typeof maybe.generateId === 'function') {
    return maybe.generateId('att');
  }
  attemptSeq += 1;
  return `att-${jobId}-${attemptNumber}-${attemptSeq}`;
}

/**
 * Create a runner. `runOnce` claims due jobs, executes each handler in
 * isolation, records attempts, completes or retries/fails, and emits audit
 * events. It never throws — a misbehaving handler only fails its own job.
 */
export function createRunner(config: RunnerConfig): Runner {
  const { store, handlers, policy, audit } = config;

  async function runOnce(opts: RunOnceOptions): Promise<RunSummary> {
    const summary: RunSummary = {
      claimed: 0,
      completed: 0,
      failed: 0,
      retried: 0,
    };

    let claimed: Job[];
    try {
      claimed = await store.claimNext({
        now: opts.now,
        jobTypes: opts.jobTypes,
        limit: opts.limit,
      });
    } catch {
      // If even claiming fails, report an empty pass rather than throwing.
      return summary;
    }

    summary.claimed = claimed.length;

    for (const job of claimed) {
      audit?.record(jobClaimed(opts.now, job.id, { jobType: job.jobType }));

      const attempt: JobAttempt = {
        id: attemptId(store, job.id, job.attemptCount),
        jobId: job.id,
        attemptNumber: job.attemptCount,
        startedAt: opts.now,
        status: 'running',
        createdAt: opts.now,
      };
      try {
        await store.recordAttempt(attempt);
      } catch {
        // Attempt logging is best-effort; continue executing the job.
      }

      const handler = handlers[job.jobType];
      let result: HandlerResult;
      if (!handler) {
        result = { ok: false, error: `no handler for jobType "${job.jobType}"` };
      } else {
        try {
          result = await handler(job);
        } catch (err) {
          result = {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }

      if (result.ok) {
        try {
          await store.markCompleted(job.id, opts.now, result.log);
        } catch {
          // ignore store error; still count as completed handler-side
        }
        try {
          await store.recordAttempt({
            ...attempt,
            finishedAt: opts.now,
            status: 'completed',
            log: result.log,
          });
        } catch {
          /* best-effort */
        }
        summary.completed += 1;
        audit?.record(jobCompleted(opts.now, job.id, { jobType: job.jobType }));
        continue;
      }

      const error = result.error ?? 'handler returned ok=false';
      let outcome: { retried: boolean; nextRunAt?: string };
      try {
        outcome = await store.markFailedOrRetry(job.id, opts.now, error, policy);
      } catch {
        outcome = { retried: false };
      }

      try {
        await store.recordAttempt({
          ...attempt,
          finishedAt: opts.now,
          status: outcome.retried ? 'retrying' : 'failed',
          errorMessage: error,
          log: result.log,
        });
      } catch {
        /* best-effort */
      }

      if (outcome.retried) {
        summary.retried += 1;
        audit?.record(
          retryScheduled(opts.now, job.id, outcome.nextRunAt ?? opts.now, {
            jobType: job.jobType,
            error,
          }),
        );
      } else {
        summary.failed += 1;
        audit?.record(jobFailed(opts.now, job.id, error, { jobType: job.jobType }));
      }
    }

    return summary;
  }

  return { runOnce };
}

/**
 * Convenience helper to enqueue a job and (optionally) emit a `job_created`
 * audit event. Returns the created job.
 */
export async function enqueue(
  store: QueueStore,
  input: EnqueueInput,
  now: string,
  audit?: RunnerAudit,
): Promise<Job> {
  const job = await store.enqueue(input, now);
  audit?.record({
    at: now,
    type: 'job_created',
    jobId: job.id,
    message: `job ${job.id} created`,
    meta: { jobType: job.jobType },
  });
  return job;
}
