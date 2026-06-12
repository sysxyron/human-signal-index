// =============================================================================
// @hsi/forecast-engine — deterministic offline fixtures + demo.
// =============================================================================

import { buildForecastExplanation, detectForecastFailure, generateForecast } from './forecast';
import { computeForecastAccuracy, computeForecastBrierScore, computeForecastCalibration } from './reliability';
import type { ForecastInput, ForecastOutcome } from './types';

export const FIXTURE_NOW = '2026-06-09T12:00:00.000Z';

/** A well-supported demo forecast input. */
export const DEMO_FORECAST_INPUT: ForecastInput = {
  id: 'fc-1',
  prediction: 'Narrative N will resurge within 30 days.',
  signals: [
    { id: 's1', label: 'Rising mention velocity', strength: 0.8, direction: 1, sourceRef: 'signal:velocity' },
    { id: 's2', label: 'Renewed source activity', strength: 0.7, direction: 1, sourceRef: 'signal:sources' },
    { id: 's3', label: 'Cross-narrative spillover', strength: 0.6, direction: 1 },
    { id: 's4', label: 'Counter-messaging present', strength: 0.4, direction: -1 },
  ],
  assumptions: ['Current source behaviour persists.', 'No major platform intervention.'],
  invalidationCriteria: ['Mention velocity falls for 7 consecutive days.', 'Primary source is removed.'],
  horizon: '30d',
  historicalAccuracy: 0.72,
  historicalSampleCount: 14,
  expiresAt: '2026-07-09T12:00:00.000Z',
};

/** Deterministic historical outcomes for reliability metrics. */
export const DEMO_OUTCOMES: ForecastOutcome[] = [
  { forecastId: 'h1', confidence: 0.9, success: 1 },
  { forecastId: 'h2', confidence: 0.8, success: 1 },
  { forecastId: 'h3', confidence: 0.7, success: 0 },
  { forecastId: 'h4', confidence: 0.65, success: 1 },
  { forecastId: 'h5', confidence: 0.5, success: 0 },
  { forecastId: 'h6', confidence: 0.3, success: 0 },
  { forecastId: 'h7', confidence: 0.85, success: 1 },
  { forecastId: 'h8', confidence: 0.6, success: 1 },
];

/** Run the full forecast chain offline for a UI/demo. Deterministic. */
export function forecastDemo() {
  const now = FIXTURE_NOW;
  const forecast = generateForecast(DEMO_FORECAST_INPUT, { now });
  const explanation = buildForecastExplanation(forecast, { now });
  const failure = detectForecastFailure(forecast, { observations: ['mention velocity is rising'], observedSuccess: 0.7 }, { now });
  const accuracy = computeForecastAccuracy(DEMO_OUTCOMES);
  const calibration = computeForecastCalibration(DEMO_OUTCOMES);
  const brier = computeForecastBrierScore(DEMO_OUTCOMES);
  return { now, forecast, explanation, failure, accuracy, calibration, brier };
}
