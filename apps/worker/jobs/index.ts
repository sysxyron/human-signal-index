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
// HSI Phase 8 — scheduler, queue & narrative-graph jobs.
import { schedulerRunnerJob } from './scheduler-runner';
import { queueWorkerJob } from './queue-worker';
import { captureWorkerJob } from './capture-worker';
import { classificationWorkerJob } from './classification-worker';
import { driftWorkerJob } from './drift-worker';
import { alertWorkerJob } from './alert-worker';
import { triageWorkerJob } from './triage-worker';
// HSI Phase 9 — SLA escalation watchdog.
import { slaEscalationJob } from './sla-escalation-worker';
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
// HSI Phase 8 exports. NOTE: drift-worker re-exports its own DriftEventRecord /
// NarrativeTimeline types; alert-worker its AlertableSignal; no symbol collides
// with the Phase-7 jobs above (driftDetector exports DriftCandidate/DriftRecord;
// alertGenerator exports ScannableSignal). Job NAMES are distinct too
// (driftWorker vs driftDetector, alertWorker vs alertGenerator).
export * from './scheduler-runner';
export * from './queue-worker';
export * from './capture-worker';
export * from './classification-worker';
export * from './drift-worker';
export * from './alert-worker';
export * from './triage-worker';
// HSI Phase 9 exports. sla-escalation-worker only IMPORTS the SLA types
// (SlaPolicy/SlaSeverity/SlaStatus) from @hsi/source-intelligence — it does not
// re-export them — and its public names (SlaReviewItem, SlaEscalation,
// slaEscalationJob, makeSlaEscalationJob, dbLoad/dbPersist...) don't collide
// with the triage-worker's exports above.
export * from './sla-escalation-worker';

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
  // HSI Phase 8 — scheduler, queue & narrative-graph jobs. Disabled-by-default
  // (env-gated) and offline-safe; they no-op cleanly until flags/keys are set.
  schedulerRunnerJob,
  queueWorkerJob,
  captureWorkerJob,
  classificationWorkerJob,
  driftWorkerJob,
  alertWorkerJob,
  triageWorkerJob,
  // HSI Phase 9 — SLA escalation watchdog (offline-safe; DB-backed when the
  // service-role env is configured, else a clean no-op). NEVER auto-publishes.
  slaEscalationJob,
];

export const jobsByName: Record<string, Job> = Object.fromEntries(jobs.map((j) => [j.name, j]));
