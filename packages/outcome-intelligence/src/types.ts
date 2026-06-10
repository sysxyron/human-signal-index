// =============================================================================
// @hsi/outcome-intelligence — public type surface (WorldForge/HSI Phase 15).
//
// RECOMMENDATION OUTCOME TRACKING + CONFIDENCE LEARNING + ALERTING + GOVERNANCE.
// This layer closes the decision → outcome → learning loop: it asks "did the
// recommendation actually work?" and "are recommendations getting better?" by
// comparing a recommendation's EXPECTED effect against the ACTUAL observed data.
//
// PRINCIPLES (binding):
//   * PURE & DETERMINISTIC — callers inject `now`/seed; NO Date.now()/Math.random()
//     in any logic path. Same inputs → identical outputs.
//   * OFFLINE — fixtures + local heuristics; no network, no clocks, no keys.
//   * ZERO runtime deps beyond the @hsi workspace.
//   * NEVER CERTAINTY, NEVER BLACK-BOX — every output carries a success score, a
//     confidence, an explanation, and explicit LIMITATIONS, all tied to real
//     observed data. NO auto-actions: alerts and reviews are AIDS for a human.
// =============================================================================

import type { ConfidenceBand } from '@hsi/counterfactual-engine';
import type { NarrativeSnapshot } from '@hsi/decision-intelligence';

// Re-export reused upstream types so consumers can import from this surface.
export type { ConfidenceBand } from '@hsi/counterfactual-engine';
export type { NarrativeSnapshot } from '@hsi/decision-intelligence';

/** How a recommendation's real-world outcome is classified. */
export type OutcomeStatus =
  | 'successful'
  | 'partially_successful'
  | 'neutral'
  | 'unsuccessful'
  | 'inconclusive';

/**
 * What actually happened in the world AFTER a recommendation was followed.
 * Every field is optional except the capture time — thin data is honestly
 * surfaced (→ `inconclusive`), never fabricated.
 */
export interface ObservedData {
  /** Observed % change in signal volume (signed). */
  signalDeltaPct?: number;
  /** Observed absolute change in amplification (signed). */
  amplificationDelta?: number;
  /** Observed absolute change in community spread (signed). */
  communityDelta?: number;
  /** Observed forecast state at the end of the observation window. */
  forecastState?: string;
  /** Free-form observed metrics keyed by name (signed values). */
  metrics?: Record<string, number>;
  /** ISO time the observation was captured. */
  capturedAt: string;
}

/**
 * A reference to a recommendation whose outcome we are tracking. This is the
 * bridge from @hsi/decision-intelligence's Recommendation/DecisionRun output.
 */
export interface RecommendationRef {
  recommendationId: string;
  decisionRunId: string;
  interventionType: string;
  recommendedAction: string;
  /** Signed predicted effect on the trajectory, −100..100. */
  expectedEffect: number;
  /** Stated confidence BEFORE the outcome was observed, 0..1. */
  confidenceBefore: number;
  /** Optional per-metric expected outcome (signed). */
  expectedOutcome?: Record<string, number>;
}

/** A single per-metric comparison of expected vs observed. */
export interface OutcomeMeasurement {
  metric: string;
  expectedValue: number;
  observedValue: number;
  /** observedValue − expectedValue. */
  delta: number;
  /** True when the observed value matched expected direction within tolerance. */
  withinExpectation: boolean;
}

/** The full grounded evaluation of one recommendation's outcome. */
export interface OutcomeEvaluation {
  recommendationId: string;
  decisionRunId: string;
  /** 0..100 — how closely observed matched expected direction + magnitude. */
  successScore: number;
  outcomeStatus: OutcomeStatus;
  /** Stated confidence before the outcome, 0..1. */
  confidenceBefore: number;
  /** Updated confidence after the outcome, 0..1 (never 1.0, never < 0). */
  confidenceAfter: number;
  /** confidenceAfter − confidenceBefore (signed). */
  confidenceAdjustment: number;
  measurements: OutcomeMeasurement[];
  /** Data-grounded reasoning referencing the actual deltas. */
  explanation: string[];
  /** Explicit caveats — ALWAYS populated. */
  limitations: string[];
  evaluatedAt: string;
}

/** One aggregated, learned confidence entry per intervention type. */
export interface ConfidenceLearningEntry {
  interventionType: string;
  /** Number of evaluations observed for this intervention type. */
  sampleCount: number;
  /** Number scored successful/partially_successful. */
  successCount: number;
  /** Mean success score over the samples, 0..100. */
  avgSuccessScore: number;
  /** Learned (calibrated) confidence for this intervention type, 0..1. */
  calibratedConfidence: number;
  /** calibratedConfidence − prior baseline (signed). */
  adjustment: number;
  /** Human-readable explanation of the learning step. */
  rationale: string;
}

/** The categories of advisory alert this layer can raise. */
export type OutcomeAlertType =
  | 'recommendation_failed'
  | 'confidence_drift'
  | 'narrative_spike'
  | 'forecast_miss'
  | 'resurgence'
  | 'security_anomaly';

/** An advisory alert. NEVER auto-acts — pure data for a human reviewer. */
export interface OutcomeAlert {
  alertType: OutcomeAlertType;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  explanation: string;
  decisionRunId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

/** The state a governance review can be in. */
export type GovernanceDecision =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'escalated'
  | 'validated';

/** A human governance review attached to an outcome / decision run. */
export interface GovernanceReview {
  outcomeId?: string;
  decisionRunId?: string;
  decision: GovernanceDecision;
  notes?: string;
  reviewerId?: string;
  createdAt: string;
}

/** Input bundle for alert detection (all sources optional + injected `now`). */
export interface OutcomeAlertInput {
  evaluations?: OutcomeEvaluation[];
  learning?: ConfidenceLearningEntry[];
  snapshots?: NarrativeSnapshot[];
  forecasts?: { predicted: string; actual: string }[];
  securitySignals?: { type: string; severity: string }[];
  now: string;
}

/** One step in a fully traceable outcome audit chain. */
export interface OutcomeAuditStep {
  step: string;
  detail: string;
  at?: string;
}
