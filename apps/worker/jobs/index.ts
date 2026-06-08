// =============================================================================
// apps/worker/jobs — registry of all worker jobs.
// =============================================================================

import { captureSignalsJob } from './captureSignalsJob';
import { classifyJob } from './classifyJob';
import { detectChangesJob } from './detectChangesJob';
import { evidenceRefreshJob } from './evidence-refresh';
import { pollSourcesJob } from './pollSourcesJob';
import { traceabilityJob } from './traceabilityJob';
// HSIN Phase 7 — signal-intelligence jobs.
import { sourceMonitorJob } from './source-monitor';
import { rssMonitorJob } from './rss-monitor';
import { signalClassifierJob } from './signal-classifier';
import { driftDetectorJob } from './drift-detector';
import { alertGeneratorJob } from './alert-generator';
import type { Job } from './types';

export * from './types';
export * from './pollSourcesJob';
export * from './captureSignalsJob';
export * from './classifyJob';
export * from './traceabilityJob';
export * from './detectChangesJob';
export * from './evidence-refresh';
// HSIN Phase 7 exports.
export * from './source-monitor';
export * from './rss-monitor';
export * from './signal-classifier';
export * from './drift-detector';
export * from './alert-generator';

/** All registered jobs, in pipeline order. */
export const jobs: Job[] = [
  pollSourcesJob,
  captureSignalsJob,
  classifyJob,
  traceabilityJob,
  detectChangesJob,
  evidenceRefreshJob,
  // HSIN Phase 7 — signal-intelligence pipeline jobs.
  sourceMonitorJob,
  rssMonitorJob,
  signalClassifierJob,
  driftDetectorJob,
  alertGeneratorJob,
];

export const jobsByName: Record<string, Job> = Object.fromEntries(jobs.map((j) => [j.name, j]));
