// =============================================================================
// @hsi/calibration-engine — public type surface (WorldForge/HSI Phase 16).
//
// CONFIDENCE CALIBRATION + RELIABILITY ANALYSIS + BRIER SCORING + DRIFT
// DETECTION + TRUST SCORING. Answers "what does 82% confidence ACTUALLY mean?"
// and "how trustworthy is this?" by comparing stated confidence against
// empirically observed outcomes.
//
// PRINCIPLES (binding):
//   * PURE & DETERMINISTIC — callers inject `now`/seed; NO Date.now()/Math.random()
//     anywhere. Same inputs → identical outputs.
//   * OFFLINE — fixtures + local heuristics; no network, no clocks, no keys.
//   * ZERO runtime deps beyond the @hsi workspace.
//   * EXPLAINABLE + AUDITABLE + REPRODUCIBLE — every score carries the numbers
//     that produced it + explicit LIMITATIONS. NEVER opaque, NEVER force a score,
//     NEVER claim certainty, NEVER auto-act (drift only RECOMMENDS recalibration).
// =============================================================================

// Reused upstream types are importable from this surface for convenience.
export type {
  OutcomeEvaluation,
  ConfidenceLearningEntry,
  OutcomeStatus,
} from '@hsi/outcome-intelligence';
export type {
  Calibration,
  ConfidenceBand,
} from '@hsi/counterfactual-engine';

/**
 * A single stated-confidence prediction paired with its observed outcome.
 * `success` is 1 for a full success / 0 for a full failure, OR a fractional
 * success score in [0,1] (a /100 score is normalised on the way in).
 */
export interface Prediction {
  id: string;
  kind: 'recommendation' | 'forecast' | 'intervention' | 'narrative';
  /** Stated/predicted confidence, 0..1. */
  confidence: number;
  /** Observed outcome, 0..1 (1 = success, 0 = fail, fractional allowed). */
  success: number;
  at: string;
  entityId?: string;
  interventionType?: string;
  sourceId?: string;
}

/** One calibration bucket of predictions sharing a confidence range. */
export interface CalibrationBin {
  /** Inclusive lower edge of the bin (0..1). */
  lower: number;
  /** Exclusive upper edge of the bin (0..1), except the top bin is inclusive. */
  upper: number;
  /** Human label e.g. "70–80%". */
  label: string;
  count: number;
  /** Mean stated confidence of predictions in this bin, 0..1. */
  meanConfidence: number;
  /** Mean observed success of predictions in this bin, 0..1. */
  observedSuccess: number;
  /** |meanConfidence − observedSuccess|, 0..1. */
  calibrationError: number;
}

/** A full reliability curve: per-bin calibration + summary error metrics. */
export interface ReliabilityCurve {
  bins: CalibrationBin[];
  sampleCount: number;
  /** Expected Calibration Error — count-weighted mean per-bin error, 0..1. */
  expectedCalibrationError: number;
  /** Maximum per-bin calibration error over populated bins, 0..1. */
  maxCalibrationError: number;
  /** Signed: mean(confidence − success). + = overconfident, − = underconfident. */
  overconfidenceIndex: number;
  generatedAt: string;
}

/** The outcome of a Brier-score computation over a set of predictions. */
export interface BrierResult {
  /** Mean squared error of confidence vs outcome, 0..1 (lower is better). */
  score: number;
  sampleCount: number;
  interpretation: string;
  calibrationQuality:
    | 'excellent'
    | 'good'
    | 'fair'
    | 'poor'
    | 'insufficient_data';
  /** Murphy decomposition (score = reliability − resolution + uncertainty). */
  decomposition?: {
    reliability: number;
    resolution: number;
    uncertainty: number;
  };
}

/** How confidence has drifted relative to a prior reliability curve. */
export type ConfidenceDriftKind =
  | 'overconfidence'
  | 'underconfidence'
  | 'degradation'
  | 'improvement'
  | 'stable';

/**
 * A drift detection result. RECOMMENDS recalibration only — it NEVER
 * auto-corrects confidence.
 */
export interface ConfidenceDriftResult {
  kind: ConfidenceDriftKind;
  /** 0..1 — how far the metric moved past the threshold. */
  magnitude: number;
  currentEce: number;
  priorEce?: number;
  /** Advisory recalibration recommendation (never an auto-action). */
  recommendation: string;
  explanation: string;
  detectedAt: string;
}

/** The kind of entity a trust score is attached to. */
export type TrustEntityType =
  | 'source'
  | 'narrative'
  | 'forecast'
  | 'intervention'
  | 'recommendation'
  | 'decision';

/** Inputs to a trust-score computation. All signals optional + honestly weighted. */
export interface TrustInputs {
  entityType: TrustEntityType;
  entityId: string;
  /** Historical accuracy of this entity, 0..1. */
  historicalAccuracy?: number;
  /** Quality of supporting evidence, 0..1. */
  evidenceQuality?: number;
  /** Calibration score, 0..1 (1 = perfectly calibrated). */
  calibrationScore?: number;
  /** Human review tallies. */
  reviewOutcomes?: { approved: number; rejected: number };
  /** Governance review tallies. */
  governanceOutcomes?: {
    validated: number;
    escalated: number;
    rejected: number;
  };
  /** Number of underlying observations (drives confidence + neutral pull). */
  sampleCount?: number;
}

/** A computed, explainable trust score. */
export interface TrustScore {
  entityType: TrustEntityType;
  entityId: string;
  /** 0..100. */
  trustScore: number;
  /** 0..1 — low when the sample is small or signals are indirect. */
  confidence: number;
  /** Number of underlying observations the score rests on. */
  evidenceCount: number;
  /** Calibration component actually used, 0..1. */
  calibrationScore: number;
  band: 'low' | 'medium' | 'high';
  /** Enumerates each contributing factor with its value. */
  explanation: string[];
  /** Explicit caveats — ALWAYS populated. */
  limitations: string[];
  lastUpdated: string;
}
