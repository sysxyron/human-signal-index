// =============================================================================
// @hsi/forecast-engine — forecast generation, scoring, failure detection, and
// explanation.
//
// generateForecast() builds a HYPOTHESIS from supporting signals; its confidence
// is the net (direction-weighted) signal strength, its reliability comes from the
// historical accuracy of comparable forecasts. updateForecast()/expireForecast()
// evolve it. detectForecastFailure() checks observations against the forecast's
// own invalidation criteria. buildForecastExplanation() enumerates every factor.
//
// NO prediction is truth. Every forecast ALWAYS carries assumptions, invalidation
// criteria, and limitations — and nothing auto-acts.
// =============================================================================

import type {
  Forecast,
  ForecastExplanation,
  ForecastFactor,
  ForecastFailureResult,
  ForecastInput,
  ForecastObservation,
  ForecastPatch,
  ForecastSignal,
  ForecastStatus,
} from './types';

const FULL_SIGNAL_COVERAGE = 4;
const FULL_HISTORY = 10;
const NEUTRAL = 0.5;

export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
export function round(n: number, dp = 4): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

/**
 * Score a forecast's confidence from its supporting signals: the net,
 * direction-weighted mean strength, mapped from [-1,1] into [0,1], then scaled by
 * a coverage factor (few signals → pulled toward neutral 0.5). Deterministic.
 */
export function scoreForecastConfidence(signals: ForecastSignal[]): number {
  if (signals.length === 0) return NEUTRAL;
  let weighted = 0;
  let total = 0;
  for (const s of signals) {
    const strength = clamp01(s.strength);
    const dir = Math.sign(s.direction || 0); // -1 / 0 / +1
    weighted += strength * dir;
    total += strength;
  }
  // Net signed strength in [-1, 1].
  const net = total > 0 ? weighted / total : 0;
  // Map to [0,1]: +1 → 1, 0 → 0.5, -1 → 0.
  const directional = (net + 1) / 2;
  // Coverage: more (and stronger) signals → trust the directional score more.
  const coverage = clamp01(total / FULL_SIGNAL_COVERAGE);
  const confidence = NEUTRAL + (directional - NEUTRAL) * coverage;
  return round(clamp01(confidence));
}

/**
 * Compute a forecast's reliability from the historical accuracy of comparable
 * forecasts, discounted toward neutral for a thin history. Absent history → a
 * neutral 0.5.
 */
export function computeForecastReliability(input: {
  historicalAccuracy?: number;
  historicalSampleCount?: number;
}): number {
  const accuracy = input.historicalAccuracy !== undefined ? clamp01(input.historicalAccuracy) : NEUTRAL;
  const samples = Math.max(0, input.historicalSampleCount ?? 0);
  const weight = clamp01(samples / FULL_HISTORY);
  return round(NEUTRAL + (accuracy - NEUTRAL) * weight);
}

/** Build a forecast from inputs. ALWAYS surfaces assumptions/invalidation/limitations. */
export function generateForecast(input: ForecastInput, opts: { now: string }): Forecast {
  const supportingSignals = input.signals.map((s) => ({ ...s, strength: clamp01(s.strength), direction: Math.sign(s.direction || 0) }));
  const confidence = scoreForecastConfidence(supportingSignals);
  const reliability = computeForecastReliability(input);

  const assumptions = input.assumptions && input.assumptions.length > 0 ? input.assumptions.slice() : ['No explicit assumptions were supplied — treat the forecast as weakly grounded.'];
  const invalidationCriteria = input.invalidationCriteria && input.invalidationCriteria.length > 0
    ? input.invalidationCriteria.slice()
    : ['No explicit invalidation criteria — the forecast cannot be cleanly falsified and should be treated with extra caution.'];

  const limitations: string[] = [];
  const totalStrength = supportingSignals.reduce((a, s) => a + s.strength, 0);
  if (supportingSignals.length < FULL_SIGNAL_COVERAGE) {
    limitations.push(`Only ${supportingSignals.length} supporting signal(s) (below the ${FULL_SIGNAL_COVERAGE} coverage floor); confidence pulled toward neutral.`);
  }
  if (totalStrength === 0) limitations.push('Supporting signals have zero net strength — confidence is a neutral 50%.');
  if ((input.historicalSampleCount ?? 0) < FULL_HISTORY) {
    limitations.push(`Reliability rests on ${input.historicalSampleCount ?? 0} comparable past forecast(s); treat reliability as provisional.`);
  }
  limitations.push('A forecast is a HYPOTHESIS, not a prediction of certainty. It requires human governance and ongoing monitoring.');

  return {
    forecastId: input.id,
    prediction: input.prediction,
    confidence,
    reliability,
    status: 'active',
    supportingSignals,
    assumptions,
    invalidationCriteria,
    limitations,
    ...(input.horizon ? { horizon: input.horizon } : {}),
    createdAt: opts.now,
    updatedAt: opts.now,
    ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
    version: 1,
  };
}

/** Update a forecast (re-scores confidence if signals changed); bumps version. */
export function updateForecast(forecast: Forecast, patch: ForecastPatch, opts: { now: string }): Forecast {
  const supportingSignals = patch.signals
    ? patch.signals.map((s) => ({ ...s, strength: clamp01(s.strength), direction: Math.sign(s.direction || 0) }))
    : forecast.supportingSignals;
  return {
    ...forecast,
    ...(patch.prediction !== undefined ? { prediction: patch.prediction } : {}),
    supportingSignals,
    ...(patch.signals ? { confidence: scoreForecastConfidence(supportingSignals) } : {}),
    ...(patch.assumptions ? { assumptions: patch.assumptions.slice() } : {}),
    ...(patch.invalidationCriteria ? { invalidationCriteria: patch.invalidationCriteria.slice() } : {}),
    ...(patch.status ? { status: patch.status } : {}),
    ...(patch.expiresAt !== undefined ? { expiresAt: patch.expiresAt } : {}),
    updatedAt: opts.now,
    version: forecast.version + 1,
  };
}

/** Expire a forecast (status → expired). */
export function expireForecast(forecast: Forecast, opts: { now: string }): Forecast {
  return { ...forecast, status: 'expired' as ForecastStatus, updatedAt: opts.now, version: forecast.version + 1 };
}

/** Has the forecast passed its expiry as of `now`? */
export function isExpired(forecast: Forecast, now: string): boolean {
  if (!forecast.expiresAt) return false;
  const exp = Date.parse(forecast.expiresAt);
  const t = Date.parse(now);
  return !Number.isNaN(exp) && !Number.isNaN(t) && t >= exp;
}

/**
 * Detect whether a forecast has FAILED against its own invalidation criteria. An
 * invalidation criterion is triggered when an observation mentions it (substring,
 * case-insensitive) OR when observedSuccess is very low. Advisory — never acts.
 */
export function detectForecastFailure(
  forecast: Forecast,
  observation: ForecastObservation,
  opts: { now: string; failureThreshold?: number },
): ForecastFailureResult {
  const threshold = opts.failureThreshold ?? 0.25;
  const triggered: string[] = [];
  const obsText = observation.observations.map((o) => o.toLowerCase());
  for (const crit of forecast.invalidationCriteria) {
    const c = crit.toLowerCase();
    if (c.startsWith('no explicit')) continue; // the placeholder criterion never triggers.
    // A criterion triggers when an observation contains it verbatim, OR shares
    // ≥60% of the criterion's significant (>4-char) words — strict enough to avoid
    // false positives from a single shared word.
    const sigWords = c.split(/\s+/).filter((w) => w.length > 4);
    const matched = obsText.some((o) => {
      if (o.includes(c)) return true;
      if (sigWords.length === 0) return false;
      const overlap = sigWords.filter((w) => o.includes(w)).length / sigWords.length;
      return overlap >= 0.6;
    });
    if (matched) triggered.push(crit);
  }
  const lowSuccess = observation.observedSuccess !== undefined && observation.observedSuccess <= threshold;
  const failed = triggered.length > 0 || lowSuccess;
  const reason = failed
    ? triggered.length > 0
      ? `Invalidation criteria met: ${triggered.join('; ')}.`
      : `Observed success ${(observation.observedSuccess! * 100).toFixed(0)}% ≤ ${(threshold * 100).toFixed(0)}% failure threshold.`
    : 'No invalidation criteria triggered; the forecast still stands (monitor).';
  return { failed, triggered, reason, detectedAt: opts.now };
}

/** Build a full, explainable forecast explanation. */
export function buildForecastExplanation(forecast: Forecast, opts: { now: string }): ForecastExplanation {
  const total = forecast.supportingSignals.reduce((a, s) => a + s.strength, 0) || 1;
  const factors: ForecastFactor[] = forecast.supportingSignals
    .map((s) => ({
      label: s.label,
      strength: round(s.strength),
      direction: s.direction,
      contribution: round((s.strength / total) * s.direction),
    }))
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  const top = factors[0];
  const summary =
    `Forecast "${forecast.prediction}" at ${Math.round(forecast.confidence * 100)}% confidence / ` +
    `${Math.round(forecast.reliability * 100)}% reliability` +
    (top ? `, driven most by "${top.label}" (${top.direction >= 0 ? 'supporting' : 'contradicting'}).` : '.') +
    ' This is a hypothesis, not a certainty.';

  return {
    forecastId: forecast.forecastId,
    prediction: forecast.prediction,
    confidence: forecast.confidence,
    reliability: forecast.reliability,
    factors,
    assumptions: forecast.assumptions,
    invalidationCriteria: forecast.invalidationCriteria,
    limitations: forecast.limitations,
    summary,
    generatedAt: opts.now,
  };
}
