// =============================================================================
// apps/worker — job runner / scheduler skeleton.
//
// Responsibilities:
//   * Load + validate config (requires CRON_SECRET).
//   * Register jobs and run them with structured logging + declared inputs.
//   * OpenTelemetry-ready + Sentry-ready hooks (optional, documented in logger).
//
// Runnable skeleton: `pnpm --filter @hsi/worker dev` runs all jobs once. A real
// scheduler (Vercel Cron / node-cron) calls runJob(name) per cron entry. Jobs
// are pure orchestration; data loaders are injected at the job level so this
// runs without the database package (owned by another agent).
// =============================================================================

import 'dotenv/config';
import { loadConfig, type AppConfig } from '@hsi/config';

import { jobs, jobsByName, type Job, type JobContext, type JobResult } from '../jobs';
import { captureException, logger } from './logger';

/** Verify the caller supplied the cron secret (defense-in-depth for triggers). */
export function assertCronSecret(config: AppConfig, providedSecret: string | undefined): void {
  if (!providedSecret || providedSecret !== config.CRON_SECRET) {
    throw new Error('Unauthorized: missing or invalid CRON_SECRET.');
  }
}

/** Run a single job by name with structured logging + error capture. */
export async function runJob(name: string, ctx: JobContext): Promise<JobResult> {
  const job: Job | undefined = jobsByName[name];
  if (!job) throw new Error(`Unknown job: ${name}`);
  const startedAt = Date.now();
  logger.info('worker.job.start', { job: name, runAt: ctx.runAt });
  try {
    const result = await job.run(ctx);
    logger.info('worker.job.done', { job: name, ok: result.ok, ms: Date.now() - startedAt });
    return result;
  } catch (err) {
    await captureException(err, { job: name });
    return {
      job: name,
      ok: false,
      declaredInputs: { runAt: ctx.runAt },
      summary: {},
      error: String((err as Error)?.message ?? err),
    };
  }
}

/** Run every registered job once (pipeline order). */
export async function runAllJobs(ctx: JobContext): Promise<JobResult[]> {
  const results: JobResult[] = [];
  for (const job of jobs) {
    results.push(await runJob(job.name, ctx));
  }
  return results;
}

/** Entry point for `pnpm dev` / `node dist/index.js`. */
async function main(): Promise<void> {
  let config: AppConfig;
  try {
    config = loadConfig(process.env);
  } catch (err) {
    logger.error('worker.config.invalid', { error: String((err as Error)?.message ?? err) });
    process.exit(1);
    return;
  }

  // CRON_SECRET is required to run the scheduler entry point.
  assertCronSecret(config, process.env.CRON_SECRET);

  const ctx: JobContext = { config, runAt: new Date().toISOString() };
  logger.info('worker.start', {
    jobs: jobs.map((j) => ({ name: j.name, schedule: j.schedule })),
    aiProvider: config.AI_PROVIDER,
    traceabilityThreshold: config.TRACEABILITY_MIN_CONFIDENCE,
  });

  const results = await runAllJobs(ctx);
  const failed = results.filter((r) => !r.ok);
  logger.info('worker.complete', { total: results.length, failed: failed.length });
  if (failed.length) process.exit(1);
}

// Only auto-run when invoked directly (not when imported by a cron handler).
const invokedDirectly =
  typeof process !== 'undefined' && process.argv[1] && /worker[\\/](src[\\/])?index/.test(process.argv[1]);
if (invokedDirectly) {
  main().catch(async (error) => {
    await captureException(error, { phase: 'main' });
    process.exit(1);
  });
}
