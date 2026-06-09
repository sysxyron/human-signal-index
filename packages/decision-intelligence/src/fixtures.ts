// =============================================================================
// @hsi/decision-intelligence — deterministic demo fixtures (OFFLINE showcase).
//
// Hand-built narratives whose ACTUAL histories drive the full decision chain:
//   * "ai-surveillance" — a STRONG GROWTH story dominated by a single cause (an
//     amplification spike) under high amplification + low reliability → adversarial.
//     Enables a clear sensitivity dominant, a full intervention ranking, and a
//     recommendation that recommends a dampening action.
//   * "ai-ethics"       — a co-moving narrative that ai-surveillance AMPLIFIES
//     (high influence + shared communities, same-direction growth).
//   * "ai-regulation"   — a COMPETING narrative (shared audience, OPPOSITE
//     trajectory — it falls as ai-surveillance rises).
//
// Plus two scenario battles: a DECISIVE one (aggressive removal vs a weak nudge)
// and a NEAR-TIE one (two similar single-intervention plans). All relative to
// FIXTURE_NOW — no clocks, no randomness, no network.
// =============================================================================

import {
  captureNarrativeSnapshot,
  evolutionSeries,
} from '@hsi/temporal-intelligence';
import { detectCausalEvents } from '@hsi/causal-intelligence';
import { forecastNarrativeTrajectory } from '@hsi/temporal-intelligence';
import type {
  CausalEvent,
  CausalInput,
  InfluenceEdge,
  NarrativeForecast,
  NarrativeSnapshot,
} from '@hsi/causal-intelligence';
import type { NarrativeStats } from '@hsi/temporal-intelligence';

import { buildDecisionAudit } from './audit';
import { compareScenarios } from './comparison';
import { computeCrossNarrativeImpact } from './crossNarrative';
import type { CrossNarrativeTarget } from './crossNarrative';
import {
  generateDecisionRun,
  simulateInterventionSet,
} from './decision';
import { rankInterventions } from './ranking';
import { generateRecommendations } from './recommendations';
import { runSensitivityAnalysis } from './sensitivity';
import type {
  CrossNarrativeImpact,
  DecisionAudit,
  DecisionInput,
  DecisionRun,
  InterventionRanking,
  InterventionSetResult,
  Recommendation,
  ScenarioBattleResult,
  SensitivityResult,
} from './types';

/** Fixed "now" for all decision fixtures. */
export const FIXTURE_NOW = '2026-04-01T00:00:00.000Z';

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

// ---- ai-surveillance — strong growth, single dominant cause -----------------
// Amplification leaps 20→85 in one step (a dominant amplification_spike) while
// sources/communities grow modestly — so attribution concentrates on the spike.
// One sharp amplification leap (22→90) dominates; signals/sources/communities
// grow only gently and steadily, so the amplification_spike out-attributes the
// (smaller, spread-out) signal surges and is the clear dominant cause.
const SURVEILLANCE_SNAPS: NarrativeSnapshot[] = [
  snap('ai-surveillance', 28, { signalCount: 30, sourceCount: 4, communityCount: 3, amplificationScore: 20, reliabilityScore: 48, supportRatio: 0.5, contradictionRatio: 0.28 }, 'security'),
  snap('ai-surveillance', 21, { signalCount: 33, sourceCount: 4, communityCount: 3, amplificationScore: 22, reliabilityScore: 47, supportRatio: 0.52, contradictionRatio: 0.26 }, 'security'),
  snap('ai-surveillance', 14, { signalCount: 38, sourceCount: 5, communityCount: 4, amplificationScore: 90, reliabilityScore: 45, supportRatio: 0.55, contradictionRatio: 0.22 }, 'security'),
  snap('ai-surveillance', 7, { signalCount: 44, sourceCount: 5, communityCount: 4, amplificationScore: 93, reliabilityScore: 44, supportRatio: 0.57, contradictionRatio: 0.2 }, 'security'),
  snap('ai-surveillance', 2, { signalCount: 48, sourceCount: 5, communityCount: 4, amplificationScore: 94, reliabilityScore: 43, supportRatio: 0.58, contradictionRatio: 0.19 }, 'security'),
];

// ---- ai-ethics — co-moving, amplified by ai-surveillance --------------------
const ETHICS_SNAPS: NarrativeSnapshot[] = [
  snap('ai-ethics', 28, { signalCount: 6, sourceCount: 2, communityCount: 1, amplificationScore: 20, reliabilityScore: 60, supportRatio: 0.6, contradictionRatio: 0.18 }, 'ethics'),
  snap('ai-ethics', 14, { signalCount: 22, sourceCount: 3, communityCount: 3, amplificationScore: 70, reliabilityScore: 58, supportRatio: 0.62, contradictionRatio: 0.16 }, 'ethics'),
  snap('ai-ethics', 2, { signalCount: 48, sourceCount: 4, communityCount: 4, amplificationScore: 88, reliabilityScore: 57, supportRatio: 0.63, contradictionRatio: 0.15 }, 'ethics'),
];

// ---- ai-regulation — competing, OPPOSITE trajectory -------------------------
const REGULATION_SNAPS: NarrativeSnapshot[] = [
  snap('ai-regulation', 28, { signalCount: 50, sourceCount: 5, communityCount: 4, amplificationScore: 72, reliabilityScore: 62, supportRatio: 0.6, contradictionRatio: 0.18 }, 'policy'),
  snap('ai-regulation', 14, { signalCount: 30, sourceCount: 4, communityCount: 3, amplificationScore: 55, reliabilityScore: 60, supportRatio: 0.55, contradictionRatio: 0.24 }, 'policy'),
  snap('ai-regulation', 2, { signalCount: 14, sourceCount: 3, communityCount: 2, amplificationScore: 38, reliabilityScore: 58, supportRatio: 0.5, contradictionRatio: 0.3 }, 'policy'),
];

// Influence: ai-surveillance pushes hard into ai-ethics, weakly into regulation.
const SURVEILLANCE_INFLUENCE_OUT: InfluenceEdge[] = [
  {
    sourceNarrativeId: 'ai-surveillance',
    targetNarrativeId: 'ai-ethics',
    influenceScore: 78,
    sharedEntities: 4,
    sharedSources: 3,
    sharedCommunities: 3,
    rationale: 'ai-surveillance precedes and shares audience with ai-ethics',
    createdAt: FIXTURE_NOW,
  },
  {
    sourceNarrativeId: 'ai-surveillance',
    targetNarrativeId: 'ai-regulation',
    influenceScore: 44,
    sharedEntities: 2,
    sharedSources: 3,
    sharedCommunities: 3,
    rationale: 'shared policy audience but diverging momentum',
    createdAt: FIXTURE_NOW,
  },
];

function buildInput(
  narrativeId: string,
  snaps: NarrativeSnapshot[],
  opts?: { influenceOut?: InfluenceEdge[]; influenceIn?: InfluenceEdge[] },
): DecisionInput {
  const evolution = evolutionSeries(snaps, FIXTURE_NOW);
  const causalInput: CausalInput = {
    narrativeId,
    snapshots: snaps,
    evolution,
    influenceOut: opts?.influenceOut,
    influenceIn: opts?.influenceIn,
    now: FIXTURE_NOW,
  };
  const events: CausalEvent[] = detectCausalEvents(causalInput);
  const forecast: NarrativeForecast = forecastNarrativeTrajectory({
    narrativeId,
    snapshots: snaps,
    evolution,
    now: FIXTURE_NOW,
  });
  return {
    narrativeId,
    snapshots: snaps,
    evolution,
    events,
    forecast,
    influenceOut: opts?.influenceOut,
    influenceIn: opts?.influenceIn,
    now: FIXTURE_NOW,
  };
}

/** Deterministic demo inputs — one per narrative story. */
export const DEMO_DECISION_INPUTS: DecisionInput[] = [
  buildInput('ai-surveillance', SURVEILLANCE_SNAPS, {
    influenceOut: SURVEILLANCE_INFLUENCE_OUT,
  }),
  buildInput('ai-ethics', ETHICS_SNAPS),
  buildInput('ai-regulation', REGULATION_SNAPS),
];

/** Cross-narrative targets for the ai-surveillance source. */
export const DEMO_CROSS_TARGETS: CrossNarrativeTarget[] = [
  {
    narrativeId: 'ai-ethics',
    snapshots: ETHICS_SNAPS,
    influenceFromSource: 78,
    sharedCommunities: 3,
    sharedSources: 3,
  },
  {
    narrativeId: 'ai-regulation',
    snapshots: REGULATION_SNAPS,
    influenceFromSource: 44,
    sharedCommunities: 3,
    sharedSources: 3,
  },
];

// ---- End-to-end demo --------------------------------------------------------

export interface DecisionDemoResult {
  now: string;
  sensitivity: SensitivityResult;
  rankings: InterventionRanking[];
  recommendation: Recommendation;
  decisionRun: DecisionRun;
  interventionSet: InterventionSetResult;
  /** A DECISIVE scenario battle (clear winner). */
  decisiveBattle: ScenarioBattleResult;
  /** A NEAR-TIE scenario battle. */
  closeBattle: ScenarioBattleResult;
  crossImpacts: CrossNarrativeImpact[];
  audit: DecisionAudit;
}

/**
 * Run the full decision chain over the fixtures:
 *   sensitivity → rankings → recommendation → decision run → intervention set →
 *   scenario battles (decisive + near-tie) → cross-narrative impact → audit.
 * Fully OFFLINE & DETERMINISTIC for offline UI/demo.
 */
export function decisionDemo(now: string = FIXTURE_NOW): DecisionDemoResult {
  const source = DEMO_DECISION_INPUTS[0];

  const sensitivity = runSensitivityAnalysis(source, now);
  const rankings = rankInterventions(source, now);
  const recommendation = generateRecommendations(source, now);
  const decisionRun = generateDecisionRun(source, now);
  const interventionSet = simulateInterventionSet(
    source,
    ['reduce_amplification', 'increase_contradiction'],
    now,
  );

  // Decisive: a credible single-lever dampener vs doing nothing (baseline).
  // The dampener moves the trajectory; the baseline does not → clear winner A.
  const decisiveBattle = compareScenarios(
    source,
    { name: 'Damp amplification', interventions: ['reduce_amplification'] },
    { name: 'Do nothing', interventions: [] },
    now,
  );

  // Near-tie: two single-lever plans that move the same dominant event by an
  // equal magnitude in opposite directions → indistinguishable on the objective.
  const closeBattle = compareScenarios(
    source,
    { name: 'Delay the spike', interventions: ['delay_event'] },
    { name: 'Accelerate the spike', interventions: ['accelerate_event'] },
    now,
  );

  const crossImpacts = computeCrossNarrativeImpact(source, DEMO_CROSS_TARGETS, now);
  const audit = buildDecisionAudit(decisionRun, now);

  return {
    now,
    sensitivity,
    rankings,
    recommendation,
    decisionRun,
    interventionSet,
    decisiveBattle,
    closeBattle,
    crossImpacts,
    audit,
  };
}
