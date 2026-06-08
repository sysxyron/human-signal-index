// =============================================================================
// apps/worker/jobs — queueWorkerJob (WorldForge/HSI Phase 8)
//
// The QUEUE DRAINER. It builds a @hsi/scheduler `createRunner({ store, handlers,
// policy, audit })` whose handlers map each JOB_TYPE to the corresponding
// Phase-8 step, then calls `runner.runOnce({ now, limit: SIGNAL_QUEUE_BATCH_SIZE })`.
// The runner claims due jobs, records attempts (hsin_job_attempts), runs each
// handler in isolation, then completes or retries/fails them per the retry
// policy. It logs the summary {claimed, completed, failed, retried}.
//
// HANDLERS — by default each is a SAFE no-op that returns ok:true (the real work
// is driven offline by the dedicated capture/classification/drift/alert/triage
// jobs, or live by an injected handler set). Override `handlers` to wire the live
// pipeline. A throwing handler NEVER crashes the runner (it routes to retry).
//
// OFFLINE-SAFE (binding): with no service-role env the QueueStore is in-memory
// (empty → claims nothing). The job is DISABLED unless QUEUE_WORKER_ENABLED===
// 'true'; disabled → logs "skipped" and returns cleanly. NEVER throws.
//
// SCHEDULING: cron '* * * * *' — an external scheduler invokes the drainer each
// minute (or run it as a long-lived loop calling runOnce).
// =============================================================================

import {
  JOB_TYPES,
  createAuditSink,
  createRunner,
  type HandlerResult,
  type Job as QueueJob,
  type JobHandler,
  type QueueStore,
} from '@hsi/scheduler';
import { logger } from '../src/logger';
import { readPhase8Config, retryPolicyFromConfig } from '../lib/config';
import { createWorkerQueueStore } from '../lib/queue-store';
import type { Job, JobContext, JobResult } from './types';

/** A map of jobType → handler that the runner dispatches to. */
export type QueueHandlers = Record<string, JobHandler>;

/**
 * Default handlers: each step acknowledges the job (ok:true) and logs what it
 * would do. They are intentionally side-effect-free so draining the queue is
 * safe out of the box. Wire the live pipeline by passing custom handlers.
 */
function defaultHandlers(): QueueHandlers {
  const ack =
    (step: string): JobHandler =>
    async (job: QueueJob): Promise<HandlerResult> => {
      logger.info('job.queueWorker.handler', {
        step,
        jobId: job.id,
        jobType: job.jobType,
        sourceId: job.sourceId,
        attempt: job.attemptCount,
      });
      return {
        ok: true,
        log: { step, jobId: job.id, note: 'default no-op handler (no live pipeline wired)' },
      };
    };
  return {
    [JOB_TYPES.capture]: ack('capture'),
    [JOB_TYPES.classify]: ack('classify'),
    [JOB_TYPES.drift]: ack('drift'),
    [JOB_TYPES.alert]: ack('alert'),
    [JOB_TYPES.triage]: ack('triage'),
    [JOB_TYPES.scheduler]: ack('scheduler'),
  };
}

export function makeQueueWorkerJob(
  handlersFactory: () => QueueHandlers = defaultHandlers,
  storeFactory: () => QueueStore = createWorkerQueueStore,
): Job {
  return {
    name: 'queueWorker',
    description:
      'Drains the job queue: claims due jobs, runs per-type handlers, retries/fails per policy.',
    schedule: '* * * * *',
    async run(ctx: JobContext): Promise<JobResult> {
      const now = ctx.runAt;
      const cfg = readPhase8Config();

      if (!cfg.queueWorkerEnabled) {
        logger.info('job.queueWorker.skipped', {
          reason: 'disabled (QUEUE_WORKER_ENABLED!=="true")',
          runAt: now,
        });
        return {
          job: 'queueWorker',
          ok: true,
          declaredInputs: { enabled: false, runAt: now },
          summary: { skipped: true, reason: 'disabled' },
        };
      }

      const declaredInputs = {
        enabled: true,
        batchSize: cfg.queueBatchSize,
        maxAttempts: cfg.jobMaxAttempts,
        backoffBaseSeconds: cfg.backoffBaseSeconds,
        serviceRole: cfg.hasServiceRole,
        runAt: now,
      };
      logger.info('job.queueWorker.start', { declaredInputs });

      const store = storeFactory();
      const audit = createAuditSink();
      const runner = createRunner({
        store,
        handlers: handlersFactory(),
        policy: retryPolicyFromConfig(cfg),
        audit,
        now,
      });

      // runOnce NEVER throws (the runner isolates per-job failures), but guard
      // anyway so a store-level surprise can't crash the worker process.
      let summary = { claimed: 0, completed: 0, failed: 0, retried: 0 };
      try {
        summary = await runner.runOnce({ now, limit: cfg.queueBatchSize });
      } catch (e) {
        logger.warn('job.queueWorker.runFailed', {
          error: e instanceof Error ? e.message : String(e),
        });
      }

      logger.info('job.queueWorker.done', {
        ...summary,
        auditEvents: audit.events().length,
      });

      return {
        job: 'queueWorker',
        ok: true,
        declaredInputs,
        summary: { ...summary },
      };
    },
  };
}

export const queueWorkerJob = makeQueueWorkerJob();
