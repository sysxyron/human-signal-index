// =============================================================================
// @hsi/simulation-engine — Temporal Niche Engine v2
// The WorldForge twist: an organism is adapted when its cognitive response rate
// C(t) matches its environment's change rate E(t).
//   C ≈ E  -> balanced
//   C << E -> under-adapted (the world changes faster than it can think)
//   C >> E -> over-reactive (it thinks far faster than anything changes)
// Both rates are in Hz (events/changes per second). Works across 30+ orders of
// magnitude (neuronal Hz down to one-thought-per-century), so we reason in log
// space. The Chronid (1 thought / ~century) comes out severely under-adapted to
// fast environments yet balanced to glacial geological environments.
// =============================================================================

import { clamp01 } from '@hsi/world-models';

export type TemporalLabel = 'under-adapted' | 'balanced' | 'over-reactive';

export interface TemporalAdaptation {
  /** 0..100 adaptation score (100 = perfectly matched). */
  score: number;
  /** C / E ratio (>1 over-reactive, <1 under-adapted). */
  ratio: number;
  /** log10 of the ratio — the "orders of magnitude" mismatch. */
  logRatio: number;
  label: TemporalLabel;
  explanation: string;
}

export interface TemporalInput {
  /** Cognitive response rate, Hz (thoughts/sec). */
  cognitiveRateHz: number;
  /** Environmental change rate, Hz (significant changes/sec). */
  environmentalChangeRate: number;
}

/** Reference environmental change rates (Hz) for common regimes. */
export const ENVIRONMENT_RATES = {
  /** Sub-second weather/predator dynamics. */
  fast: 1, // ~1 change/sec
  /** Seasonal / ecological change. */
  ecological: 1 / (30 * 86400), // ~monthly
  /** Climatic change over centuries. */
  climatic: 1 / (100 * 365 * 86400), // ~per century
  /** Glacial / geological change over millennia+. */
  geological: 1 / (10000 * 365 * 86400), // ~per 10 millennia
} as const;

/**
 * Compute temporal adaptation. Balanced when C ≈ E (within ~1 order of
 * magnitude); the score falls off with the squared log-distance so a 6-order
 * mismatch scores near zero.
 */
export function computeTemporalAdaptation(input: TemporalInput): TemporalAdaptation {
  const C = Math.max(input.cognitiveRateHz, 1e-300);
  const E = Math.max(input.environmentalChangeRate, 1e-300);
  const ratio = C / E;
  const logRatio = Math.log10(ratio);

  // Score: gaussian in log-space. sigma ≈ 1.5 orders → within ~1.5 decades is "good".
  const sigma = 1.5;
  const score = clamp01(Math.exp(-0.5 * (logRatio / sigma) ** 2)) * 100;

  let label: TemporalLabel;
  if (logRatio < -1) label = 'under-adapted';
  else if (logRatio > 1) label = 'over-reactive';
  else label = 'balanced';

  const explanation = explain(label, logRatio, C, E);
  return { score: Math.round(score * 10) / 10, ratio, logRatio, label, explanation };
}

function fmtHz(hz: number): string {
  if (hz >= 1) return `${hz.toPrecision(3)} Hz`;
  const period = 1 / hz; // seconds
  const yr = period / (365 * 86400);
  if (yr >= 1) return `~1 event / ${yr.toPrecision(3)} yr`;
  const days = period / 86400;
  if (days >= 1) return `~1 event / ${days.toPrecision(3)} days`;
  return `~1 event / ${period.toPrecision(3)} s`;
}

function explain(label: TemporalLabel, logRatio: number, C: number, E: number): string {
  const mag = Math.abs(logRatio).toFixed(1);
  const cog = fmtHz(C);
  const env = fmtHz(E);
  switch (label) {
    case 'under-adapted':
      return `Cognition (${cog}) is ~${mag} orders of magnitude slower than environmental change (${env}). The world changes faster than this mind can respond — severely under-adapted to this regime.`;
    case 'over-reactive':
      return `Cognition (${cog}) is ~${mag} orders of magnitude faster than environmental change (${env}). The mind reacts far quicker than anything actually changes — over-reactive (wasted cycles, instability risk).`;
    case 'balanced':
    default:
      return `Cognition (${cog}) closely matches environmental change (${env}). The organism is well-matched (balanced) to this temporal niche.`;
  }
}

/**
 * Evaluate one cognitive rate against ALL reference environments at once — useful
 * for showing that the same mind is under-adapted to one regime and balanced to
 * another (the Chronid case).
 */
export function adaptationAcrossEnvironments(
  cognitiveRateHz: number,
): Record<keyof typeof ENVIRONMENT_RATES, TemporalAdaptation> {
  return {
    fast: computeTemporalAdaptation({ cognitiveRateHz, environmentalChangeRate: ENVIRONMENT_RATES.fast }),
    ecological: computeTemporalAdaptation({ cognitiveRateHz, environmentalChangeRate: ENVIRONMENT_RATES.ecological }),
    climatic: computeTemporalAdaptation({ cognitiveRateHz, environmentalChangeRate: ENVIRONMENT_RATES.climatic }),
    geological: computeTemporalAdaptation({ cognitiveRateHz, environmentalChangeRate: ENVIRONMENT_RATES.geological }),
  };
}
