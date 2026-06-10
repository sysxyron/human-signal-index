// =============================================================================
// @hsi/outcome-intelligence — measurement.ts
//
// Pure per-metric comparison of a recommendation's EXPECTED outcome against the
// ACTUAL observed data. No clocks, no randomness.
// =============================================================================

import type {
  ObservedData,
  OutcomeMeasurement,
  RecommendationRef,
} from './types';

/**
 * Absolute tolerance (in metric units) below which a near-zero expectation that
 * is also near-zero observed is treated as "met". Keeps tiny noise from being
 * scored as a directional miss.
 */
const ZERO_TOLERANCE = 1;

/**
 * Relative tolerance: when sign matches, the observed magnitude must be within
 * this fraction of the expected magnitude (on either side) to be "within
 * expectation". 0.5 → observed between 50% and 150%+ of expected counts.
 */
const MAGNITUDE_TOLERANCE = 0.5;

function sign(n: number): -1 | 0 | 1 {
  if (n > ZERO_TOLERANCE) return 1;
  if (n < -ZERO_TOLERANCE) return -1;
  return 0;
}

/**
 * Compare expected vs observed metric-by-metric. `withinExpectation` is true
 * when the observed value shares the expected sign AND is at least
 * (1 − tolerance) of the expected magnitude — i.e. the world moved the way the
 * recommendation predicted, by roughly the predicted amount. When the expected
 * value is ~0, the observed value must also be ~0 to be "within expectation".
 */
export function measureDelta(
  expected: Record<string, number>,
  observed: Record<string, number>,
): OutcomeMeasurement[] {
  const metrics = Object.keys(expected);
  return metrics.map((metric) => {
    const expectedValue = expected[metric] ?? 0;
    const observedValue = observed[metric] ?? 0;
    const delta = observedValue - expectedValue;
    const es = sign(expectedValue);
    const os = sign(observedValue);
    let withinExpectation: boolean;
    if (es === 0) {
      // Expected no movement → observed must also be ~flat.
      withinExpectation = os === 0;
    } else if (os !== es) {
      // Wrong direction (or flat when movement was expected).
      withinExpectation = false;
    } else {
      // Right direction → require magnitude within tolerance band (no upper cap;
      // exceeding the predicted effect in the right direction still counts).
      const ratio = Math.abs(observedValue) / Math.abs(expectedValue);
      withinExpectation = ratio >= 1 - MAGNITUDE_TOLERANCE;
    }
    return { metric, expectedValue, observedValue, delta, withinExpectation };
  });
}

/**
 * Build the canonical expected-metric map for a recommendation. Uses the
 * explicit `expectedOutcome` when present, otherwise derives a single
 * `signalDeltaPct` expectation from the signed `expectedEffect`.
 */
export function expectedMetricsFor(
  rec: RecommendationRef,
): Record<string, number> {
  if (rec.expectedOutcome && Object.keys(rec.expectedOutcome).length > 0) {
    return { ...rec.expectedOutcome };
  }
  return { signalDeltaPct: rec.expectedEffect };
}

/**
 * Build the observed-metric map aligned to the recommendation's expected keys.
 * Pulls from the named ObservedData fields and merges any free-form metrics.
 */
export function observedMetricsFor(observed: ObservedData): Record<string, number> {
  const out: Record<string, number> = {};
  if (observed.signalDeltaPct !== undefined) out.signalDeltaPct = observed.signalDeltaPct;
  if (observed.amplificationDelta !== undefined)
    out.amplificationDelta = observed.amplificationDelta;
  if (observed.communityDelta !== undefined) out.communityDelta = observed.communityDelta;
  if (observed.metrics) {
    for (const [k, v] of Object.entries(observed.metrics)) out[k] = v;
  }
  return out;
}

/**
 * Compare a recommendation's predicted effect against observed reality.
 *  - directionMatch: did the dominant observed change share the predicted sign?
 *  - magnitudeRatio: observed magnitude / expected magnitude on the primary
 *    metric (0 when no expectation; clamped at 0). 1 == bang on, >1 overshoot.
 */
export function compareExpectedVsActual(
  rec: RecommendationRef,
  observed: ObservedData,
): {
  directionMatch: boolean;
  magnitudeRatio: number;
  measurements: OutcomeMeasurement[];
} {
  const expected = expectedMetricsFor(rec);
  const obs = observedMetricsFor(observed);
  const measurements = measureDelta(expected, obs);

  // Primary metric = the one with the largest expected magnitude.
  let primary = measurements[0];
  for (const m of measurements) {
    if (!primary || Math.abs(m.expectedValue) > Math.abs(primary.expectedValue)) {
      primary = m;
    }
  }

  const expectedMag = primary ? Math.abs(primary.expectedValue) : 0;
  const observedMag = primary ? Math.abs(primary.observedValue) : 0;
  const magnitudeRatio = expectedMag <= ZERO_TOLERANCE ? 0 : observedMag / expectedMag;

  const es = primary ? sign(primary.expectedValue) : 0;
  const os = primary ? sign(primary.observedValue) : 0;
  // Direction matches when the primary expectation was non-trivial and the
  // observed change shares its sign. A flat-expectation reco "matches" when
  // observed is also flat.
  const directionMatch = es === 0 ? os === 0 : os === es;

  return { directionMatch, magnitudeRatio, measurements };
}
