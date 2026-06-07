// =============================================================================
// apps/worker/jobs — registry of all worker jobs.
// =============================================================================

import { captureSignalsJob } from './captureSignalsJob';
import { classifyJob } from './classifyJob';
import { detectChangesJob } from './detectChangesJob';
import { pollSourcesJob } from './pollSourcesJob';
import { traceabilityJob } from './traceabilityJob';
import type { Job } from './types';

export * from './types';
export * from './pollSourcesJob';
export * from './captureSignalsJob';
export * from './classifyJob';
export * from './traceabilityJob';
export * from './detectChangesJob';

/** All registered jobs, in pipeline order. */
export const jobs: Job[] = [
  pollSourcesJob,
  captureSignalsJob,
  classifyJob,
  traceabilityJob,
  detectChangesJob,
];

export const jobsByName: Record<string, Job> = Object.fromEntries(jobs.map((j) => [j.name, j]));
