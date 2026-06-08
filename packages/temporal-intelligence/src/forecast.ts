// =============================================================================
// @hsi/temporal-intelligence — probabilistic narrative trajectory forecast.
//
// forecastNarrativeTrajectory produces a probability DISTRIBUTION over the five
// trajectory states (sums to ~1), picks the argmax as forecastType, and explains
// every driver. It NEVER claims certainty: probabilities are softmax-capped < 1,
// and thin data WIDENS the distribution (toward uniform) with a caveat in the
// reasoning. Pure & deterministic — caller injects `now`.
//
// SIGNALS used:
//   * signal velocity (signals/day over the snapshot window),
//   * amplification trend (last delta) + acceleration (2nd derivative),
//   * community growth (net change),
//   * age (days since firstSeen / first snapshot),
//   * recent inactivity (days since last snapshot with new signals).
//
// STATE INTUITION:
//   emerging  — young + accelerating (new and picking up),
//   rising    — sustained positive velocity / amplification growth,
//   stable    — flat velocity & amplification,
//   declining — sustained negative velocity / amplification drop,
//   dead      — no recent activity (stale beyond DEAD_STALE_DAYS).
// =============================================================================

import {
  amplificationAcceleration,
  signalVelocity,
} from './evolution';
import type {
  EvolutionRecord,
  ForecastState,
  NarrativeForecast,
  NarrativeSnapshot,
} from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

// ---- Documented thresholds --------------------------------------------------
/** No new activity beyond this many days → strong "dead" pull. */
export const DEAD_STALE_DAYS = 21;
/** Narrative younger than this (days) counts as "young" for emerging. */
export const YOUNG_DAYS = 14;
/** Snapshots fewer than this → "thin data": widen distribution + caveat. */
export const THIN_DATA_SNAPSHOTS = 3;
/** Per-state probability cap — we NEVER assert certainty. */
export const MAX_PROBABILITY = 0.92;

const STATES: ForecastState[] = [
  'emerging',
  'rising',
  'stable',
  'declining',
  'dead',
];

function round(n: number, dp = 4): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

function orderByTime(snapshots: NarrativeSnapshot[]): NarrativeSnapshot[] {
  return [...snapshots].sort(
    (a, b) =>
      Date.parse(a.capturedAt) - Date.parse(b.capturedAt) ||
      a.id.localeCompare(b.id),
  );
}

/** Softmax with temperature; higher temp → flatter (more uncertain). */
function softmax(scores: Record<ForecastState, number>, temp: number): Record<ForecastState, number> {
  const vals = STATES.map((s) => scores[s] / temp);
  const max = Math.max(...vals);
  const exps = vals.map((v) => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  const out = {} as Record<ForecastState, number>;
  STATES.forEach((s, i) => {
    out[s] = exps[i] / sum;
  });
  return out;
}

/**
 * Forecast a narrative's trajectory as an explainable probability distribution.
 */
export function forecastNarrativeTrajectory(input: {
  narrativeId: string;
  snapshots: NarrativeSnapshot[];
  evolution: EvolutionRecord[];
  now: string;
}): NarrativeForecast {
  const { narrativeId, now } = input;
  const snaps = orderByTime(input.snapshots);
  const reasoning: string[] = [];

  const nowMs = Date.parse(now);
  const velocity = signalVelocity(snaps); // signals/day
  const accel = amplificationAcceleration(snaps); // 2nd derivative of amp

  // Age since the first snapshot (proxy for narrative age).
  const ageDays =
    snaps.length > 0
      ? Math.max(0, (nowMs - Date.parse(snaps[0].capturedAt)) / DAY_MS)
      : 0;

  // Staleness: days since the last snapshot.
  const staleDays =
    snaps.length > 0
      ? Math.max(0, (nowMs - Date.parse(snaps[snaps.length - 1].capturedAt)) / DAY_MS)
      : Number.POSITIVE_INFINITY;

  // Recent amplification delta (last consecutive pair).
  const lastAmpDelta =
    snaps.length >= 2
      ? snaps[snaps.length - 1].amplificationScore -
        snaps[snaps.length - 2].amplificationScore
      : 0;

  // Community growth over the window.
  const communityGrowth =
    snaps.length >= 2
      ? snaps[snaps.length - 1].communityCount - snaps[0].communityCount
      : 0;

  // Recent signal change from the last evolution record (if any).
  const lastEvo = input.evolution[input.evolution.length - 1];
  const recentGrowthPct = lastEvo?.growthPct ?? velocity * 7; // ~weekly proxy

  // ---- Raw state scores (linear, then softmax) ------------------------------
  const score: Record<ForecastState, number> = {
    emerging: 0,
    rising: 0,
    stable: 0,
    declining: 0,
    dead: 0,
  };

  // Dead: dominated by staleness.
  if (staleDays >= DEAD_STALE_DAYS) {
    score.dead += 2.2 + Math.min(staleDays / DEAD_STALE_DAYS, 3);
    reasoning.push(
      `no new snapshots in ${Math.round(staleDays)} days (≥ ${DEAD_STALE_DAYS}) → declining/dead`,
    );
  } else if (velocity <= 0 && lastAmpDelta <= 0 && staleDays > DEAD_STALE_DAYS / 2) {
    score.dead += 1.0;
    score.declining += 0.8;
    reasoning.push(`flat/negative activity and aging → decline risk`);
  }

  // Rising: sustained positive velocity / amplification growth.
  if (velocity > 0) {
    score.rising += 1.0 + Math.min(velocity, 10) * 0.15;
    reasoning.push(`signal velocity +${round(velocity, 2)}/day`);
  }
  if (lastAmpDelta > 0) {
    score.rising += 0.6 + Math.min(lastAmpDelta, 40) / 40;
    reasoning.push(`amplification rising (+${round(lastAmpDelta, 2)} last step)`);
  } else if (lastAmpDelta === 0 && snaps.length >= 2) {
    score.stable += 0.8;
    reasoning.push(`amplification plateaued`);
  }

  // Emerging: young + accelerating.
  if (ageDays <= YOUNG_DAYS && (accel > 0 || velocity > 0)) {
    score.emerging += 1.4 + Math.min(Math.max(accel, 0), 20) / 20;
    reasoning.push(
      `young (${Math.round(ageDays)}d) and accelerating (amp accel ${round(accel, 2)}) → emerging`,
    );
  }

  // Stable: flat velocity & amplification.
  if (Math.abs(velocity) < 0.2 && Math.abs(lastAmpDelta) < 5 && staleDays < DEAD_STALE_DAYS) {
    score.stable += 1.2;
    reasoning.push(`velocity & amplification roughly flat → stable`);
  }

  // Declining: sustained negative velocity / amplification drop.
  if (velocity < 0 || lastAmpDelta < -5 || recentGrowthPct < -20) {
    score.declining += 1.2 + Math.min(Math.abs(Math.min(velocity, 0)), 10) * 0.1;
    reasoning.push(
      `negative trend (velocity ${round(velocity, 2)}/day, amp Δ ${round(lastAmpDelta, 2)}) → declining`,
    );
  }

  // Community growth nudges emerging/rising.
  if (communityGrowth > 0) {
    score.rising += Math.min(communityGrowth, 4) * 0.2;
    score.emerging += Math.min(communityGrowth, 4) * 0.1;
    reasoning.push(`+${communityGrowth} communities over window`);
  }

  // Baseline so a flat narrative still has mass on 'stable'.
  score.stable += 0.5;

  // ---- Thin-data handling: widen (raise softmax temperature) ----------------
  const thin = snaps.length < THIN_DATA_SNAPSHOTS;
  // Temperature: 1.0 normally; thin data → 2.0 (much flatter / more uncertain).
  const temp = thin ? 2.0 : 1.0;
  if (thin) {
    reasoning.push(
      `THIN DATA (${snaps.length} snapshot${snaps.length === 1 ? '' : 's'} < ${THIN_DATA_SNAPSHOTS}): ` +
        `distribution widened — treat this forecast as low-confidence.`,
    );
  }

  let distribution = softmax(score, temp);

  // ---- Never certainty: cap argmax, redistribute the excess -----------------
  let argmax: ForecastState = STATES[0];
  for (const s of STATES) if (distribution[s] > distribution[argmax]) argmax = s;
  if (distribution[argmax] > MAX_PROBABILITY) {
    const excess = distribution[argmax] - MAX_PROBABILITY;
    distribution[argmax] = MAX_PROBABILITY;
    const others = STATES.filter((s) => s !== argmax);
    for (const s of others) distribution[s] += excess / others.length;
  }

  // Round + renormalize to keep the sum ≈ 1 after rounding.
  const rounded = {} as Record<ForecastState, number>;
  let sum = 0;
  for (const s of STATES) {
    rounded[s] = round(distribution[s]);
    sum += rounded[s];
  }
  // Absorb rounding drift into the argmax (kept ≤ MAX_PROBABILITY).
  if (sum !== 1) {
    rounded[argmax] = round(Math.min(MAX_PROBABILITY, rounded[argmax] + (1 - sum)));
  }
  distribution = rounded;

  // Re-pick argmax after capping (capping can change the winner only by ties).
  let best: ForecastState = STATES[0];
  for (const s of STATES) if (distribution[s] > distribution[best]) best = s;

  return {
    narrativeId,
    forecastType: best,
    probability: distribution[best],
    reasoning,
    distribution,
    generatedAt: now,
  };
}
