// =============================================================================
// @hsi/recalibration-engine — recalibration RECOMMENDATION.
//
// proposeRecalibration() builds a RecalibrationProposal from a trigger. It is a
// recommendation ONLY — it changes nothing. proposalFromDriftEvent() and
// proposalFromCalibrationError() are convenience builders from the Phase-17
// trust-drift / Phase-16 calibration signals.
//
// Examples (per the spec):
//   "Forecast trust fell from 72 → 48."
//   "Calibration error exceeded threshold."
//   "Source confidence consistently overstated."
// =============================================================================

import type { TrustDriftEvent } from '@hsi/trust-history';
import type {
  RecalibrationDirection,
  RecalibrationProposal,
  RecalibrationProposalInput,
  RecalibrationSeverity,
  RecalibrationTrigger,
} from './types';

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function round(n: number, dp = 4): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

function directionOf(current: number, recommended: number): RecalibrationDirection {
  const d = round(recommended - current);
  if (d < 0) return 'downward';
  if (d > 0) return 'upward';
  return 'none';
}

/** Map a 0..1 confidence-change magnitude to an advisory severity. */
export function severityForMagnitude(magnitude: number): RecalibrationSeverity {
  if (magnitude >= 0.3) return 'CRITICAL';
  if (magnitude >= 0.2) return 'HIGH';
  if (magnitude >= 0.1) return 'MEDIUM';
  return 'LOW';
}

const DEFAULT_REASONS: Record<RecalibrationTrigger, string> = {
  trust_drift: 'Trust has drifted from its established baseline.',
  trust_collapse: 'Trust has collapsed suddenly and severely.',
  calibration_error: 'Calibration error exceeded the acceptable threshold.',
  overconfidence: 'Stated confidence consistently overstates observed reliability.',
  underconfidence: 'Stated confidence consistently understates observed reliability.',
  source_overstated: 'Source confidence has been consistently overstated.',
  manual: 'Manual recalibration requested by a reviewer.',
};

/**
 * Build a recalibration PROPOSAL. The confidences are clamped to 0..1, the
 * direction + magnitude + severity are derived, and the status starts `pending`.
 * NEVER applies anything. Deterministic — pass `now` via opts.
 */
export function proposeRecalibration(
  input: RecalibrationProposalInput,
  opts: { now: string },
): RecalibrationProposal {
  const currentConfidence = round(clamp01(input.currentConfidence));
  const recommendedConfidence = round(clamp01(input.recommendedConfidence));
  const magnitude = round(Math.abs(recommendedConfidence - currentConfidence));
  const direction = directionOf(currentConfidence, recommendedConfidence);
  const reason = (input.reason ?? DEFAULT_REASONS[input.trigger]).trim();

  const supportingEvidence =
    input.supportingEvidence && input.supportingEvidence.length > 0
      ? input.supportingEvidence.slice()
      : [
          `Current confidence ${(currentConfidence * 100).toFixed(0)}% → recommended ${(recommendedConfidence * 100).toFixed(0)}% (${direction}, Δ${(magnitude * 100).toFixed(0)} points).`,
        ];

  return {
    id: input.id,
    entityType: input.entityType,
    entityId: input.entityId,
    trigger: input.trigger,
    currentConfidence,
    recommendedConfidence,
    ...(input.currentTrust !== undefined
      ? { currentTrust: round(input.currentTrust, 2) }
      : {}),
    ...(input.recommendedTrust !== undefined
      ? { recommendedTrust: round(input.recommendedTrust, 2) }
      : {}),
    direction,
    magnitude,
    severity: severityForMagnitude(magnitude),
    reason,
    supportingEvidence,
    status: 'pending',
    createdAt: opts.now,
  };
}

/** Map a trust-drift kind to the matching recalibration trigger. */
function triggerForDrift(kind: TrustDriftEvent['kind']): RecalibrationTrigger {
  switch (kind) {
    case 'collapse':
      return 'trust_collapse';
    case 'overconfidence':
      return 'overconfidence';
    case 'underconfidence':
      return 'underconfidence';
    case 'degradation':
    case 'instability':
      return 'trust_drift';
    default:
      return 'manual';
  }
}

/**
 * Build a proposal directly from a Phase-17 TrustDriftEvent. The recommended
 * confidence is nudged toward the entity's demonstrated reliability:
 *   * over-confidence / collapse / degradation → DOWNWARD by a magnitude-scaled
 *     step;
 *   * under-confidence → UPWARD by a magnitude-scaled step.
 * The drift's own evidence + reason are carried into the proposal. Returns null
 * for a `stable` event (nothing to recalibrate).
 */
export function proposalFromDriftEvent(
  drift: TrustDriftEvent,
  input: {
    id: string;
    currentConfidence: number;
    /** Optional explicit target; otherwise derived from the drift magnitude. */
    recommendedConfidence?: number;
  },
  opts: { now: string },
): RecalibrationProposal | null {
  if (drift.kind === 'stable') return null;

  const current = clamp01(input.currentConfidence);
  // Step is the drift magnitude scaled into a confidence nudge (max ~0.3).
  const step = round(Math.min(0.3, 0.1 + drift.magnitude * 0.2));
  let recommended: number;
  if (input.recommendedConfidence !== undefined) {
    recommended = clamp01(input.recommendedConfidence);
  } else if (drift.kind === 'underconfidence') {
    recommended = clamp01(current + step);
  } else {
    recommended = clamp01(current - step);
  }

  return proposeRecalibration(
    {
      id: input.id,
      entityType: drift.entityType,
      entityId: drift.entityId,
      trigger: triggerForDrift(drift.kind),
      currentConfidence: current,
      recommendedConfidence: recommended,
      currentTrust: drift.currentTrust,
      recommendedTrust: drift.baselineTrust,
      reason: drift.reason,
      supportingEvidence: [...drift.evidence, `drift recommendation: ${drift.recommendation}`],
    },
    opts,
  );
}

/**
 * Build a proposal from a calibration-error exceedance. `ece` is the observed
 * Expected Calibration Error (0..1) and `threshold` the acceptable ceiling. The
 * recommended confidence is the current minus the overshoot (overconfidence is
 * the usual cause). Returns null when ECE is within tolerance.
 */
export function proposalFromCalibrationError(
  input: {
    id: string;
    entityType: RecalibrationProposal['entityType'];
    entityId: string;
    currentConfidence: number;
    ece: number;
    threshold?: number;
  },
  opts: { now: string },
): RecalibrationProposal | null {
  const threshold = input.threshold ?? 0.1;
  const ece = clamp01(input.ece);
  if (ece <= threshold) return null;
  const overshoot = round(ece - threshold);
  const current = clamp01(input.currentConfidence);
  const recommended = clamp01(current - overshoot);

  return proposeRecalibration(
    {
      id: input.id,
      entityType: input.entityType,
      entityId: input.entityId,
      trigger: 'calibration_error',
      currentConfidence: current,
      recommendedConfidence: recommended,
      reason: `Calibration error ${(ece * 100).toFixed(1)}% exceeded the ${(threshold * 100).toFixed(0)}% threshold.`,
      supportingEvidence: [
        `ECE ${(ece * 100).toFixed(1)}% > threshold ${(threshold * 100).toFixed(0)}% (overshoot ${(overshoot * 100).toFixed(1)} points).`,
        `Recommend lowering stated confidence by the overshoot to restore calibration.`,
      ],
    },
    opts,
  );
}
