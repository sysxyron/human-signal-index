// =============================================================================
// HSI Phase 67 — Forecast Validation: shared types (PURE, no I/O).
//
// Forecasts are first-class, immutable, time-bound objects. These are the
// vocabulary + data shapes; deterministic evaluation lives in ./evaluation and
// calibration/performance in ./calibration. PURE: no clocks, no DB, no LLM.
// =============================================================================

import type { NotificationSeverity } from '@/lib/notifications/types';

export const FORECAST_STATUSES = ['draft', 'active', 'resolved', 'expired', 'cancelled'] as const;
export type ForecastStatus = (typeof FORECAST_STATUSES)[number];

export const PREDICTION_TYPES = ['binary', 'probability', 'multi-outcome', 'range', 'narrative', 'event', 'trend'] as const;
export type PredictionType = (typeof PREDICTION_TYPES)[number];

export const EVALUATION_RESULTS = ['correct', 'incorrect', 'partial', 'unresolved', 'expired'] as const;
export type EvaluationResult = (typeof EVALUATION_RESULTS)[number];

export const FORECAST_ALERT_TYPES = [
  'FORECAST_DUE', 'FORECAST_RESOLVED', 'FORECAST_EXPIRED', 'FORECAST_MISSED', 'FORECAST_CALIBRATION_DROP', 'FORECAST_PERFORMANCE_CHANGE',
] as const;
export type ForecastAlertType = (typeof FORECAST_ALERT_TYPES)[number];

export type ForecastSeverity = NotificationSeverity;

export function isForecastStatus(v: unknown): v is ForecastStatus {
  return typeof v === 'string' && (FORECAST_STATUSES as readonly string[]).includes(v);
}
export function isPredictionType(v: unknown): v is PredictionType {
  return typeof v === 'string' && (PREDICTION_TYPES as readonly string[]).includes(v);
}

export type PredictionValue = Record<string, unknown>;

export interface Forecast {
  id: string;
  title: string;
  description: string | null;
  predictionType: PredictionType;
  status: ForecastStatus;
  confidence: number | null;
  forecastDate: string;
  resolutionDate: string | null;
  outcome: string | null;
  source: string | null;
  agentId: string | null;
  narrativeId: string | null;
  graphNodeId: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface ForecastPrediction { predictionType: PredictionType; predictedValue: PredictionValue }
export interface ForecastOutcome { actualValue: PredictionValue; outcomeLabel: string | null; recordedAt: string; note: string | null }
export interface ForecastEvaluation { result: EvaluationResult; score: number | null; rationale: string | null; evaluatedAt: string }
export interface ForecastScore { brierScore: number | null; accuracy: number | null; confidence: number | null; error: number | null; result: string | null }

export interface CalibrationBucket {
  bucket: string;            // e.g. '0.7–0.8'
  predictedConfidence: number; // avg stated confidence in the band
  actualAccuracy: number;    // fraction correct in the band
  count: number;
}

export interface PerformanceMetrics {
  total: number;
  resolved: number;
  expired: number;
  accuracy: number;          // correct / resolved
  precision: number;         // correct / (correct+incorrect)
  resolutionRate: number;    // resolved / total
  expirationRate: number;    // expired / total
  confidenceQuality: number; // 1 − mean brier (0–1)
  calibrationScore: number;  // 1 − mean |predicted−actual| over bands (0–1)
  volume: number;            // total
  trendAccuracy: number;     // accuracy among trend forecasts
}

/** A timeline event in a forecast's immutable history. */
export interface ForecastTimelineEvent { event: string; at: string; detail: string | null }
