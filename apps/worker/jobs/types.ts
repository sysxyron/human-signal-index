// =============================================================================
// apps/worker/jobs — job contract.
// Every job declares its inputs (ICM principle) and returns a structured result.
// Jobs are pure orchestration: connectors capture, packages analyze, jobs log.
// =============================================================================

import type { AppConfig } from '@hsi/config';

export interface JobContext {
  config: AppConfig;
  /** ISO timestamp for this run (provenance) — passed in, never Date.now() in jobs. */
  runAt: string;
}

export interface JobResult {
  job: string;
  ok: boolean;
  /** Declared inputs the job operated on (Inputs Clearly Marked). */
  declaredInputs: Record<string, unknown>;
  /** Structured, non-sensitive outcome summary. */
  summary: Record<string, unknown>;
  error?: string;
}

export interface Job {
  name: string;
  description: string;
  /** Suggested cron expression (consumed by the scheduler/Vercel cron). */
  schedule?: string;
  run: (ctx: JobContext) => Promise<JobResult>;
}
