// =============================================================================
// @hsi/counterfactual-engine — deterministic demo fixtures (OFFLINE showcase).
//
// Hand-built narratives whose ACTUAL histories enable every ScenarioType:
//   * "ai-jobs"      — GROWTH: source_expansion → signal_surge → community_growth
//                      → amplification_spike → contradiction_drop. Removing the
//                      source expansion or amplification spike slows growth and
//                      can downgrade the forecast.
//   * "crypto-crash" — DECLINE: contradiction_rise + signal fall. Increasing the
//                      contradiction rate deepens the decline.
//
// Plus a BACKTEST history with some forecasts right, some wrong, and a clearly
// OVERCONFIDENT high-band set (stated ~0.9, only ~0.5 correct) so calibration
// has something to pull down. Everything is relative to FIXTURE_NOW — no clocks,
// no randomness, no network.
// =============================================================================

import {
  captureNarrativeSnapshot,
  evolutionSeries,
} from '@hsi/temporal-intelligence';
import { detectCausalEvents } from '@hsi/causal-intelligence';
import type {
  CausalEvent,
  CausalInput,
  InfluenceEdge,
  NarrativeForecast,
  NarrativeSnapshot,
} from '@hsi/causal-intelligence';
import type { NarrativeStats } from '@hsi/temporal-intelligence';

import { generateCounterfactual } from './counterfactual';
import { simulateIntervention } from './interventions';
import {
  backtestForecasts,
  calibrateConfidence,
  computeForecastAccuracy,
} from './validation';
import { generateCounterfactualWorld } from './worldforge';
import type {
  BacktestRecord,
  Calibration,
  CounterfactualInput,
  CounterfactualResult,
  CounterfactualWorld,
  ForecastAccuracy,
} from './types';

/** Fixed "now" for all counterfactual fixtures. */
export const FIXTURE_NOW = '2026-03-01T00:00:00.000Z';

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBefore(days: number): string {
  return new Date(Date.parse(FIXTURE_NOW) - days * DAY_MS).toISOString();
}

function snap(
  narrativeId: string,
  ageDays: number,
  stats: Omit<NarrativeStats, 'narrativeId'>,
  category: string,
): NarrativeSnapshot {
  return captureNarrativeSnapshot({ narrativeId, ...stats }, daysBefore(ageDays), {
    metadata: { category },
  });
}

// ---- ai-jobs — full GROWTH story --------------------------------------------
const AI_JOBS_SNAPS: NarrativeSnapshot[] = [
  snap('ai-jobs', 28, { signalCount: 5, sourceCount: 1, communityCount: 1, amplificationScore: 20, reliabilityScore: 55, supportRatio: 0.55, contradictionRatio: 0.3 }, 'economy'),
  snap('ai-jobs', 21, { signalCount: 12, sourceCount: 3, communityCount: 2, amplificationScore: 42, reliabilityScore: 58, supportRatio: 0.6, contradictionRatio: 0.22 }, 'economy'),
  snap('ai-jobs', 14, { signalCount: 30, sourceCount: 5, communityCount: 4, amplificationScore: 72, reliabilityScore: 61, supportRatio: 0.68, contradictionRatio: 0.12 }, 'economy'),
  snap('ai-jobs', 7, { signalCount: 40, sourceCount: 6, communityCount: 5, amplificationScore: 90, reliabilityScore: 63, supportRatio: 0.72, contradictionRatio: 0.08 }, 'economy'),
  snap('ai-jobs', 2, { signalCount: 34, sourceCount: 6, communityCount: 5, amplificationScore: 78, reliabilityScore: 63, supportRatio: 0.7, contradictionRatio: 0.09 }, 'economy'),
];

// ---- crypto-crash — DECLINE story -------------------------------------------
const CRYPTO_SNAPS: NarrativeSnapshot[] = [
  snap('crypto-crash', 40, { signalCount: 18, sourceCount: 3, communityCount: 2, amplificationScore: 55, reliabilityScore: 50, supportRatio: 0.5, contradictionRatio: 0.2 }, 'finance'),
  snap('crypto-crash', 30, { signalCount: 60, sourceCount: 4, communityCount: 3, amplificationScore: 85, reliabilityScore: 48, supportRatio: 0.45, contradictionRatio: 0.28 }, 'finance'),
  snap('crypto-crash', 20, { signalCount: 30, sourceCount: 3, communityCount: 2, amplificationScore: 50, reliabilityScore: 46, supportRatio: 0.4, contradictionRatio: 0.4 }, 'finance'),
  snap('crypto-crash', 10, { signalCount: 12, sourceCount: 2, communityCount: 1, amplificationScore: 28, reliabilityScore: 44, supportRatio: 0.35, contradictionRatio: 0.45 }, 'finance'),
];

const AI_JOBS_INFLUENCE_IN: InfluenceEdge[] = [
  {
    sourceNarrativeId: 'ai-research',
    targetNarrativeId: 'ai-jobs',
    influenceScore: 72,
    sharedEntities: 3,
    sharedSources: 2,
    sharedCommunities: 1,
    rationale: 'ai-research shares entities/sources with ai-jobs and preceded its surge',
    createdAt: FIXTURE_NOW,
  },
];

function buildInput(
  narrativeId: string,
  snaps: NarrativeSnapshot[],
  influenceIn?: InfluenceEdge[],
): CounterfactualInput {
  const evolution = evolutionSeries(snaps, FIXTURE_NOW);
  const causalInput: CausalInput = {
    narrativeId,
    snapshots: snaps,
    evolution,
    influenceIn,
    now: FIXTURE_NOW,
  };
  const events: CausalEvent[] = detectCausalEvents(causalInput);
  return { narrativeId, snapshots: snaps, evolution, events, now: FIXTURE_NOW };
}

/** Deterministic demo inputs — one per narrative story. */
export const DEMO_CF_INPUTS: CounterfactualInput[] = [
  buildInput('ai-jobs', AI_JOBS_SNAPS, AI_JOBS_INFLUENCE_IN),
  buildInput('crypto-crash', CRYPTO_SNAPS),
];

// ---- Backtest history -------------------------------------------------------
// Mix of right + wrong forecasts, including an OVERCONFIDENT high-band set
// (stated ~0.9 but ~half wrong) so calibration must pull the high band down.

function fc(
  narrativeId: string,
  id: string,
  forecastType: NarrativeForecast['forecastType'],
  probability: number,
): NarrativeForecast {
  return {
    id,
    narrativeId,
    forecastType,
    probability,
    reasoning: [`demo forecast ${id}`],
    generatedAt: FIXTURE_NOW,
  };
}

function bt(
  narrativeId: string,
  id: string,
  forecastType: NarrativeForecast['forecastType'],
  probability: number,
  prior: Omit<NarrativeStats, 'narrativeId'>,
  after: Omit<NarrativeStats, 'narrativeId'>,
): {
  forecast: NarrativeForecast;
  priorSnapshot: NarrativeSnapshot;
  actualSnapshotAfter: NarrativeSnapshot;
} {
  return {
    forecast: fc(narrativeId, id, forecastType, probability),
    priorSnapshot: snap(narrativeId, 14, prior, 'demo'),
    actualSnapshotAfter: snap(narrativeId, 7, after, 'demo'),
  };
}

const base = (over: Partial<Omit<NarrativeStats, 'narrativeId'>>): Omit<NarrativeStats, 'narrativeId'> => ({
  signalCount: 20,
  sourceCount: 3,
  communityCount: 2,
  amplificationScore: 50,
  reliabilityScore: 50,
  supportRatio: 0.5,
  contradictionRatio: 0.2,
  ...over,
});

/**
 * Backtest history. High-band entries (prob ~0.9): two predict "rising" but the
 * actual transition is flat/decline → WRONG; two are right. Net ~50% accuracy in
 * the high band against ~0.9 stated confidence → strongly overconfident.
 */
export const DEMO_BACKTEST_HISTORY = [
  // --- HIGH band, overconfident (stated ~0.9, ~50% correct) ---
  bt('h1', 'h1', 'rising', 0.9, base({ signalCount: 20 }), base({ signalCount: 40 })), // rising, actual rising -> RIGHT
  bt('h2', 'h2', 'rising', 0.9, base({ signalCount: 20 }), base({ signalCount: 21 })), // rising, actual stable -> WRONG
  bt('h3', 'h3', 'rising', 0.88, base({ signalCount: 30 }), base({ signalCount: 12 })), // rising, actual declining -> WRONG
  bt('h4', 'h4', 'declining', 0.9, base({ signalCount: 30 }), base({ signalCount: 10 })), // declining, actual declining -> RIGHT
  // --- MEDIUM band (stated ~0.55), roughly calibrated ---
  bt('m1', 'm1', 'stable', 0.55, base({ signalCount: 20 }), base({ signalCount: 21 })), // stable, actual stable -> RIGHT
  bt('m2', 'm2', 'rising', 0.5, base({ signalCount: 20 }), base({ signalCount: 40 })), // rising, actual rising -> RIGHT
  bt('m3', 'm3', 'stable', 0.5, base({ signalCount: 20 }), base({ signalCount: 50 })), // stable, actual rising -> WRONG
  // --- LOW band (stated ~0.3), roughly calibrated ---
  bt('l1', 'l1', 'declining', 0.3, base({ signalCount: 20 }), base({ signalCount: 19 })), // declining, actual stable -> WRONG
  bt('l2', 'l2', 'stable', 0.3, base({ signalCount: 20 }), base({ signalCount: 21 })), // stable, actual stable -> RIGHT
];

// ---- End-to-end demo --------------------------------------------------------

export interface CounterfactualDemoResult {
  now: string;
  counterfactuals: CounterfactualResult[];
  interventions: CounterfactualResult[];
  worlds: CounterfactualWorld[];
  backtest: BacktestRecord[];
  accuracy: ForecastAccuracy;
  calibration: Calibration;
  /** A sample calibrated confidence to demonstrate the pull-down. */
  calibratedSample: { raw: number; calibrated: number; band: string };
}

/**
 * Run the full counterfactual chain over the fixtures:
 *   generate → simulate (intervention preset) → backtest → calibrate → worldforge.
 * Fully OFFLINE & DETERMINISTIC for offline UI/demo.
 */
export function counterfactualDemo(
  now: string = FIXTURE_NOW,
): CounterfactualDemoResult {
  const counterfactuals: CounterfactualResult[] = [
    // Natural-strength removal of the source expansion: growth slows materially.
    generateCounterfactual(DEMO_CF_INPUTS[0], { type: 'remove_source' }, now),
    // Stronger removal: enough to downgrade the forecast (rising → stable),
    // demonstrating a counterfactual that flips the trajectory.
    generateCounterfactual(
      DEMO_CF_INPUTS[0],
      { type: 'remove_source', magnitude: 2, name: 'Remove source expansion (strong)' },
      now,
    ),
    generateCounterfactual(DEMO_CF_INPUTS[1], { type: 'increase_contradiction' }, now),
  ];

  const interventions: CounterfactualResult[] = [
    simulateIntervention(DEMO_CF_INPUTS[0], 'remove_amplification_spike', now),
    simulateIntervention(DEMO_CF_INPUTS[0], 'delay_community_growth', now),
  ];

  const worlds: CounterfactualWorld[] = counterfactuals.map((r) =>
    generateCounterfactualWorld(
      DEMO_CF_INPUTS.find((i) => i.narrativeId === r.narrativeId)!,
      r,
      now,
    ),
  );

  const backtest = backtestForecasts(DEMO_BACKTEST_HISTORY, now);
  const accuracy = computeForecastAccuracy(backtest, 'demo', '7d');
  const calibration = calibrateConfidence(backtest);
  const calibratedSample = (() => {
    const out = calibration.calibrate(0.9);
    return { raw: 0.9, calibrated: out.calibrated, band: out.band };
  })();

  return {
    now,
    counterfactuals,
    interventions,
    worlds,
    backtest,
    accuracy,
    calibration,
    calibratedSample,
  };
}
