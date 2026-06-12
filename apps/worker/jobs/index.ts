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
// HSI Phase 10 — temporal-intelligence pipeline.
import { temporalWorkerJob } from './temporal-worker';
// HSI Phase 11 — causal-intelligence pipeline.
import { causalWorkerJob } from './causal-worker';
// HSI Phase 12 — counterfactual-simulation pipeline.
import { counterfactualWorkerJob } from './counterfactual-worker';
// HSI Phase 13 — decision-intelligence pipeline.
import { decisionWorkerJob } from './decision-worker';
// HSI Phase 15 — outcome-tracking pipeline.
import { outcomeAlertWorkerJob } from './outcome-alert-worker';
// HSI Phase 18 — research-orchestration loop (Intelligence Operations Center).
import { researchOrchestratorJob } from './research-orchestrator';
// HSI Phase 19 — publishing/distribution loop (public intelligence platform).
import { publishingWorkerJob } from './publishing-worker';
// HSI Phase 20 — collective-intelligence consensus loop.
import { consensusWorkerJob } from './consensus-worker';
// HSI Phase 21 — forecasting / scenario / early-warning loop.
import { forecastWorkerJob } from './forecast-worker';
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
// HSI Phase 10 exports. temporal-worker IMPORTS the engine types under aliased
// names (TemporalEvolutionRecord / TemporalGenealogyEdge / TemporalInfluenceEdge
// / TemporalNarrativeForecast / TemporalNarrativeSnapshot / TemporalNarrativeInput
// / TemporalSignalInput / TemporalSnapshotCadence / TemporalDeps) and re-exports
// NONE of them, so the unaliased @hsi/temporal-intelligence types (EvolutionRecord,
// GenealogyEdge, InfluenceEdge, NarrativeForecast, SnapshotCadence, …) never
// collide with the drift/alert/queue jobs' own `export *` symbols above. Its
// public names (TemporalWorld, TemporalOutputs, TemporalPersistResult, the
// loader/persister types, makeTemporalWorkerJob, temporalWorkerJob) are distinct.
export * from './temporal-worker';
// HSI Phase 11 exports. causal-worker IMPORTS the engine types under aliased
// names (CausalChainResult / CausalEventResult / CausalInputBundle /
// CausalEvolutionRecord / CausalInfluenceEdge / CausalNarrativeForecast /
// CausalMilestone / CausalNarrativeSnapshot / CausalReplayFrame) and re-exports
// NONE of them, so the unaliased @hsi/causal-intelligence types never collide
// with the temporal/drift/alert jobs' own `export *` symbols above. Its public
// names (CausalReplayCadence, CausalWorld, CausalOutputs, CausalPersistResult,
// the loader/persister types, makeCausalWorkerJob, causalWorkerJob) are distinct
// (e.g. its CausalWorld vs the temporal worker's TemporalWorld).
export * from './causal-worker';
// HSI Phase 12 exports. counterfactual-worker IMPORTS the engine types under
// aliased names (CfInput / CfResult / CfWorld / CfBacktestRecord /
// CfForecastAccuracy / CfScenarioType / CfInterventionKey / CfCausalEvent /
// CfEvolutionRecord / CfNarrativeForecast / CfNarrativeSnapshot) and re-exports
// NONE of them, so the unaliased @hsi/counterfactual-engine types never collide
// with the causal/temporal jobs' own `export *` symbols above. Its public names
// (CfBacktestSample, CounterfactualWorld, CounterfactualOutputs,
// CounterfactualRunOutput, CounterfactualPersistResult, the loader/persister
// types, makeCounterfactualWorkerJob, counterfactualWorkerJob, plus the
// COUNTERFACTUAL_* / DEFAULT_COUNTERFACTUAL_* constants) are distinct (e.g. its
// CounterfactualWorld vs the causal worker's CausalWorld / temporal's TemporalWorld).
export * from './counterfactual-worker';
// HSI Phase 13 exports. decision-worker IMPORTS the engine types under aliased
// names (DecInput / DecRun / DecAudit / DecInterventionRanking / DecInterventionType
// / DecScenarioBattle / DecCrossImpact / DecCrossTarget / DecCausalEvent /
// DecEvolutionRecord / DecInfluenceEdge / DecNarrativeForecast / DecNarrativeSnapshot)
// and re-exports NONE of them, so the unaliased @hsi/decision-intelligence types
// never collide with the counterfactual/causal/temporal jobs' own `export *`
// symbols above. Its public names (DecisionWorld, DecisionRunOutput,
// DecisionOutputs, DecisionPersistResult, the loader/persister types,
// makeDecisionWorkerJob, decisionWorkerJob, plus the DEFAULT_DECISION_SCENARIO_*
// constants) are distinct (e.g. its DecisionWorld vs the counterfactual worker's
// CounterfactualWorld / causal's CausalWorld / temporal's TemporalWorld).
export * from './decision-worker';
// HSI Phase 15 exports. outcome-alert-worker IMPORTS the engine types under
// aliased names (OcLearningEntry / OcAlert / OcAlertInput / OcAlertType /
// OcEvaluation / OcNarrativeSnapshot) and re-exports NONE of them, so the
// unaliased @hsi/outcome-intelligence types (ConfidenceLearningEntry / OutcomeAlert
// / OutcomeEvaluation / NarrativeSnapshot, …) never collide with the decision/
// counterfactual/causal/temporal jobs' own `export *` symbols above (notably the
// re-exported NarrativeSnapshot which several engines define). Its public names
// (OutcomeWorld, OutcomeOutputs, OutcomePersistResult, the loader/persister types,
// makeOutcomeAlertWorkerJob, outcomeAlertWorkerJob) are distinct (e.g. its
// OutcomeWorld vs the decision worker's DecisionWorld).
export * from './outcome-alert-worker';

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
  // HSI Phase 10 — temporal-intelligence pipeline (daily 03:00). Offline-safe:
  // DB-backed when the service-role env is configured, else a deterministic
  // fixtures run that just logs the computed outputs. NEVER auto-publishes.
  temporalWorkerJob,
  // HSI Phase 11 — causal-intelligence pipeline (daily 04:00, after temporal at
  // 03:00). Offline-safe: DB-backed when the service-role env is configured,
  // else a deterministic fixtures run that just logs the computed outputs
  // (events → chains → replay frames → milestones). NEVER auto-publishes.
  causalWorkerJob,
  // HSI Phase 12 — counterfactual-simulation pipeline (daily 05:00, after causal
  // at 04:00). Offline-safe: DB-backed when the service-role env is configured,
  // else a deterministic fixtures run that just logs the computed outputs
  // (counterfactuals + interventions → backtest → calibrate → WorldForge
  // scenarios). Every counterfactual is an ESTIMATE; NEVER auto-publishes.
  counterfactualWorkerJob,
  // HSI Phase 13 — decision-intelligence pipeline (daily 06:00, after
  // counterfactual at 05:00). Offline-safe: DB-backed when the service-role env is
  // configured, else a deterministic fixtures run that just logs the computed
  // outputs (sensitivity → recommend → rank → decision run + audit → war-game →
  // cross impacts). Every recommendation is a decision AID; NEVER auto-publishes.
  decisionWorkerJob,
  // HSI Phase 15 — outcome-tracking pipeline (daily 07:00, after decision at
  // 06:00). Offline-safe: DB-backed when the service-role env is configured, else
  // a deterministic fixtures run (outcomeDemo) that just logs the computed outputs
  // (learn calibrated confidence → detect advisory alerts). Alerts are ADVISORY
  // only; NEVER auto-acts and NEVER auto-publishes.
  outcomeAlertWorkerJob,
  // HSI Phase 18 — the Intelligence Operations Center orchestration loop (every
  // 15 min). Polls the research queue, assigns agents, advances workflows, handles
  // failures, and escalates. Offline-safe (fixtures run when service-role env is
  // absent). NEVER auto-decides, NEVER auto-publishes; trust/governance left for
  // humans.
  researchOrchestratorJob,
  // HSI Phase 19 — the public-platform distribution loop (daily 08:00). Generates
  // the subscriber digest, plans distribution, and builds feeds. Offline-safe
  // (fixtures when service-role env is absent). NEVER publishes/approves/retracts;
  // never distributes unpublished intelligence.
  publishingWorkerJob,
  // HSI Phase 20 — the collective-intelligence consensus loop (every 30 min).
  // Recomputes consensus + contributor reliability, detects disputes, and flags
  // them for human governance review. Offline-safe (fixtures when service-role env
  // is absent). NEVER auto-approves / auto-consensus / auto-publishes.
  consensusWorkerJob,
  // HSI Phase 21 — the forecasting / scenario / early-warning loop (every 30 min).
  // Recomputes forecast reliability, refreshes scenario likelihoods, and detects
  // early warnings. Offline-safe (fixtures when service-role env is absent). NEVER
  // auto-predicts / auto-acts / auto-escalates / auto-publishes.
  forecastWorkerJob,
];

export const jobsByName: Record<string, Job> = Object.fromEntries(jobs.map((j) => [j.name, j]));
