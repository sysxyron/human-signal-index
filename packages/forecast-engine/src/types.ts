// =============================================================================
// @hsi/forecast-engine — public type surface (WorldForge/HSI Phase 21).
//
// FORWARD-LOOKING intelligence: generate forecasts (hypotheses about what may
// happen next) from signals, score their confidence + reliability, detect
// failures against invalidation criteria, and track forecast accuracy /
// calibration / Brier over time. NO prediction is truth — every forecast is a
// HYPOTHESIS that exposes its assumptions, supporting evidence, invalidation
// criteria, and limitations.
//
// PRINCIPLES (binding — identical to Phases 16-20):
//   * PURE & DETERMINISTIC — callers inject `now`; NO Date.now()/Math.random().
//   * OFFLINE — no network, no clocks, no keys.
//   * EXPLAINABLE + AUDITABLE — every forecast/score carries the numbers + the
//     assumptions that produced it. NO auto-predict, NO auto-act, NO auto-truth.
// =============================================================================

/** The lifecycle status of a forecast. */
export type ForecastStatus = 'active' | 'monitoring' | 'confirmed' | 'failed' | 'expired';

/** One signal supporting (or weakening) a forecast. */
export interface ForecastSignal {
  id: string;
  label: string;
  /** 0..1 strength of the signal. */
  strength: number;
  /** +1 supports the prediction, -1 contradicts it, 0 neutral. */
  direction: number;
  /** Optional source reference for traceability. */
  sourceRef?: string;
}

/** Inputs to generateForecast. */
export interface ForecastInput {
  id: string;
  /** The plain-language prediction (a hypothesis). */
  prediction: string;
  /** The signals informing the forecast. */
  signals: ForecastSignal[];
  /** Stated assumptions (always surfaced). */
  assumptions?: string[];
  /** Conditions that would INVALIDATE the forecast. */
  invalidationCriteria?: string[];
  /** Horizon label, e.g. '7d', '30d'. */
  horizon?: string;
  /** Historical accuracy of similar forecasts, 0..1 (drives reliability). */
  historicalAccuracy?: number;
  /** Number of comparable past forecasts (drives reliability confidence). */
  historicalSampleCount?: number;
  /** ISO expiry; the forecast is no longer active past it. */
  expiresAt?: string;
}

/** A computed forecast — a hypothesis, never truth. */
export interface Forecast {
  forecastId: string;
  prediction: string;
  /** 0..1 confidence (from the supporting signals). */
  confidence: number;
  /** 0..1 reliability (from historical accuracy/calibration). */
  reliability: number;
  status: ForecastStatus;
  supportingSignals: ForecastSignal[];
  assumptions: string[];
  invalidationCriteria: string[];
  limitations: string[];
  horizon?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  /** Version counter (incremented on update). */
  version: number;
}

/** A patch for updateForecast. */
export interface ForecastPatch {
  prediction?: string;
  signals?: ForecastSignal[];
  assumptions?: string[];
  invalidationCriteria?: string[];
  status?: ForecastStatus;
  expiresAt?: string;
}

/** A factor in a forecast explanation. */
export interface ForecastFactor {
  label: string;
  /** Signed contribution to confidence (−1..+1). */
  contribution: number;
  strength: number;
  direction: number;
}

/** A full, explainable forecast explanation. */
export interface ForecastExplanation {
  forecastId: string;
  prediction: string;
  confidence: number;
  reliability: number;
  factors: ForecastFactor[];
  assumptions: string[];
  invalidationCriteria: string[];
  limitations: string[];
  summary: string;
  generatedAt: string;
}

/** The result of a failure detection against invalidation criteria. */
export interface ForecastFailureResult {
  failed: boolean;
  /** Which invalidation criteria were triggered. */
  triggered: string[];
  reason: string;
  detectedAt: string;
}

/** An observation used to check a forecast against its invalidation criteria. */
export interface ForecastObservation {
  /** Free-text observations that may match invalidation criteria. */
  observations: string[];
  /** Observed success of the prediction, 0..1 (1 = came true). */
  observedSuccess?: number;
}

// ---- Reliability layer ------------------------------------------------------

/** A predicted-confidence/observed-success pair for calibration/Brier. */
export interface ForecastOutcome {
  forecastId: string;
  confidence: number;
  /** 1 = the prediction came true, 0 = it did not (fractional allowed). */
  success: number;
}

/** Forecast accuracy over a set of outcomes. */
export interface ForecastAccuracy {
  successRate: number;
  failureRate: number;
  sampleCount: number;
}

/** One calibration bin. */
export interface CalibrationBin {
  label: string;
  lower: number;
  upper: number;
  count: number;
  meanConfidence: number;
  observedSuccess: number;
  error: number;
}

/** Forecast calibration over a set of outcomes. */
export interface ForecastCalibration {
  /** Expected Calibration Error, 0..1 (lower is better). */
  ece: number;
  bins: CalibrationBin[];
  sampleCount: number;
}

/** A Brier score result. */
export interface ForecastBrier {
  /** Mean squared error, 0..1 (lower is better). */
  score: number;
  sampleCount: number;
  interpretation: string;
}
