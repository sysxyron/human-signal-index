/**
 * @hsi/scheduler — production scheduler + job-queue engine (WorldForge/HSI
 * Phase 8). Pure, deterministic, zero runtime dependencies.
 *
 * The DB-backed store is implemented by the app/worker against
 * {@link QueueStore} / {@link DedupeStore}; this package provides in-memory
 * implementations for tests and offline use.
 */

export * from './types';
export {
  JOB_TYPES,
} from './types';

// Backoff
export { computeBackoffSeconds, nextRunAt } from './backoff';

// Retry
export {
  shouldRetry,
  decideAfterFailure,
  withPerSourceBackoff,
} from './retry';
export type { FailureDecision } from './retry';

// Cron
export {
  parseCron,
  nextRunAfter,
  isDue,
  describeCron,
  CronParseError,
} from './cron';
export type { CronSpec } from './cron';

// Queue
export {
  InMemoryQueueStore,
  nextDueRules,
  advanceRule,
} from './queue';
export type { InMemoryQueueStoreOptions } from './queue';

// Dedupe
export {
  dedupeKey,
  InMemoryDedupeStore,
  isDuplicate,
} from './dedupe';
export type {
  DedupeStore,
  DedupeRecord,
  DuplicateResult,
} from './dedupe';

// Audit
export {
  createAuditSink,
  jobCreated,
  jobClaimed,
  jobCompleted,
  jobFailed,
  retryScheduled,
  jobCancelled,
  ruleFired,
} from './audit';
export type { AuditSink } from './audit';

// Runner
export { createRunner, enqueue } from './runner';
export type {
  Runner,
  RunnerConfig,
  RunnerAudit,
  RunOnceOptions,
  RunSummary,
  HandlerResult,
  JobHandler,
} from './runner';

import type { RetryPolicy } from './types';

/** Sensible default retry policy: 3 attempts, 30s base, x2, 10% jitter, 1h cap. */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseSeconds: 30,
  factor: 2,
  jitterRatio: 0.1,
  maxBackoffSeconds: 3600,
};
