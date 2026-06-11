// =============================================================================
// @hsi/trust-history — trust DRIFT detection.
//
// Compares the CURRENT (latest) trust against a HISTORICAL baseline and
// classifies the drift. It RECOMMENDS recalibration / review only — it NEVER
// auto-corrects trust.
//
// CLASSIFICATION (priority order, thresholds documented; on a 0..100 scale):
//   collapse        : baseline − current ≥ COLLAPSE_DROP, OR a high→low band fall.
//                     A sudden, severe loss of trust.
//   degradation     : baseline − current ≥ DEGRADE_DROP (but below collapse).
//   instability     : step-change volatility > INSTABILITY_VOL (trust swinging).
//   overconfidence  : trust high but calibration weak — score outruns calibration
//                     by > MISCAL_GAP (stated trust exceeds demonstrated reliability).
//   underconfidence : calibration strong but trust suppressed by > MISCAL_GAP.
//   stable          : none of the above.
//
// magnitude = how far the deciding gap exceeded its threshold, normalised 0..1.
// =============================================================================

import type {
  TrustDriftEvent,
  TrustDriftKind,
  TrustDriftSeverity,
  TrustSnapshot,
} from './types';
import { round, clamp01, bandForScore } from './history';

/** baseline − current at/above which trust has COLLAPSED (severe). */
export const COLLAPSE_DROP = 25;
/** baseline − current at/above which trust has DEGRADED (notable). */
export const DEGRADE_DROP = 10;
/** Step-change stddev above which trust is UNSTABLE. */
export const INSTABILITY_VOL = 12;
/** |trust − calibration*100| above which confidence is mis-stated. */
export const MISCAL_GAP = 25;

function mean(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, n) => a + n, 0) / nums.length;
}

function stddev(nums: number[]): number {
  if (nums.length === 0) return 0;
  const m = mean(nums);
  return Math.sqrt(mean(nums.map((n) => (n - m) * (n - m))));
}

function stepDeltas(scores: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < scores.length; i++) out.push(scores[i] - scores[i - 1]);
  return out;
}

/** Severity from a normalised 0..1 magnitude (collapse always at least HIGH). */
function severityFor(kind: TrustDriftKind, magnitude: number): TrustDriftSeverity {
  if (kind === 'stable') return 'LOW';
  if (kind === 'collapse') return magnitude >= 0.5 ? 'CRITICAL' : 'HIGH';
  if (magnitude >= 0.5) return 'CRITICAL';
  if (magnitude >= 0.25) return 'HIGH';
  if (magnitude >= 0.1) return 'MEDIUM';
  return 'LOW';
}

/**
 * Detect trust drift over a history series. The baseline is the mean of all but
 * the latest snapshot (the established level); the current is the latest. With
 * fewer than 2 points there is nothing to compare, so `stable` is returned with
 * a limitation in the evidence. Inputs are NOT mutated; nothing is auto-applied.
 */
export function detectTrustDrift(
  history: TrustSnapshot[],
  opts?: {
    collapseDrop?: number;
    degradeDrop?: number;
    instabilityVol?: number;
    miscalGap?: number;
    now?: string;
  },
): TrustDriftEvent {
  const collapseDrop = opts?.collapseDrop ?? COLLAPSE_DROP;
  const degradeDrop = opts?.degradeDrop ?? DEGRADE_DROP;
  const instabilityVol = opts?.instabilityVol ?? INSTABILITY_VOL;
  const miscalGap = opts?.miscalGap ?? MISCAL_GAP;

  const sorted = history;
  const latest = sorted[sorted.length - 1];
  const entityType = latest?.entityType ?? 'source';
  const entityId = latest?.entityId ?? 'unknown';
  const detectedAt = opts?.now ?? latest?.at ?? '1970-01-01T00:00:00.000Z';

  const scores = sorted.map((s) => s.trustScore);
  const current = scores.length > 0 ? scores[scores.length - 1] : 0;
  const priorScores = scores.slice(0, -1);
  const baseline = priorScores.length > 0 ? round(mean(priorScores)) : current;
  const drop = round(baseline - current);
  const deltas = stepDeltas(scores);
  const volatility = round(stddev(deltas));

  const currentCalibration = latest ? latest.calibrationScore * 100 : 0;
  const calibGap = round(current - currentCalibration); // + = trust > calibration

  const evidence: string[] = [
    `current ${round(current)} vs baseline ${baseline} (drop ${drop} points over ${priorScores.length} prior snapshot(s)).`,
  ];

  let kind: TrustDriftKind = 'stable';
  let magnitude = 0;
  let reason: string;
  let recommendation: string;

  const bandFell =
    priorScores.length > 0 &&
    bandForScore(baseline) === 'high' &&
    bandForScore(current) === 'low';

  if (scores.length < 2) {
    kind = 'stable';
    magnitude = 0;
    reason = 'Insufficient history to detect drift.';
    recommendation =
      'Accumulate at least two trust snapshots before drift can be assessed. No action.';
    evidence.push('Fewer than 2 snapshots — drift cannot be computed yet.');
  } else if (drop >= collapseDrop || bandFell) {
    kind = 'collapse';
    magnitude = round(clamp01(drop / (collapseDrop * 2)));
    reason = bandFell
      ? `Trust fell from the high band (${baseline}) into the low band (${round(current)}).`
      : `Trust collapsed by ${drop} points (${baseline} → ${round(current)}).`;
    recommendation =
      'Trigger a recalibration proposal and route it through governance review immediately. Do NOT auto-adjust trust.';
    if (bandFell) evidence.push('band fell high → low.');
  } else if (drop >= degradeDrop) {
    kind = 'degradation';
    magnitude = round(clamp01((drop - degradeDrop) / (collapseDrop - degradeDrop)));
    reason = `Trust degraded by ${drop} points (${baseline} → ${round(current)}).`;
    recommendation =
      'Open a recalibration proposal for human review; monitor the next snapshots. Advisory only.';
  } else if (volatility > instabilityVol) {
    kind = 'instability';
    magnitude = round(clamp01((volatility - instabilityVol) / instabilityVol));
    reason = `Trust is unstable — step-change volatility ${volatility} > ${instabilityVol} points.`;
    recommendation =
      'Investigate the source of volatility (thin/erratic evidence) before relying on the score. Advisory only.';
    evidence.push(`step-change stddev ${volatility} over ${deltas.length} step(s).`);
  } else if (calibGap > miscalGap) {
    kind = 'overconfidence';
    magnitude = round(clamp01((calibGap - miscalGap) / (100 - miscalGap)));
    reason = `Trust ${round(current)} outruns calibration ${round(currentCalibration)} by ${calibGap} points.`;
    recommendation =
      'Recommend a DOWNWARD recalibration so trust matches demonstrated reliability. Review before applying.';
    evidence.push(`trust − calibration = ${calibGap} (> ${miscalGap}).`);
  } else if (-calibGap > miscalGap) {
    kind = 'underconfidence';
    magnitude = round(clamp01((Math.abs(calibGap) - miscalGap) / (100 - miscalGap)));
    reason = `Calibration ${round(currentCalibration)} exceeds trust ${round(current)} by ${Math.abs(calibGap)} points.`;
    recommendation =
      'Consider an UPWARD recalibration — the entity is more reliable than its trust suggests. Review before applying.';
    evidence.push(`calibration − trust = ${Math.abs(calibGap)} (> ${miscalGap}).`);
  } else {
    kind = 'stable';
    magnitude = 0;
    reason = `Trust is stable (drop ${drop} < ${degradeDrop}, volatility ${volatility} ≤ ${instabilityVol}).`;
    recommendation = 'No recalibration recommended — keep monitoring.';
  }

  return {
    entityType,
    entityId,
    kind,
    severity: severityFor(kind, magnitude),
    magnitude,
    currentTrust: round(current),
    baselineTrust: baseline,
    reason,
    evidence,
    recommendation,
    detectedAt,
  };
}
