// =============================================================================
// apps/worker/jobs — registry of all worker jobs.
// =============================================================================

import { captureSignalsJob } from './captureSignalsJob';
import { classifyJob } from './classifyJob';
import { detectChangesJob } from './detectChangesJob';
import { evidenceRefreshJob } from './evidence-refresh';
import { pollSourcesJob } from './pollSourcesJob';
import { traceabilityJob } from './traceabilityJob';
import type { Job } from './types';

export * from './types';
export * from './pollSourcesJob';
export * from './captureSignalsJob';
export * from './classifyJob';
export * from './traceabilityJob';
export * from './detectChangesJob';
export * from './evidence-refresh';

/** All registered jobs, in pipeline order. */
export const jobs: Job[] = [
  pollSourcesJob,
  captureSignalsJob,
  classifyJob,
  traceabilityJob,
  detectChangesJob,
  evidenceRefreshJob,
];

export const jobsByName: Record<string, Job> = Object.fromEntries(jobs.map((j) => [j.name, j]));
