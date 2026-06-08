// =============================================================================
// @hsi/causal-intelligence — deterministic demo fixtures (OFFLINE showcase).
//
// Hand-built narratives whose snapshot histories exercise EVERY path:
//   * "ai-jobs"      — a full GROWTH story: source_expansion → signal_surge →
//                      community_growth → amplification_spike → contradiction_drop,
//                      milestones birth → growth → viral → peak, plus an inbound
//                      influence_transfer (ai-research → ai-jobs).
//   * "crypto-crash" — a DECLINE story: contradiction_rise + signal fall + a
//                      forecast_shift toward declining/dead; milestones
//                      birth → peak → decline → death.
//   * "meme-stock"   — a RESURGENCE story: rise → dip → renewed rise; milestones
//                      birth → growth → decline → resurgence.
//
// Everything is relative to FIXTURE_NOW. No clocks, no randomness, no network.
// =============================================================================

import { captureNarrativeSnapshot, evolutionSeries } from '@hsi/temporal-intelligence';
import type {
  EvolutionRecord,
  InfluenceEdge,
  NarrativeSnapshot,
  NarrativeStats,
} from '@hsi/temporal-intelligence';

import { attributeChange } from './attribution';
import type { ChangeAttribution } from './attribution';
import { buildCausalChains } from './chains';
import { detectCausalEvents } from './events';
import { explainNarrativeChange } from './explanation';
import { detectNarrativeMilestones } from './milestones';
import { buildReplayFrames } from './replay';
import type {
  CausalChain,
  CausalEvent,
  CausalInput,
  NarrativeChangeExplanation,
  NarrativeMilestone,
  ReplayFrame,
} from './types';

/** Fixed "now" for all causal fixtures. */
export const FIXTURE_NOW = '2026-03-01T00:00:00.000Z';

function daysBefore(days: number): string {
  return new Date(Date.parse(FIXTURE_NOW) - days * 24 * 60 * 60 * 1000).toISOString();
}

function snap(
  narrativeId: string,
  ageDays: number,
  stats: Omit<NarrativeStats, 'narrativeId'>,
  category: string,
): NarrativeSnapshot {
  return captureNarrativeSnapshot(
    { narrativeId, ...stats },
    daysBefore(ageDays),
    { metadata: { category } },
  );
}

// ---- ai-jobs — full GROWTH story --------------------------------------------
// 1 source → 5 sources (source_expansion), 5→40 signals (+700% signal_surge,
// viral), 1→4 communities (community_growth), amp 20→90 (amplification_spike),
// contradiction 30%→8% (contradiction_drop). Then a slight fall (peak).
const AI_JOBS_SNAPS: NarrativeSnapshot[] = [
  snap('ai-jobs', 28, { signalCount: 5, sourceCount: 1, communityCount: 1, amplificationScore: 20, reliabilityScore: 55, supportRatio: 0.55, contradictionRatio: 0.3 }, 'economy'),
  snap('ai-jobs', 21, { signalCount: 12, sourceCount: 3, communityCount: 2, amplificationScore: 42, reliabilityScore: 58, supportRatio: 0.6, contradictionRatio: 0.22 }, 'economy'),
  snap('ai-jobs', 14, { signalCount: 30, sourceCount: 5, communityCount: 4, amplificationScore: 72, reliabilityScore: 61, supportRatio: 0.68, contradictionRatio: 0.12 }, 'economy'),
  snap('ai-jobs', 7, { signalCount: 40, sourceCount: 6, communityCount: 5, amplificationScore: 90, reliabilityScore: 63, supportRatio: 0.72, contradictionRatio: 0.08 }, 'economy'),
  snap('ai-jobs', 2, { signalCount: 34, sourceCount: 6, communityCount: 5, amplificationScore: 78, reliabilityScore: 63, supportRatio: 0.7, contradictionRatio: 0.09 }, 'economy'),
];

// ---- crypto-crash — DECLINE → DEATH story -----------------------------------
// Peaks then falls hard; contradiction rises; last snapshot is far in the past
// (death). 60→30→12→4 signals; contradiction 20%→45%.
const CRYPTO_SNAPS: NarrativeSnapshot[] = [
  snap('crypto-crash', 80, { signalCount: 18, sourceCount: 3, communityCount: 2, amplificationScore: 55, reliabilityScore: 50, supportRatio: 0.5, contradictionRatio: 0.2 }, 'finance'),
  snap('crypto-crash', 70, { signalCount: 60, sourceCount: 4, communityCount: 3, amplificationScore: 85, reliabilityScore: 48, supportRatio: 0.45, contradictionRatio: 0.28 }, 'finance'),
  snap('crypto-crash', 55, { signalCount: 30, sourceCount: 3, communityCount: 2, amplificationScore: 50, reliabilityScore: 46, supportRatio: 0.4, contradictionRatio: 0.4 }, 'finance'),
  snap('crypto-crash', 40, { signalCount: 12, sourceCount: 2, communityCount: 1, amplificationScore: 28, reliabilityScore: 44, supportRatio: 0.35, contradictionRatio: 0.45 }, 'finance'),
];

// ---- meme-stock — RESURGENCE story ------------------------------------------
// Rise → dip → renewed rise. 4→20 (growth) → 8 (decline/dip) → 26 (resurgence).
const MEME_SNAPS: NarrativeSnapshot[] = [
  snap('meme-stock', 30, { signalCount: 4, sourceCount: 1, communityCount: 1, amplificationScore: 18, reliabilityScore: 40, supportRatio: 0.5, contradictionRatio: 0.2 }, 'finance'),
  snap('meme-stock', 24, { signalCount: 12, sourceCount: 2, communityCount: 2, amplificationScore: 45, reliabilityScore: 42, supportRatio: 0.52, contradictionRatio: 0.18 }, 'finance'),
  snap('meme-stock', 18, { signalCount: 20, sourceCount: 3, communityCount: 3, amplificationScore: 60, reliabilityScore: 43, supportRatio: 0.55, contradictionRatio: 0.16 }, 'finance'),
  snap('meme-stock', 12, { signalCount: 8, sourceCount: 2, communityCount: 2, amplificationScore: 30, reliabilityScore: 42, supportRatio: 0.5, contradictionRatio: 0.25 }, 'finance'),
  snap('meme-stock', 5, { signalCount: 26, sourceCount: 4, communityCount: 4, amplificationScore: 70, reliabilityScore: 45, supportRatio: 0.58, contradictionRatio: 0.14 }, 'finance'),
];

// ---- Inbound influence for ai-jobs (drives influence_transfer) --------------
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

const AI_JOBS_INFLUENCE_OUT: InfluenceEdge[] = [
  {
    sourceNarrativeId: 'ai-jobs',
    targetNarrativeId: 'ai-regulation',
    influenceScore: 58,
    sharedEntities: 2,
    sharedSources: 2,
    sharedCommunities: 1,
    rationale: 'ai-jobs fed downstream regulation narrative',
    createdAt: FIXTURE_NOW,
  },
];

function inputFor(
  narrativeId: string,
  snaps: NarrativeSnapshot[],
  opts?: { influenceIn?: InfluenceEdge[]; influenceOut?: InfluenceEdge[] },
): CausalInput {
  const evolution: EvolutionRecord[] = evolutionSeries(snaps, FIXTURE_NOW);
  return {
    narrativeId,
    snapshots: snaps,
    evolution,
    influenceIn: opts?.influenceIn,
    influenceOut: opts?.influenceOut,
    now: FIXTURE_NOW,
  };
}

/** Deterministic demo inputs — one per narrative story. */
export const DEMO_CAUSAL_INPUTS: CausalInput[] = [
  inputFor('ai-jobs', AI_JOBS_SNAPS, {
    influenceIn: AI_JOBS_INFLUENCE_IN,
    influenceOut: AI_JOBS_INFLUENCE_OUT,
  }),
  inputFor('crypto-crash', CRYPTO_SNAPS),
  inputFor('meme-stock', MEME_SNAPS),
];

// ---- End-to-end demo --------------------------------------------------------

export interface CausalNarrativeResult {
  narrativeId: string;
  events: CausalEvent[];
  chains: CausalChain[];
  attribution: ChangeAttribution;
  explanation: NarrativeChangeExplanation;
  replay: ReplayFrame[];
  milestones: NarrativeMilestone[];
}

export interface CausalDemoResult {
  now: string;
  narratives: CausalNarrativeResult[];
}

/**
 * Run the full causal chain over the fixtures for every demo narrative:
 *   events → chains → attribution → explanation → replay → milestones.
 * Fully OFFLINE & DETERMINISTIC — the UI/app can call this to showcase the
 * engine without any network or keys.
 */
export function causalDemo(now: string = FIXTURE_NOW): CausalDemoResult {
  const narratives = DEMO_CAUSAL_INPUTS.map((base): CausalNarrativeResult => {
    const input: CausalInput = { ...base, now };
    const events = detectCausalEvents(input);
    const chains = buildCausalChains(events, input);
    const attribution = attributeChange(input, events);
    const explanation = explainNarrativeChange(input, events, chains);
    const replay = buildReplayFrames(input, 'weekly');
    const milestones = detectNarrativeMilestones(input, events);
    return {
      narrativeId: input.narrativeId,
      events,
      chains,
      attribution,
      explanation,
      replay,
      milestones,
    };
  });

  return { now, narratives };
}
