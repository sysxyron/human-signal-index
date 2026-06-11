// =============================================================================
// @hsi/calibration-engine — confidence drift detection.
//
// Classifies how a CURRENT reliability curve has drifted, optionally relative to
// a PRIOR curve. It RECOMMENDS recalibration — it NEVER auto-corrects confidence.
//
// CLASSIFICATION (priority order, thresholds documented):
//   overconfidence : overconfidenceIndex > +threshold  (states more than it delivers)
//   underconfidence: overconfidenceIndex < −threshold  (delivers more than it states)
//   degradation    : currentEce − priorEce > threshold (calibration got worse)
//   improvement    : priorEce − currentEce > threshold (calibration got better)
//   stable         : none of the above.
//
// magnitude = how far the deciding gap exceeded the threshold, normalised 0..1.
// =============================================================================

import type {
  ConfidenceDriftKind,
  ConfidenceDriftResult,
  ReliabilityCurve,
} from './types';

/** Default |overconfidenceIndex| threshold to flag over/under-confidence. */
export const DEFAULT_DRIFT_THRESHOLD = 0.1;

function round(n: number, dp = 4): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** Describe the highest-error bins for an actionable (advisory) recommendation. */
function worstBinLabels(curve: ReliabilityCurve, topN = 2): string[] {
  return curve.bins
    .filter((b) => b.count > 0)
    .slice()
    .sort((a, b) => b.calibrationError - a.calibrationError)
    .slice(0, topN)
    .map((b) => b.label);
}

/**
 * Detect confidence drift. `prior` is optional — without it, classification
 * relies solely on the current curve's signed overconfidenceIndex.
 *
 * The result is ADVISORY: `recommendation` suggests a recalibration step for a
 * human, and nothing is ever auto-applied. Inputs are NOT mutated.
 */
export function detectConfidenceDrift(
  current: ReliabilityCurve,
  prior?: ReliabilityCurve,
  opts?: { threshold?: number; now?: string },
): ConfidenceDriftResult {
  const threshold = opts?.threshold ?? DEFAULT_DRIFT_THRESHOLD;
  const detectedAt = opts?.now ?? current.generatedAt;
  const oc = current.overconfidenceIndex;
  const currentEce = round(current.expectedCalibrationError);
  const priorEce = prior ? round(prior.expectedCalibrationError) : undefined;
  const worst = worstBinLabels(current);
  const worstStr = worst.length > 0 ? worst.join(' and ') : 'the populated';

  let kind: ConfidenceDriftKind = 'stable';
  let magnitude = 0;
  let recommendation: string;
  let explanation: string;

  const eceDelta =
    priorEce !== undefined ? round(currentEce - priorEce) : undefined;

  if (oc > threshold) {
    kind = 'overconfidence';
    magnitude = round(clamp01((oc - threshold) / (1 - threshold)));
    recommendation =
      `Apply DOWNWARD calibration to the ${worstStr} bins so stated confidence ` +
      `matches observed success. Review before applying — do not auto-correct.`;
    explanation =
      `Stated confidence exceeds observed success by ${round(oc)} on average ` +
      `(overconfidenceIndex ${round(oc)} > +${threshold}). Predictions are overconfident.`;
  } else if (oc < -threshold) {
    kind = 'underconfidence';
    magnitude = round(clamp01((Math.abs(oc) - threshold) / (1 - threshold)));
    recommendation =
      `Consider UPWARD calibration of the ${worstStr} bins; outcomes are better ` +
      `than stated. Review before applying — do not auto-correct.`;
    explanation =
      `Observed success exceeds stated confidence by ${round(Math.abs(oc))} on average ` +
      `(overconfidenceIndex ${round(oc)} < −${threshold}). Predictions are underconfident.`;
  } else if (eceDelta !== undefined && eceDelta > threshold) {
    kind = 'degradation';
    magnitude = round(clamp01((eceDelta - threshold) / (1 - threshold)));
    recommendation =
      `Calibration is drifting worse — recalibrate using recent outcomes and ` +
      `re-check the ${worstStr} bins. Advisory only.`;
    explanation =
      `Expected Calibration Error rose from ${priorEce} to ${currentEce} ` +
      `(+${eceDelta} > ${threshold}). Calibration has degraded versus the prior curve.`;
  } else if (eceDelta !== undefined && -eceDelta > threshold) {
    kind = 'improvement';
    magnitude = round(clamp01((-eceDelta - threshold) / (1 - threshold)));
    recommendation =
      `Calibration improved — no corrective action needed; keep monitoring.`;
    explanation =
      `Expected Calibration Error fell from ${priorEce} to ${currentEce} ` +
      `(${eceDelta} beyond −${threshold}). Calibration has improved versus the prior curve.`;
  } else {
    kind = 'stable';
    magnitude = 0;
    recommendation =
      `No recalibration recommended — confidence is within tolerance. Keep monitoring.`;
    explanation =
      `overconfidenceIndex ${round(oc)} is within ±${threshold}` +
      (eceDelta !== undefined
        ? ` and ECE moved by ${eceDelta} (within ${threshold})`
        : '') +
      `. Calibration is stable.`;
  }

  return {
    kind,
    magnitude,
    currentEce,
    ...(priorEce !== undefined ? { priorEce } : {}),
    recommendation,
    explanation,
    detectedAt,
  };
}

/**
 * Map a drift result to an advisory severity for triage:
 *   stable → LOW; otherwise by magnitude (≥0.5 CRITICAL, ≥0.25 HIGH, ≥0.1 MEDIUM).
 */
export function driftSeverity(
  result: ConfidenceDriftResult,
): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  if (result.kind === 'stable' || result.kind === 'improvement') return 'LOW';
  if (result.magnitude >= 0.5) return 'CRITICAL';
  if (result.magnitude >= 0.25) return 'HIGH';
  if (result.magnitude >= 0.1) return 'MEDIUM';
  return 'LOW';
}
