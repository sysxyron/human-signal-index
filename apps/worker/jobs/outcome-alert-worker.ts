// =============================================================================
// apps/worker/jobs — outcomeAlertWorkerJob (WorldForge/HSI Phase 15)
//
// "Did the recommendation actually work — and are recommendations getting
// better?" The daily OUTCOME-TRACKING + CONFIDENCE-LEARNING + ADVISORY-ALERTING
// pipeline. Where Phase-13 (decision) RECOMMENDS strategic actions, this worker
// closes the decision → outcome → learning loop by running the pure
// @hsi/outcome-intelligence engine over the OBSERVED reality of each recent
// recommendation in staged steps, each independently fault-isolated (a stage
// failure logs + continues — the worker NEVER throws fatally):
//
//   1. LEARN  — learnFromOutcomes(evaluations, prior, now): aggregate the recent
//               OutcomeEvaluations by intervention type and fold them onto the
//               prior learning rows → a calibrated confidence per type (repeated
//               success raises it; repeated failure lowers it; never certainty).
//   2. ALERTS — detectOutcomeAlerts(input): threshold-gated, explainable ADVISORY
//               alerts across every supplied source — recommendation_failed,
//               confidence_drift, narrative_spike, forecast_miss, resurgence,
//               security_anomaly. Pure data for a human reviewer; never acts.
//   3. PERSIST + AUDIT — write the advisory alerts into hsin_decision_alerts and
//               UPSERT the learned confidence into hsin_confidence_learning;
//               append an audit_logs event.
//
// PURITY: the engine is pure & deterministic. The job derives a single `now`
// (ctx.runAt) and INJECTS it into the alert input — it NEVER calls Date.now()
// inside the engine. No network, no keys.
//
// OFFLINE-SAFE (binding): the recent outcome evaluations + prior confidence
// learning + narrative snapshots + forecast (predicted-vs-actual) pairs + security
// signals are read via an INJECTED loader and the outputs are written via an
// INJECTED persister. The DEFAULT loader/persister operate on the service-role
// Supabase (the Phase-15 hsin_recommendation_outcomes / hsin_confidence_learning +
// Phase-10 hsin_narrative_snapshots / hsin_narrative_forecasts tables → read; the
// Phase-15 hsin_decision_alerts table → write, hsin_confidence_learning → upsert)
// WHEN the service-role env is configured; otherwise they degrade to the
// outcomeDemo() / fixtures bundle (loader) and a no-op (persister), and the
// computed outputs are just logged. Empty env → a clean, deterministic fixtures
// run. NEVER throws.
//
// GOVERNANCE: this worker only MEASURES / LEARNS / ALERTS. It NEVER auto-publishes
// a narrative, never decides a review, never auto-acts on an alert, never asserts
// truth — every alert is ADVISORY (carrying an explicit explanation) for a HUMAN
// reviewer. An audit_logs event ('outcome.alert.pipeline') is appended (with
// autoPublish:false + autoAct:false in its metadata) when the DB is configured.
//
// ICM: declared INPUTS (outcomeCount, learningCount, snapshotCount, forecastCount,
// securitySignalCount, mode) and OUTPUTS (alerts/learningEntries counts, alerts by
// type) are logged.
//
// SCHEDULING: cron '0 7 * * *' (daily 07:00 UTC) — AFTER the Phase-13 decision
// worker (06:00) so the recommendation outcomes it tracks are fresh. Driven by an
// external scheduler; the worker has no internal scheduler.
// =============================================================================

import {
  detectOutcomeAlerts,
  learnFromOutcomes,
  outcomeDemo,
  type ConfidenceLearningEntry as OcLearningEntry,
  type OutcomeAlert as OcAlert,
  type OutcomeAlertInput as OcAlertInput,
  type OutcomeAlertType as OcAlertType,
  type OutcomeEvaluation as OcEvaluation,
  type NarrativeSnapshot as OcNarrativeSnapshot,
} from '@hsi/outcome-intelligence';
import {
  calibrate as cbCalibrate,
  computeBrierScore as cbComputeBrierScore,
  computeTrustScore as cbComputeTrustScore,
  detectConfidenceDrift as cbDetectConfidenceDrift,
  driftSeverity as cbDriftSeverity,
  DEMO_PREDICTIONS as CB_DEMO_PREDICTIONS,
  BRIER_FAIR as CB_BRIER_FAIR,
  type Prediction as CbPrediction,
  type ReliabilityCurve as CbReliabilityCurve,
  type ConfidenceDriftResult as CbConfidenceDriftResult,
  type BrierResult as CbBrierResult,
  type TrustInputs as CbTrustInputs,
  type TrustScore as CbTrustScore,
} from '@hsi/calibration-engine';
import { createServiceRoleClient } from '@hsi/database';
import { logger } from '../src/logger';
import type { Job, JobContext, JobResult } from './types';

// =============================================================================
// Phase 16 — CALIBRATION / TRUST alert layer (EXTENDS Phase-15).
//
// The four NEW alert types added to hsin_decision_alerts by migration 0020.
// These are DISTINCT from the Phase-15 OutcomeAlertType union (which the engine
// owns); they are computed here from the @hsi/calibration-engine outputs and
// appended to the SAME advisory alert stream (persisted, status 'open', never
// auto-acted).
// =============================================================================

/** The four Phase-16 alert types (migration 0020). */
export type CalibrationAlertType =
  | 'calibration_drift'
  | 'confidence_instability'
  | 'forecast_miscalibration'
  | 'trust_collapse';

/**
 * A Phase-16 calibration/trust advisory alert. Structurally compatible with the
 * Phase-15 OcAlert (same severity/message/explanation/metadata) so the persister
 * can write both via one insert path. NEVER auto-acts — pure data for a reviewer.
 */
export interface CalibrationAlert {
  alertType: CalibrationAlertType;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  explanation: string;
  decisionRunId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

/** Thresholds for the Phase-16 calibration/trust alert gates (documented). */
export const CALIBRATION_ALERT_THRESHOLDS = {
  /** ECE swing (|currentEce − priorEce|) at/above which confidence is unstable. */
  instabilityEce: 0.15,
  /** Drift magnitude at/above which confidence is unstable (no prior needed). */
  instabilityMagnitude: 0.5,
  /** Forecast Brier at/above which the forecast kind is miscalibrated (poor). */
  forecastBrierPoor: CB_BRIER_FAIR,
  /** Trust score (0..100) below which a tracked entity is flagged collapsing. */
  trustCollapse: 40,
} as const;

/** The recent observed evidence the engine learns + alerts from for one run. */
export interface OutcomeWorld {
  /** Recent recommendation outcome evaluations (the heart of the loop). */
  evaluations: OcEvaluation[];
  /** The PRIOR learned confidence rows to fold this batch onto (incremental). */
  priorLearning: OcLearningEntry[];
  /** Recent narrative snapshots (spike / resurgence detection). */
  snapshots: OcNarrativeSnapshot[];
  /** Forecast predicted-vs-actual pairs (forecast_miss detection). */
  forecasts: { predicted: string; actual: string }[];
  /** Recent security signals (security_anomaly passthrough). */
  securitySignals: { type: string; severity: string }[];
  /**
   * Phase-16: stated-confidence predictions paired with observed outcomes, built
   * from the loaded outcome/forecast history. Offline → DEMO_PREDICTIONS.
   */
  predictions: CbPrediction[];
  /**
   * Phase-16: the PRIOR reliability curve snapshot (e.g. the last persisted
   * calibration curve) to compare drift against — undefined when none exists.
   */
  priorCurve?: CbReliabilityCurve;
  /**
   * Phase-16: trust inputs for a few tracked entities (sources/narratives/etc.)
   * whose collapsing trust should be flagged. Empty → no trust_collapse checks.
   */
  trustInputs: CbTrustInputs[];
}

/** The full set of computed outputs handed to the persister. */
export interface OutcomeOutputs {
  /** Advisory alerts (NEVER auto-acted). */
  alerts: OcAlert[];
  /** The re-learned confidence rows to upsert. */
  learning: OcLearningEntry[];
  /** Phase-16 calibration/trust advisory alerts (NEVER auto-acted). */
  calibrationAlerts: CalibrationAlert[];
}

/** Best-effort report of which output sets were persisted (for the summary). */
export interface OutcomePersistResult {
  alerts: number;
  learningEntries: number;
  /** Phase-16 calibration/trust alerts written to hsin_decision_alerts. */
  calibrationAlerts: number;
  audited: boolean;
}

/** Loads the recent observed evidence (DB when configured, else fixtures). */
export type LoadOutcomeWorld = (ctx: JobContext) => Promise<OutcomeWorld>;

/** Persists the computed outcome outputs (DB when configured, else no-op). */
export type PersistOutcomeOutputs = (
  outputs: OutcomeOutputs,
  ctx: JobContext,
) => Promise<OutcomePersistResult>;

const EMPTY_PERSIST: OutcomePersistResult = {
  alerts: 0,
  learningEntries: 0,
  calibrationAlerts: 0,
  audited: false,
};

const EMPTY_WORLD: OutcomeWorld = {
  evaluations: [],
  priorLearning: [],
  snapshots: [],
  forecasts: [],
  securitySignals: [],
  predictions: [],
  trustInputs: [],
};

export function makeOutcomeAlertWorkerJob(
  load: LoadOutcomeWorld = defaultLoadOutcomeWorld,
  persist: PersistOutcomeOutputs = defaultPersistOutcomeOutputs,
): Job {
  return {
    name: 'outcomeAlert',
    description:
      'Daily outcome pipeline: learn calibrated confidence from observed outcomes → detect advisory alerts (failures/drift/spikes/forecast misses/resurgence/security) + Phase-16 calibration/trust alerts (calibration_drift/confidence_instability/forecast_miscalibration/trust_collapse) (never auto-acts, never auto-publishes).',
    schedule: '0 7 * * *',
    async run(ctx: JobContext): Promise<JobResult> {
      // Deterministic clock is injected into the pure engine. We NEVER call
      // Date.now() inside the engine — `now` flows from the job context.
      const now = ctx.runAt;
      const offline = !outcomeServiceRoleConfigured();

      // ---- Load the world (loader failure → empty, never fatal) --------------
      let world: OutcomeWorld = { ...EMPTY_WORLD };
      try {
        world = await load(ctx);
      } catch (e) {
        logger.warn('job.outcomeAlert.loadFailed', {
          error: e instanceof Error ? e.message : String(e),
        });
      }

      const declaredInputs = {
        outcomeCount: world.evaluations.length,
        learningCount: world.priorLearning.length,
        snapshotCount: world.snapshots.length,
        forecastCount: world.forecasts.length,
        securitySignalCount: world.securitySignals.length,
        // Phase-16 inputs.
        predictionCount: world.predictions.length,
        trustInputCount: world.trustInputs.length,
        hasPriorCurve: world.priorCurve !== undefined,
        mode: offline ? 'offline-fixtures-or-noop' : 'db',
        runAt: now,
        // BINDING: the outcome worker only measures/learns/alerts — never acts.
        autoPublish: false,
        autoAct: false,
      };
      logger.info('job.outcomeAlert.start', { declaredInputs });

      const outputs: OutcomeOutputs = {
        alerts: [],
        learning: [],
        calibrationAlerts: [],
      };
      const stageErrors: Record<string, string> = {};
      // Phase-16 calibration metrics surfaced into the ICM OUTPUT summary.
      let calibrationMetrics: {
        ece: number;
        brier: number;
        driftKind: CbConfidenceDriftResult['kind'];
      } | null = null;

      // ---- Stage 1: LEARN (fold this batch onto the prior learning rows) -----
      try {
        outputs.learning = learnFromOutcomes(
          world.evaluations,
          world.priorLearning,
          now,
        );
        logger.info('job.outcomeAlert.learn', {
          learningEntries: outputs.learning.length,
        });
      } catch (e) {
        stageErrors.learn = e instanceof Error ? e.message : String(e);
        logger.warn('job.outcomeAlert.learnFailed', { error: stageErrors.learn });
      }

      // ---- Stage 2: ALERTS (advisory only — uses the freshly learned rows) ---
      try {
        const input: OcAlertInput = {
          evaluations: world.evaluations,
          learning: outputs.learning,
          snapshots: world.snapshots,
          forecasts: world.forecasts,
          securitySignals: world.securitySignals,
          now,
        };
        outputs.alerts = detectOutcomeAlerts(input);
        logger.info('job.outcomeAlert.alerts', {
          alerts: outputs.alerts.length,
          byType: countAlertsByType(outputs.alerts),
        });
      } catch (e) {
        stageErrors.alerts = e instanceof Error ? e.message : String(e);
        logger.warn('job.outcomeAlert.alertsFailed', { error: stageErrors.alerts });
      }

      // ---- Stage 3: CALIBRATION (Phase-16; fault-isolated; never throws) -----
      // Calibrate the loaded predictions, detect confidence drift vs the prior
      // snapshot curve, Brier-score the forecast kind, and trust-score a few
      // tracked entities → map to the four NEW advisory alert types. Pure engine
      // calls; `now` is injected. Advisory only — NEVER auto-acts.
      try {
        const cal = computeCalibrationAlerts(world, now);
        outputs.calibrationAlerts = cal.alerts;
        calibrationMetrics = cal.metrics;
        logger.info('job.outcomeAlert.calibration', {
          calibrationAlerts: cal.alerts.length,
          byType: countCalibrationAlertsByType(cal.alerts),
          metrics: cal.metrics,
          // BINDING: drift only RECOMMENDS recalibration; nothing is applied.
          autoAct: false,
        });
      } catch (e) {
        stageErrors.calibration = e instanceof Error ? e.message : String(e);
        logger.warn('job.outcomeAlert.calibrationFailed', {
          error: stageErrors.calibration,
        });
      }

      // ---- Stage 4: PERSIST (best-effort; failure logs + continues) ----------
      let persisted: OutcomePersistResult = { ...EMPTY_PERSIST };
      try {
        persisted = await persist(outputs, ctx);
      } catch (e) {
        logger.warn('job.outcomeAlert.persistFailed', {
          error: e instanceof Error ? e.message : String(e),
        });
      }

      const summary = {
        computed: {
          alerts: outputs.alerts.length,
          alertsByType: countAlertsByType(outputs.alerts),
          learningEntries: outputs.learning.length,
          // Phase-16 calibration/trust outputs.
          calibrationAlerts: outputs.calibrationAlerts.length,
          calibrationAlertsByType: countCalibrationAlertsByType(
            outputs.calibrationAlerts,
          ),
          calibration: calibrationMetrics,
        },
        persisted,
        stageErrors,
        // BINDING: advisory only — the worker never publishes and never acts.
        autoPublished: false,
        autoActed: false,
      };
      logger.info('job.outcomeAlert.done', summary);

      return {
        job: 'outcomeAlert',
        ok: true,
        declaredInputs,
        summary,
      };
    },
  };
}

/** Deterministic count of alerts grouped by type (for the ICM OUTPUTS log). */
function countAlertsByType(alerts: OcAlert[]): Record<OcAlertType, number> {
  const out: Record<OcAlertType, number> = {
    recommendation_failed: 0,
    confidence_drift: 0,
    narrative_spike: 0,
    forecast_miss: 0,
    resurgence: 0,
    security_anomaly: 0,
  };
  for (const a of alerts) out[a.alertType] += 1;
  return out;
}

/** Deterministic count of Phase-16 calibration alerts grouped by type. */
function countCalibrationAlertsByType(
  alerts: CalibrationAlert[],
): Record<CalibrationAlertType, number> {
  const out: Record<CalibrationAlertType, number> = {
    calibration_drift: 0,
    confidence_instability: 0,
    forecast_miscalibration: 0,
    trust_collapse: 0,
  };
  for (const a of alerts) out[a.alertType] += 1;
  return out;
}

// =============================================================================
// Phase 16 — pure calibration/trust alert mapping. Given the loaded world and an
// injected `now`, run the @hsi/calibration-engine chain and map the results to
// the four NEW advisory alert types. Deterministic; every alert carries an
// explanation; NEVER auto-acts (drift only recommends recalibration).
// =============================================================================

/**
 * Compute the Phase-16 calibration/trust alerts + the headline metrics.
 *
 * Mappings:
 *   * calibration_drift       — drift kind is degradation/overconfidence/
 *                               underconfidence beyond threshold (severity from
 *                               driftSeverity).
 *   * confidence_instability  — drift magnitude is high OR the ECE swing vs the
 *                               prior curve is sharp.
 *   * forecast_miscalibration — the forecast-kind Brier/ECE is poor.
 *   * trust_collapse          — a computed trust score for a tracked entity
 *                               drops below the low threshold.
 */
function computeCalibrationAlerts(
  world: OutcomeWorld,
  now: string,
): {
  alerts: CalibrationAlert[];
  metrics: {
    ece: number;
    brier: number;
    driftKind: CbConfidenceDriftResult['kind'];
  };
} {
  const alerts: CalibrationAlert[] = [];
  const predictions = world.predictions;

  // Current reliability curve over all predictions (now injected).
  const current: CbReliabilityCurve = cbCalibrate(predictions, { now });

  // Confidence drift vs the prior snapshot curve (undefined → current-only).
  const drift: CbConfidenceDriftResult = cbDetectConfidenceDrift(
    current,
    world.priorCurve,
    { now },
  );
  const severity = cbDriftSeverity(drift);

  // Overall Brier across every prediction (headline metric).
  const brierOverall: CbBrierResult = cbComputeBrierScore(
    predictions.map((p) => ({ confidence: p.confidence, success: p.success })),
  );

  // Forecast-kind Brier (forecast_miscalibration gate).
  const forecastPreds = predictions.filter((p) => p.kind === 'forecast');
  const brierForecast: CbBrierResult = cbComputeBrierScore(
    forecastPreds.map((p) => ({ confidence: p.confidence, success: p.success })),
  );

  // ---- (1) calibration_drift -------------------------------------------------
  // Fires when confidence has drifted past threshold in a way that recommends a
  // recalibration: degradation (ECE worse) / over- / under-confidence.
  if (
    drift.kind === 'degradation' ||
    drift.kind === 'overconfidence' ||
    drift.kind === 'underconfidence'
  ) {
    alerts.push({
      alertType: 'calibration_drift',
      severity,
      message: `Confidence calibration drift detected (${drift.kind}, magnitude ${drift.magnitude}).`,
      explanation: `${drift.explanation} ${drift.recommendation}`,
      metadata: {
        driftKind: drift.kind,
        magnitude: drift.magnitude,
        currentEce: drift.currentEce,
        priorEce: drift.priorEce,
        sampleCount: current.sampleCount,
        // BINDING: advisory recalibration recommendation only.
        autoAct: false,
      },
      createdAt: now,
    });
  }

  // ---- (2) confidence_instability -------------------------------------------
  // Fires when the drift magnitude is high OR the ECE swing vs the prior curve
  // is sharp — confidence is volatile, not merely biased.
  const eceSwing =
    drift.priorEce !== undefined
      ? Math.abs(drift.currentEce - drift.priorEce)
      : 0;
  const unstable =
    drift.magnitude >= CALIBRATION_ALERT_THRESHOLDS.instabilityMagnitude ||
    eceSwing >= CALIBRATION_ALERT_THRESHOLDS.instabilityEce;
  if (unstable && drift.kind !== 'stable' && drift.kind !== 'improvement') {
    const instSeverity: CalibrationAlert['severity'] =
      drift.magnitude >= 0.5 || eceSwing >= 0.25 ? 'CRITICAL' : 'HIGH';
    alerts.push({
      alertType: 'confidence_instability',
      severity: instSeverity,
      message: `Confidence is unstable (magnitude ${drift.magnitude}, ECE swing ${round4(eceSwing)}).`,
      explanation:
        `Calibration is swinging sharply: drift magnitude ${drift.magnitude} ` +
        `and Expected Calibration Error moved by ${round4(eceSwing)} versus the ` +
        `prior curve (current ECE ${drift.currentEce}). Recommend recalibration ` +
        `from recent outcomes before relying on stated confidence. Advisory only.`,
      metadata: {
        driftKind: drift.kind,
        magnitude: drift.magnitude,
        currentEce: drift.currentEce,
        priorEce: drift.priorEce,
        eceSwing: round4(eceSwing),
        autoAct: false,
      },
      createdAt: now,
    });
  }

  // ---- (3) forecast_miscalibration ------------------------------------------
  // Fires when the forecast-kind Brier is poor (>= fair threshold) with enough
  // samples for a verdict. Never fires on insufficient_data.
  if (
    brierForecast.calibrationQuality !== 'insufficient_data' &&
    brierForecast.score >= CALIBRATION_ALERT_THRESHOLDS.forecastBrierPoor
  ) {
    const fcSeverity: CalibrationAlert['severity'] =
      brierForecast.calibrationQuality === 'poor' ? 'HIGH' : 'MEDIUM';
    alerts.push({
      alertType: 'forecast_miscalibration',
      severity: fcSeverity,
      message: `Forecast confidence is miscalibrated (Brier ${brierForecast.score}, ${brierForecast.calibrationQuality}).`,
      explanation:
        `${brierForecast.interpretation} Stated forecast confidence does not ` +
        `match observed outcomes across ${brierForecast.sampleCount} forecast ` +
        `prediction(s). Recommend recalibrating forecast confidence. Advisory only.`,
      metadata: {
        brierScore: brierForecast.score,
        calibrationQuality: brierForecast.calibrationQuality,
        sampleCount: brierForecast.sampleCount,
        autoAct: false,
      },
      createdAt: now,
    });
  }

  // ---- (4) trust_collapse ----------------------------------------------------
  // Fires when a computed trust score for a tracked entity falls below the low
  // threshold. Each entity is scored independently (deterministic, now injected).
  for (const inputs of world.trustInputs) {
    const trust: CbTrustScore = cbComputeTrustScore(inputs, { now });
    if (trust.trustScore < CALIBRATION_ALERT_THRESHOLDS.trustCollapse) {
      const collapseSeverity: CalibrationAlert['severity'] =
        trust.trustScore < 25 ? 'CRITICAL' : 'HIGH';
      alerts.push({
        alertType: 'trust_collapse',
        severity: collapseSeverity,
        message: `Trust collapse for ${trust.entityType} ${trust.entityId} (trust ${trust.trustScore}/100, ${trust.band}).`,
        explanation:
          `Trust score ${trust.trustScore}/100 (band ${trust.band}, confidence ` +
          `${trust.confidence}) is below the ${CALIBRATION_ALERT_THRESHOLDS.trustCollapse} ` +
          `collapse threshold. ${trust.explanation.join(' ')} ${trust.limitations.join(' ')}`,
        metadata: {
          entityType: trust.entityType,
          entityId: trust.entityId,
          trustScore: trust.trustScore,
          band: trust.band,
          confidence: trust.confidence,
          evidenceCount: trust.evidenceCount,
          autoAct: false,
        },
        createdAt: now,
      });
    }
  }

  return {
    alerts,
    metrics: {
      ece: current.expectedCalibrationError,
      brier: brierOverall.score,
      driftKind: drift.kind,
    },
  };
}

/** Round to 4dp (mirrors the engine's internal rounding for ICM parity). */
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// =============================================================================
// Service-role default loader/persister (offline-safe — null client → fixtures
// / no-op). The pure engine NEVER reads env; the worker resolves it here.
// =============================================================================

/** Minimal structural shape of the Supabase bits the outcome worker uses. */
interface OcSelectQuery {
  order: (col: string, opts?: { ascending?: boolean }) => OcSelectQuery;
  limit: (n: number) => Promise<{ data: unknown; error: unknown }>;
}
interface OcClientLike {
  from(table: string): {
    select: (cols?: string) => OcSelectQuery;
    insert: (
      values: unknown,
    ) => Promise<{ data: unknown; error: unknown }> & {
      select: (cols?: string) => Promise<{ data: unknown; error: unknown }>;
    };
    upsert: (
      values: unknown,
      opts?: { onConflict?: string },
    ) => Promise<{ data: unknown; error: unknown }>;
  };
}

/** True when the service-role env is present (mirrors the other workers). */
function outcomeServiceRoleConfigured(): boolean {
  return Boolean(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/** Resolve a service-role client, or null (offline). Never throws. */
function tryOutcomeClient(): OcClientLike | null {
  if (!outcomeServiceRoleConfigured()) return null;
  try {
    return createServiceRoleClient() as unknown as OcClientLike;
  } catch (e) {
    logger.warn('outcome.serviceRole.unavailable', {
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

interface OutcomeRow {
  id: string;
  decision_run_id: string | null;
  recommendation_id: string | null;
  status: string | null;
  expected_outcome: Record<string, unknown> | null;
  observed_outcome: Record<string, unknown> | null;
  confidence_before: number | null;
  confidence_after: number | null;
  success_score: number | null;
  created_at: string | null;
}
interface LearningRow {
  intervention_type: string;
  sample_count: number | null;
  success_count: number | null;
  avg_success_score: number | null;
  calibrated_confidence: number | null;
  adjustment: number | null;
  rationale: string | null;
}
interface SnapshotRow {
  id: string;
  narrative_id: string;
  captured_at: string;
  signal_count: number | null;
  source_count: number | null;
  community_count: number | null;
  amplification_score: number | null;
  reliability_score: number | null;
  support_ratio: number | null;
  contradiction_ratio: number | null;
  metadata: Record<string, unknown> | null;
}
interface ForecastRow {
  narrative_id: string;
  forecast_type: string | null;
  generated_at: string | null;
}

function num(v: number | null | undefined, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : String(v ?? '');
}

function isOutcomeStatus(s: string): s is OcEvaluation['outcomeStatus'] {
  return (
    s === 'successful' ||
    s === 'partially_successful' ||
    s === 'neutral' ||
    s === 'unsuccessful' ||
    s === 'inconclusive'
  );
}

function toSnapshot(r: SnapshotRow): OcNarrativeSnapshot {
  return {
    id: r.id,
    narrativeId: r.narrative_id,
    capturedAt: r.captured_at,
    signalCount: num(r.signal_count),
    sourceCount: num(r.source_count),
    communityCount: num(r.community_count),
    amplificationScore: num(r.amplification_score),
    reliabilityScore: num(r.reliability_score),
    supportRatio: num(r.support_ratio),
    contradictionRatio: num(r.contradiction_ratio),
    metadata: r.metadata ?? undefined,
  };
}

/** Map a persisted outcome row into the engine's OutcomeEvaluation shape. */
function toEvaluation(r: OutcomeRow): OcEvaluation {
  const status = isOutcomeStatus(asString(r.status))
    ? (r.status as OcEvaluation['outcomeStatus'])
    : 'inconclusive';
  const confidenceBefore = num(r.confidence_before);
  const confidenceAfter = num(r.confidence_after, confidenceBefore);
  return {
    recommendationId: r.recommendation_id ?? r.id,
    decisionRunId: r.decision_run_id ?? '',
    successScore: num(r.success_score),
    outcomeStatus: status,
    confidenceBefore,
    confidenceAfter,
    confidenceAdjustment: confidenceAfter - confidenceBefore,
    measurements: [],
    explanation: [],
    limitations: [],
    evaluatedAt: r.created_at ?? '',
  };
}

/**
 * Default loader: read the recent recommendation outcomes + prior confidence
 * learning (Phase-15) and the recent narrative snapshots + forecasts (Phase-10)
 * from the service-role Supabase, deriving forecast predicted-vs-actual pairs and
 * leaving security signals empty (none are persisted in scope); otherwise fall
 * back to the deterministic outcomeDemo() fixtures bundle. Never throws.
 */
export const defaultLoadOutcomeWorld: LoadOutcomeWorld = async () => {
  const client = tryOutcomeClient();
  if (!client) {
    // OFFLINE: deterministic fixtures via the engine's own offline demo chain
    // plus the calibration-engine's DEMO_PREDICTIONS / demo trust inputs.
    const demo = outcomeDemo();
    return {
      evaluations: demo.evaluations,
      priorLearning: demo.mergedLearning,
      snapshots: demoSnapshots(demo),
      forecasts: demoForecasts(demo),
      securitySignals: demoSecurity(demo),
      // Phase-16 offline fixtures.
      predictions: CB_DEMO_PREDICTIONS,
      // No prior snapshot curve offline → drift classifies on the current curve.
      priorCurve: undefined,
      trustInputs: demoTrustInputs(),
    };
  }
  try {
    const [outRes, learnRes, snapRes, fcRes] = await Promise.all([
      client
        .from('hsin_recommendation_outcomes')
        .select(
          'id,decision_run_id,recommendation_id,status,expected_outcome,observed_outcome,confidence_before,confidence_after,success_score,created_at',
        )
        .order('created_at', { ascending: false })
        .limit(5000),
      client
        .from('hsin_confidence_learning')
        .select(
          'intervention_type,sample_count,success_count,avg_success_score,calibrated_confidence,adjustment,rationale',
        )
        .limit(5000),
      client
        .from('hsin_narrative_snapshots')
        .select(
          'id,narrative_id,captured_at,signal_count,source_count,community_count,amplification_score,reliability_score,support_ratio,contradiction_ratio,metadata',
        )
        .order('captured_at', { ascending: true })
        .limit(20000),
      client
        .from('hsin_narrative_forecasts')
        .select('narrative_id,forecast_type,generated_at')
        .order('generated_at', { ascending: true })
        .limit(20000),
    ]);

    const outcomeRows = (outRes.error ? [] : (outRes.data as OutcomeRow[])) ?? [];
    const learningRows = (learnRes.error ? [] : (learnRes.data as LearningRow[])) ?? [];
    const snapshotRows = (snapRes.error ? [] : (snapRes.data as SnapshotRow[])) ?? [];
    const forecastRows = (fcRes.error ? [] : (fcRes.data as ForecastRow[])) ?? [];

    const evaluations = outcomeRows.map(toEvaluation);

    const priorLearning: OcLearningEntry[] = learningRows.map((r) => ({
      interventionType: r.intervention_type,
      sampleCount: num(r.sample_count),
      successCount: num(r.success_count),
      avgSuccessScore: num(r.avg_success_score),
      calibratedConfidence: num(r.calibrated_confidence),
      adjustment: num(r.adjustment),
      rationale: r.rationale ?? '',
    }));

    const snapshots = snapshotRows.map(toSnapshot);

    // Forecast predicted-vs-actual pairs: for each narrative, the EARLIEST
    // forecast's type is the prediction; the latest snapshot's trajectory state
    // is the observed actual. (Snapshots are time-ordered asc.) Only narratives
    // with both a forecast and ≥ 2 snapshots yield a comparable pair.
    const latestSnapStateByNarrative = new Map<string, string>();
    const snapsByNarrative = new Map<string, SnapshotRow[]>();
    for (const r of snapshotRows) {
      const list = snapsByNarrative.get(r.narrative_id) ?? [];
      list.push(r);
      snapsByNarrative.set(r.narrative_id, list);
    }
    for (const [narrativeId, list] of snapsByNarrative) {
      if (list.length < 2) continue;
      latestSnapStateByNarrative.set(
        narrativeId,
        trajectoryState(list[list.length - 2], list[list.length - 1]),
      );
    }
    const firstForecastByNarrative = new Map<string, string>();
    for (const r of forecastRows) {
      if (!firstForecastByNarrative.has(r.narrative_id) && r.forecast_type) {
        firstForecastByNarrative.set(r.narrative_id, r.forecast_type);
      }
    }
    const forecasts: { predicted: string; actual: string }[] = [];
    for (const [narrativeId, predicted] of firstForecastByNarrative) {
      const actual = latestSnapStateByNarrative.get(narrativeId);
      if (actual !== undefined) forecasts.push({ predicted, actual });
    }

    // Phase-16: build stated-confidence predictions from the outcome rows
    // (recommendation-kind) — each row's confidence vs its success score.
    const predictions: CbPrediction[] = outcomeRows.map((r) =>
      toPrediction(r),
    );

    // Phase-16: trust inputs derived from the learned confidence rows — one per
    // intervention type. historicalAccuracy = successCount/sampleCount, and the
    // calibratedConfidence stands in for the calibration signal.
    const trustInputs: CbTrustInputs[] = priorLearning
      .filter((l) => l.sampleCount > 0)
      .map((l) => ({
        entityType: 'intervention' as const,
        entityId: l.interventionType,
        historicalAccuracy:
          l.sampleCount > 0 ? l.successCount / l.sampleCount : undefined,
        calibrationScore: l.calibratedConfidence,
        sampleCount: l.sampleCount,
      }));

    return {
      evaluations,
      priorLearning,
      snapshots,
      forecasts,
      // No security signal source is in scope for this worker; left empty so the
      // security_anomaly passthrough is a clean no-op unless a host wires one up.
      securitySignals: [],
      // Phase-16: predictions + trust inputs. No prior snapshot curve is
      // persisted in scope, so drift classifies on the current curve alone.
      predictions,
      priorCurve: undefined,
      trustInputs,
    };
  } catch (e) {
    logger.warn('outcome.dbLoad.threw', {
      error: e instanceof Error ? e.message : String(e),
    });
    return { ...EMPTY_WORLD };
  }
};

/**
 * Map a persisted outcome row into a calibration Prediction. The stated
 * confidence is the recommendation's confidence_before; the observed success is
 * the success_score (the engine normalises a /100 score). Kind is
 * 'recommendation' (these rows track recommendation outcomes).
 */
function toPrediction(r: OutcomeRow): CbPrediction {
  return {
    id: r.recommendation_id ?? r.id,
    kind: 'recommendation',
    confidence: clamp01(num(r.confidence_before)),
    success: num(r.success_score),
    at: r.created_at ?? '',
    entityId: r.recommendation_id ?? r.id,
  };
}

/** Clamp a number into 0..1 (mirrors the engine's normalisation). */
function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * Offline trust inputs — a couple of tracked entities, including one that
 * deliberately collapses below the trust threshold so the trust_collapse path is
 * exercised in a fixtures run (the decision fixture: thin sample + low signals).
 */
function demoTrustInputs(): CbTrustInputs[] {
  return [
    {
      entityType: 'source',
      entityId: 'src-reuters',
      historicalAccuracy: 0.88,
      evidenceQuality: 0.82,
      calibrationScore: 0.85,
      reviewOutcomes: { approved: 42, rejected: 4 },
      governanceOutcomes: { validated: 30, escalated: 2, rejected: 1 },
      sampleCount: 46,
    },
    {
      entityType: 'decision',
      entityId: 'dec-launch-go',
      historicalAccuracy: 0.4,
      evidenceQuality: 0.45,
      calibrationScore: 0.5,
      reviewOutcomes: { approved: 1, rejected: 2 },
      sampleCount: 3,
    },
  ];
}

/** Classify a snapshot transition into a coarse trajectory state. */
function trajectoryState(prev: SnapshotRow, cur: SnapshotRow): string {
  const from = num(prev.signal_count);
  const to = num(cur.signal_count);
  if (from === 0) return to > 0 ? 'surging' : 'stable';
  const pct = ((to - from) / Math.abs(from)) * 100;
  if (pct >= 25) return 'surging';
  if (pct <= -25) return 'declining';
  return 'stable';
}

// --- Offline fixture adapters (read the engine's demo bundle, never throw) ----
// The OutcomeDemo type doesn't surface the raw snapshot/forecast/security fixture
// arrays, so we re-derive a representative set from the demo for offline runs;
// any failure degrades to empty (the alert stage simply produces fewer alerts).

function demoSnapshots(demo: ReturnType<typeof outcomeDemo>): OcNarrativeSnapshot[] {
  void demo;
  // The demo's snapshots drive spike/resurgence; reproduce the documented series.
  const base = (
    narrativeId: string,
    capturedAt: string,
    signalCount: number,
    amplificationScore: number,
  ): OcNarrativeSnapshot => ({
    id: `${narrativeId}@${capturedAt}`,
    narrativeId,
    capturedAt,
    signalCount,
    sourceCount: Math.max(1, Math.round(signalCount / 10)),
    communityCount: Math.max(1, Math.round(signalCount / 25)),
    amplificationScore,
    reliabilityScore: 50,
    supportRatio: 0.6,
    contradictionRatio: 0.2,
  });
  return [
    base('nar-spike', '2026-05-01T00:00:00.000Z', 100, 40),
    base('nar-spike', '2026-05-08T00:00:00.000Z', 60, 35),
    base('nar-spike', '2026-05-15T00:00:00.000Z', 55, 30),
    base('nar-spike', '2026-05-22T00:00:00.000Z', 130, 70),
  ];
}

function demoForecasts(
  demo: ReturnType<typeof outcomeDemo>,
): { predicted: string; actual: string }[] {
  void demo;
  return [
    { predicted: 'declining', actual: 'declining' },
    { predicted: 'stable', actual: 'surging' },
  ];
}

function demoSecurity(
  demo: ReturnType<typeof outcomeDemo>,
): { type: string; severity: string }[] {
  void demo;
  return [{ type: 'coordinated_inauthentic_behavior', severity: 'high' }];
}

/**
 * Default persister: write the advisory alerts to hsin_decision_alerts and UPSERT
 * the learned confidence into hsin_confidence_learning (unique on intervention_type)
 * when the service-role client is configured; otherwise a clean no-op (offline).
 * Each table write is best-effort and fault-isolated. NEVER auto-acts (alerts are
 * inserted with status 'open' — no acknowledgement/resolution/escalation is ever
 * decided here) — and appends an audit_logs event. Never throws.
 */
export const defaultPersistOutcomeOutputs: PersistOutcomeOutputs = async (
  outputs,
  ctx,
) => {
  const client = tryOutcomeClient();
  if (!client) return { ...EMPTY_PERSIST };

  const at = ctx.runAt;
  const result: OutcomePersistResult = { ...EMPTY_PERSIST };

  // Only well-formed uuids are valid decision_run_id FKs into hsin_decision_runs.
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // (1) Advisory alerts — append-only insert. status defaults to 'open' in the
  // schema; we set it explicitly to make the no-auto-act stance auditable. The
  // worker NEVER acknowledges/resolves/escalates an alert.
  if (outputs.alerts.length > 0) {
    try {
      const rows = outputs.alerts.map((a) => ({
        decision_run_id:
          a.decisionRunId && UUID_RE.test(a.decisionRunId) ? a.decisionRunId : null,
        alert_type: a.alertType,
        severity: a.severity,
        message: a.message,
        explanation: a.explanation,
        status: 'open',
        metadata: a.metadata ?? {},
      }));
      const { error } = await client.from('hsin_decision_alerts').insert(rows);
      if (!error) result.alerts = rows.length;
      else
        logger.warn('outcome.persist.alerts.failed', {
          error: String(error),
        });
    } catch (e) {
      logger.warn('outcome.persist.alerts.threw', {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // (1b) Phase-16 calibration/trust advisory alerts — append-only insert into
  // the SAME hsin_decision_alerts table (the four NEW alert_type values from
  // migration 0020). status 'open'; the worker NEVER acks/resolves/escalates.
  if (outputs.calibrationAlerts.length > 0) {
    try {
      const rows = outputs.calibrationAlerts.map((a) => ({
        decision_run_id:
          a.decisionRunId && UUID_RE.test(a.decisionRunId) ? a.decisionRunId : null,
        alert_type: a.alertType,
        severity: a.severity,
        message: a.message,
        explanation: a.explanation,
        status: 'open',
        metadata: a.metadata ?? {},
      }));
      const { error } = await client.from('hsin_decision_alerts').insert(rows);
      if (!error) result.calibrationAlerts = rows.length;
      else
        logger.warn('outcome.persist.calibrationAlerts.failed', {
          error: String(error),
        });
    } catch (e) {
      logger.warn('outcome.persist.calibrationAlerts.threw', {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // (2) Confidence learning — upsert on (intervention_type) (idempotent).
  if (outputs.learning.length > 0) {
    try {
      const rows = outputs.learning.map((l) => ({
        intervention_type: l.interventionType,
        sample_count: l.sampleCount,
        success_count: l.successCount,
        avg_success_score: l.avgSuccessScore,
        calibrated_confidence: l.calibratedConfidence,
        adjustment: l.adjustment,
        rationale: l.rationale,
      }));
      const { error } = await client
        .from('hsin_confidence_learning')
        .upsert(rows, { onConflict: 'intervention_type' });
      if (!error) result.learningEntries = rows.length;
      else
        logger.warn('outcome.persist.learning.failed', {
          error: String(error),
        });
    } catch (e) {
      logger.warn('outcome.persist.learning.threw', {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // (3) Audit — append-only audit_logs event. NEVER records a publish or an act.
  try {
    const { error } = await client.from('audit_logs').insert({
      user_id: null,
      action: 'outcome.alert.pipeline',
      metadata: {
        alerts: result.alerts,
        calibrationAlerts: result.calibrationAlerts,
        learningEntries: result.learningEntries,
        at,
        // BINDING: advisory only — the worker never publishes and never acts.
        autoPublished: false,
        autoActed: false,
      },
    });
    result.audited = !error;
  } catch (e) {
    logger.warn('outcome.persist.audit.threw', {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  return result;
};

/**
 * The registered outcome-alert pipeline job. Uses the DB loader/persister by
 * default; both degrade to a clean fixtures-run / no-op offline (no service-role
 * env), so this is fully offline-safe and never throws fatally.
 */
export const outcomeAlertWorkerJob: Job = makeOutcomeAlertWorkerJob();
