// =============================================================================
// @hsi/calibration-engine — trust scoring.
//
// Combines historical accuracy, evidence quality, calibration, and human/
// governance review outcomes into a 0..100 trust score that is ALWAYS
// explainable (every factor enumerated with its value) and never opaque.
//
// WEIGHTS (documented, sum = 1.0 over the four components):
//   0.40 historicalAccuracy
//   0.25 calibrationScore (1 = perfectly calibrated)
//   0.20 evidenceQuality
//   0.15 governance-net (review + governance outcome ratios)
//
// Each component defaults to a NEUTRAL prior (0.5) when missing, so absent
// signals neither reward nor punish. The blended score is then discounted
// toward the neutral prior (50) when sampleCount is small — small samples
// produce LOW confidence and a pull to neutral, never a confident extreme.
//
// BANDS: high ≥ 70, medium ≥ 40, else low.
// =============================================================================

import type {
  TrustEntityType,
  TrustInputs,
  TrustScore,
} from './types';

export const W_ACCURACY = 0.4;
export const W_CALIBRATION = 0.25;
export const W_EVIDENCE = 0.2;
export const W_GOVERNANCE = 0.15;

/** Sample count at which the score is fully trusted (no neutral discount). */
export const FULL_TRUST_SAMPLES = 20;
const NEUTRAL = 0.5;

function round(n: number, dp = 4): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function pct1(n: number): string {
  return `${Math.round(n * 1000) / 10}%`;
}

/**
 * Derive a 0..1 governance-net signal from review + governance tallies.
 * approved/validated count positively; rejected negatively; escalated is a mild
 * negative (needs human attention). Returns { value, present }.
 */
function governanceNet(inputs: TrustInputs): {
  value: number;
  present: boolean;
  detail: string;
} {
  let pos = 0;
  let neg = 0;
  let total = 0;
  const parts: string[] = [];

  if (inputs.reviewOutcomes) {
    const { approved, rejected } = inputs.reviewOutcomes;
    pos += approved;
    neg += rejected;
    total += approved + rejected;
    parts.push(`reviews ${approved} approved / ${rejected} rejected`);
  }
  if (inputs.governanceOutcomes) {
    const { validated, escalated, rejected } = inputs.governanceOutcomes;
    pos += validated;
    neg += rejected + escalated * 0.5;
    total += validated + escalated + rejected;
    parts.push(
      `governance ${validated} validated / ${escalated} escalated / ${rejected} rejected`,
    );
  }

  if (total === 0) {
    return { value: NEUTRAL, present: false, detail: 'no review/governance signal' };
  }
  // Net positive ratio mapped to 0..1.
  const value = clamp01(pos / (pos + neg) || 0);
  return { value: round(value), present: true, detail: parts.join('; ') };
}

/**
 * Compute an explainable trust score. Never opaque, never forces a verdict, and
 * always discounts toward neutral when evidence is thin.
 */
export function computeTrustScore(
  inputs: TrustInputs,
  opts?: { now?: string },
): TrustScore {
  const lastUpdated = opts?.now ?? '1970-01-01T00:00:00.000Z';
  const explanation: string[] = [];
  const limitations: string[] = [];

  const accuracy = inputs.historicalAccuracy;
  const calibration = inputs.calibrationScore;
  const evidence = inputs.evidenceQuality;
  const gov = governanceNet(inputs);

  const accuracyVal = accuracy !== undefined ? clamp01(accuracy) : NEUTRAL;
  const calibrationVal = calibration !== undefined ? clamp01(calibration) : NEUTRAL;
  const evidenceVal = evidence !== undefined ? clamp01(evidence) : NEUTRAL;
  const govVal = gov.value;

  // Weighted blend in 0..1.
  const blended =
    W_ACCURACY * accuracyVal +
    W_CALIBRATION * calibrationVal +
    W_EVIDENCE * evidenceVal +
    W_GOVERNANCE * govVal;

  // Sample-size discount toward the neutral prior (0.5).
  const sampleCount = Math.max(0, inputs.sampleCount ?? 0);
  const evidenceWeight = clamp01(sampleCount / FULL_TRUST_SAMPLES);
  const adjusted = NEUTRAL + (blended - NEUTRAL) * evidenceWeight;

  const trustScore = round(clamp01(adjusted) * 100, 2);

  // Confidence reflects how much real evidence backs the score.
  const directSignals = [accuracy, calibration, evidence].filter(
    (x) => x !== undefined,
  ).length;
  const signalCompleteness = directSignals / 3;
  const confidence = round(
    clamp01(0.2 + 0.5 * evidenceWeight + 0.3 * signalCompleteness),
  );

  const band: TrustScore['band'] =
    trustScore >= 70 ? 'high' : trustScore >= 40 ? 'medium' : 'low';

  // ---- Explanation: enumerate every contributing factor with its value. -----
  explanation.push(
    `Historical accuracy ${accuracy !== undefined ? pct1(accuracyVal) : 'n/a (neutral 50%)'} × weight ${W_ACCURACY}.`,
  );
  explanation.push(
    `Calibration ${calibration !== undefined ? pct1(calibrationVal) : 'n/a (neutral 50%)'} × weight ${W_CALIBRATION}.`,
  );
  explanation.push(
    `Evidence quality ${evidence !== undefined ? pct1(evidenceVal) : 'n/a (neutral 50%)'} × weight ${W_EVIDENCE}.`,
  );
  explanation.push(
    `Governance-net ${gov.present ? pct1(govVal) : 'n/a (neutral 50%)'} × weight ${W_GOVERNANCE} (${gov.detail}).`,
  );
  explanation.push(
    `Blended ${pct1(blended)} → discounted toward neutral by evidence weight ${round(evidenceWeight, 2)} ` +
      `(sample ${sampleCount}/${FULL_TRUST_SAMPLES}) → ${trustScore}/100 (${band}).`,
  );

  // ---- Limitations: always honest about what the score does NOT know. -------
  if (sampleCount < FULL_TRUST_SAMPLES) {
    limitations.push(
      `Sample of ${sampleCount} is below the ${FULL_TRUST_SAMPLES}-observation floor; score pulled toward neutral and confidence reduced.`,
    );
  }
  if (directSignals < 3) {
    limitations.push(
      `${3 - directSignals} of 3 direct signals (accuracy/calibration/evidence) were absent and defaulted to a neutral 50%.`,
    );
  }
  if (!gov.present) {
    limitations.push(
      'No review or governance outcomes supplied — governance-net is an indirect neutral assumption.',
    );
  }
  limitations.push(
    'Trust score is advisory and grounded only in supplied signals; it is not a guarantee of future behaviour.',
  );

  return {
    entityType: inputs.entityType,
    entityId: inputs.entityId,
    trustScore,
    confidence,
    evidenceCount: sampleCount,
    calibrationScore: round(calibrationVal),
    band,
    explanation,
    limitations,
    lastUpdated,
  };
}

function withType(
  inputs: Omit<TrustInputs, 'entityType'>,
  entityType: TrustEntityType,
  opts?: { now?: string },
): TrustScore {
  return computeTrustScore({ ...inputs, entityType }, opts);
}

/** Convenience builder: trust score for a source. */
export function sourceTrust(
  inputs: Omit<TrustInputs, 'entityType'>,
  opts?: { now?: string },
): TrustScore {
  return withType(inputs, 'source', opts);
}

/** Convenience builder: trust score for a narrative. */
export function narrativeTrust(
  inputs: Omit<TrustInputs, 'entityType'>,
  opts?: { now?: string },
): TrustScore {
  return withType(inputs, 'narrative', opts);
}

/** Convenience builder: trust score for a forecast. */
export function forecastTrust(
  inputs: Omit<TrustInputs, 'entityType'>,
  opts?: { now?: string },
): TrustScore {
  return withType(inputs, 'forecast', opts);
}

/** Convenience builder: trust score for a decision. */
export function decisionTrust(
  inputs: Omit<TrustInputs, 'entityType'>,
  opts?: { now?: string },
): TrustScore {
  return withType(inputs, 'decision', opts);
}

/**
 * Apply a human OVERRIDE to a trust score. Overrides REQUIRE a non-blank reason.
 * If the reason is blank, the base score is returned UNCHANGED with a limitation
 * recording the rejected override — never silent. A valid override records the
 * new score, reason, and (optional) author explainably.
 */
export function applyTrustOverride(
  base: TrustScore,
  override: { newScore: number; reason: string; by?: string; now: string },
): TrustScore & { overridden: true; overrideReason: string } {
  const reason = (override.reason ?? '').trim();

  if (reason.length === 0) {
    return {
      ...base,
      limitations: [
        ...base.limitations,
        'A trust override was REJECTED because no reason was supplied — original score retained.',
      ],
      overridden: true,
      overrideReason: '(rejected: no reason supplied)',
    };
  }

  const newScore = round(Math.min(100, Math.max(0, override.newScore)), 2);
  const band: TrustScore['band'] =
    newScore >= 70 ? 'high' : newScore >= 40 ? 'medium' : 'low';
  const by = override.by ?? 'unspecified reviewer';

  return {
    ...base,
    trustScore: newScore,
    band,
    explanation: [
      ...base.explanation,
      `OVERRIDE by ${by}: trust set to ${newScore}/100 (${band}). Reason: ${reason}.`,
    ],
    limitations: [
      ...base.limitations,
      `Score was manually overridden by ${by}; it no longer reflects the computed signals alone.`,
    ],
    lastUpdated: override.now,
    overridden: true,
    overrideReason: reason,
  };
}
