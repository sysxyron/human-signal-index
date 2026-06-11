// =============================================================================
// @hsi/calibration-engine — reliability analysis.
//
// Thin convenience layer over calibrate(): filtering by kind/entity, per-kind
// curves, and a well-calibrated check. Deterministic.
// =============================================================================

import { calibrate } from './calibration';
import type { Prediction, ReliabilityCurve } from './types';

const KINDS: Prediction['kind'][] = [
  'recommendation',
  'forecast',
  'intervention',
  'narrative',
];

/**
 * Compute a reliability curve, optionally filtered to a single kind and/or a
 * single entity before bucketing. Equivalent to calibrate() when no filters
 * are supplied.
 */
export function computeReliabilityCurve(
  predictions: Prediction[],
  opts?: {
    bins?: number;
    now?: string;
    kind?: Prediction['kind'];
    entityId?: string;
  },
): ReliabilityCurve {
  let filtered = predictions;
  if (opts?.kind) filtered = filtered.filter((p) => p.kind === opts.kind);
  if (opts?.entityId)
    filtered = filtered.filter((p) => p.entityId === opts.entityId);
  return calibrate(filtered, { bins: opts?.bins, now: opts?.now });
}

/** A reliability curve per prediction kind (kinds with no data get empty curves). */
export function reliabilityByKind(
  predictions: Prediction[],
  opts?: { bins?: number; now?: string },
): Record<Prediction['kind'], ReliabilityCurve> {
  const out = {} as Record<Prediction['kind'], ReliabilityCurve>;
  for (const kind of KINDS) {
    out[kind] = computeReliabilityCurve(predictions, {
      bins: opts?.bins,
      now: opts?.now,
      kind,
    });
  }
  return out;
}

/**
 * A curve is "well calibrated" when its Expected Calibration Error is within
 * `tolerance` (default 0.1, i.e. within 10 percentage points on average).
 */
export function isWellCalibrated(
  curve: ReliabilityCurve,
  tolerance = 0.1,
): boolean {
  if (curve.sampleCount === 0) return false;
  return curve.expectedCalibrationError <= tolerance;
}
