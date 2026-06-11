// =============================================================================
// @hsi/trust-history — trust PROVENANCE (buildTrustProvenance).
//
// "Why should I trust this score?" Every trust score must EXPLAIN itself: the
// inputs (calibration, outcomes/accuracy, evidence, governance, historical
// performance), the weights applied, each factor's contribution, the
// limitations, and how the score changed over time. No black-box scores.
//
// The weights MIRROR the Phase-16 trust model (@hsi/calibration-engine):
//   0.40 historicalAccuracy · 0.25 calibration · 0.20 evidenceQuality ·
//   0.15 governance. A missing factor defaults to a NEUTRAL 0.5 and is flagged
//   `present: false` so the explanation never silently rewards/punishes a gap.
// =============================================================================

import type {
  TrustBand,
  TrustExplanation,
  TrustProvenanceFactor,
  TrustProvenanceInputs,
} from './types';
import { round, clamp01, clamp, bandForScore } from './history';
import { computeTrustTrend } from './trend';
import type { TrustSnapshot } from './types';

/** Documented provenance weights (mirror the Phase-16 trust model). */
export const PROVENANCE_WEIGHTS: Record<string, number> = {
  historicalAccuracy: 0.4,
  calibration: 0.25,
  evidenceQuality: 0.2,
  governance: 0.15,
};

const NEUTRAL = 0.5;

function pct(n: number): string {
  return `${Math.round(n * 1000) / 10}%`;
}

function factor(
  name: string,
  raw: number | undefined,
  weight: number,
  detailPresent: string,
  detailAbsent: string,
): TrustProvenanceFactor {
  const present = raw !== undefined;
  const value = present ? clamp01(raw) : NEUTRAL;
  return {
    name,
    value: round(value, 4),
    weight,
    contribution: round(value * weight * 100),
    present,
    detail: present ? detailPresent : detailAbsent,
  };
}

/**
 * Build a full TRUST EXPLANATION (provenance) for an entity's score. Enumerates
 * every factor with its value/weight/contribution, the weights map, explicit
 * limitations, and the recent history (+ its trend). Deterministic — pass `now`
 * via opts. Inputs are NOT mutated.
 */
export function buildTrustProvenance(
  inputs: TrustProvenanceInputs,
  opts: { now: string },
): TrustExplanation {
  const score = round(clamp(inputs.score, 0, 100));
  const band: TrustBand = bandForScore(score);

  const factors: TrustProvenanceFactor[] = [
    factor(
      'historicalAccuracy',
      inputs.historicalAccuracy,
      PROVENANCE_WEIGHTS.historicalAccuracy,
      `Observed success rate across past outcomes (${pct(clamp01(inputs.historicalAccuracy ?? 0))}).`,
      'No outcome history supplied — defaulted to a neutral 50%.',
    ),
    factor(
      'calibration',
      inputs.calibrationScore,
      PROVENANCE_WEIGHTS.calibration,
      `How well stated confidence has matched observed reality (${pct(clamp01(inputs.calibrationScore ?? 0))}).`,
      'No calibration signal supplied — defaulted to a neutral 50%.',
    ),
    factor(
      'evidenceQuality',
      inputs.evidenceQuality,
      PROVENANCE_WEIGHTS.evidenceQuality,
      `Quality/strength of the supporting evidence (${pct(clamp01(inputs.evidenceQuality ?? 0))}).`,
      'No evidence-quality signal supplied — defaulted to a neutral 50%.',
    ),
    factor(
      'governance',
      inputs.governanceSignal,
      PROVENANCE_WEIGHTS.governance,
      `Net human/governance review outcome (${pct(clamp01(inputs.governanceSignal ?? 0))}).`,
      'No review/governance outcomes supplied — defaulted to a neutral 50%.',
    ),
  ];

  const limitations: string[] = [];
  const absent = factors.filter((f) => !f.present);
  if (absent.length > 0) {
    limitations.push(
      `${absent.length} of 4 inputs (${absent
        .map((f) => f.name)
        .join(', ')}) were absent and defaulted to a neutral 50%.`,
    );
  }
  const evidenceCount = Math.max(0, Math.floor(inputs.evidenceCount ?? 0));
  if (evidenceCount < 20) {
    limitations.push(
      `Score rests on ${evidenceCount} observation(s) — a thin sample; treat the score as provisional.`,
    );
  }
  limitations.push(
    'Trust provenance explains the inputs to the score; it is advisory and not a guarantee of future behaviour.',
  );

  // ---- History + trend ------------------------------------------------------
  const history = normaliseHistory(inputs.history ?? []);
  let trend: TrustExplanation['trend'];
  if (history.length >= 2) {
    const snaps: TrustSnapshot[] = history.map((h, i) => ({
      entityType: inputs.entityType,
      entityId: inputs.entityId,
      trustScore: h.trustScore,
      confidence: 0,
      calibrationScore: clamp01(inputs.calibrationScore ?? 0),
      evidenceCount,
      band: bandForScore(h.trustScore),
      at: h.at,
      id: `prov-${i}`,
    }));
    trend = computeTrustTrend(snaps);
  }

  const top = [...factors].sort((a, b) => b.contribution - a.contribution)[0];
  const summary =
    `Trust ${score}/100 (${band}) is driven most by ${top.name} ` +
    `(${top.contribution} of ${score} points)` +
    (trend ? `, and is currently ${trend.trend}.` : '.');

  return {
    entityType: inputs.entityType,
    entityId: inputs.entityId,
    score,
    band,
    factors,
    weights: { ...PROVENANCE_WEIGHTS },
    limitations,
    history,
    ...(trend ? { trend } : {}),
    summary,
    generatedAt: opts.now,
  };
}

/** Sort + clamp a history series ascending by time (pure). */
function normaliseHistory(
  history: { trustScore: number; at: string }[],
): { trustScore: number; at: string }[] {
  return history
    .map((h) => ({ trustScore: round(clamp(h.trustScore, 0, 100)), at: h.at }))
    .slice()
    .sort((a, b) => {
      const ta = Date.parse(a.at);
      const tb = Date.parse(b.at);
      return (Number.isNaN(ta) ? 0 : ta) - (Number.isNaN(tb) ? 0 : tb);
    });
}
