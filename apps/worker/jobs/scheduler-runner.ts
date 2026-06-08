// =============================================================================
// apps/worker/jobs — schedulerRunnerJob (WorldForge/HSI Phase 8)
//
// The cron "tick". Every minute it loads ENABLED hsin_scheduler_rules, finds the
// rules that are DUE (@hsi/scheduler nextDueRules), and for each: enqueues a job
// of the rule's job_type into the QueueStore, then ADVANCES the rule
// (last_run_at = now, next_run_at = next cron match). Each fire emits a
// 'rule_fired' audit event. The queue worker (queueWorkerJob) drains what this
// enqueues.
//
// OFFLINE-SAFE (binding): rules are loaded via an INJECTED loader (default no-op
// → zero rules → nothing enqueued). With no service-role env the QueueStore is
// the in-memory store, so a tick is a harmless no-op. The job is DISABLED unless
// SCHEDULER_ENABLED==='true'; disabled → logs "skipped" and returns cleanly.
//
// NEVER throws: a single failing rule is caught + counted; a failing loader is
// treated as zero rules. ICM: declared inputs (rule/due counts, enabled, runAt)
// are logged on start; outputs (fired/enqueued/advanced/failed) on done.
//
// SCHEDULING: cron '* * * * *' — an EXTERNAL scheduler (Vercel Cron / system
// cron, guarded by CRON_SECRET) invokes it each minute.
// =============================================================================

import {
  advanceRule,
  createAuditSink,
  enqueue,
  nextDueRules,
  type AuditEvent,
  type QueueStore,
  type SchedulerRule,
} from '@hsi/scheduler';
import { logger } from '../src/logger';
import { readPhase8Config } from '../lib/config';
import { createWorkerQueueStore } from '../lib/queue-store';
import type { Job, JobContext, JobResult } from './types';

/** Loads the ENABLED scheduler rules to evaluate (default: none — safe no-op). */
export type LoadSchedulerRules = (ctx: JobContext) => Promise<SchedulerRule[]>;

/** Persists an advanced rule (last_run_at/next_run_at). Default no-op. */
export type PersistAdvancedRule = (rule: SchedulerRule) => Promise<void>;

const defaultLoadRules: LoadSchedulerRules = async () => [];
const defaultPersistRule: PersistAdvancedRule = async () => {};

export function makeSchedulerRunnerJob(
  load: LoadSchedulerRules = defaultLoadRules,
  persistRule: PersistAdvancedRule = defaultPersistRule,
  storeFactory: () => QueueStore = createWorkerQueueStore,
): Job {
  return {
    name: 'schedulerRunner',
    description:
      'Cron tick: fires due scheduler rules by enqueuing jobs + advancing the cron cursor.',
    schedule: '* * * * *',
    async run(ctx: JobContext): Promise<JobResult> {
      const now = ctx.runAt;
      const cfg = readPhase8Config();

      // Master switch: disabled unless explicitly enabled.
      if (!cfg.schedulerEnabled) {
        logger.info('job.schedulerRunner.skipped', {
          reason: 'disabled (SCHEDULER_ENABLED!=="true")',
          runAt: now,
        });
        return {
          job: 'schedulerRunner',
          ok: true,
          declaredInputs: { enabled: false, runAt: now },
          summary: { skipped: true, reason: 'disabled' },
        };
      }

      let rules: SchedulerRule[] = [];
      try {
        rules = await load(ctx);
      } catch (e) {
        logger.warn('job.schedulerRunner.loadFailed', {
          error: e instanceof Error ? e.message : String(e),
        });
        rules = [];
      }

      const due = nextDueRules(rules, now);
      const declaredInputs = {
        enabled: true,
        ruleCount: rules.length,
        dueCount: due.length,
        serviceRole: cfg.hasServiceRole,
        runAt: now,
      };
      logger.info('job.schedulerRunner.start', { declaredInputs });

      const audit = createAuditSink();
      const store = storeFactory();

      let fired = 0;
      let enqueued = 0;
      let advanced = 0;
      let failed = 0;

      for (const rule of due) {
        try {
          const job = await enqueue(
            store,
            {
              jobType: rule.jobType,
              sourceId: rule.sourceId,
              priority: 5,
              maxAttempts: cfg.jobMaxAttempts,
              payload: { ruleId: rule.id, firedAt: now },
            },
            now,
            audit,
          );
          enqueued += 1;

          // Record the fire in the audit trail.
          const fire: AuditEvent = {
            at: now,
            type: 'rule_fired',
            ruleId: rule.id,
            jobId: job.id,
            message: `Rule ${rule.id} fired → enqueued ${rule.jobType} job ${job.id}.`,
            meta: { jobType: rule.jobType, sourceId: rule.sourceId },
          };
          audit.record(fire);
          fired += 1;

          // Advance the cron cursor + persist.
          const next = advanceRule(rule, now);
          await persistRule(next).catch((e) =>
            logger.warn('job.schedulerRunner.persistRuleFailed', {
              ruleId: rule.id,
              error: e instanceof Error ? e.message : String(e),
            }),
          );
          advanced += 1;

          logger.info('job.schedulerRunner.fired', {
            ruleId: rule.id,
            jobType: rule.jobType,
            jobId: job.id,
            nextRunAt: next.nextRunAt,
          });
        } catch (e) {
          failed += 1;
          logger.warn('job.schedulerRunner.ruleFailed', {
            ruleId: rule.id,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      logger.info('job.schedulerRunner.done', {
        fired,
        enqueued,
        advanced,
        failed,
        auditEvents: audit.events().length,
      });

      return {
        job: 'schedulerRunner',
        ok: true,
        declaredInputs,
        summary: { fired, enqueued, advanced, failed },
      };
    },
  };
}

export const schedulerRunnerJob = makeSchedulerRunnerJob();
