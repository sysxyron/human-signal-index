// =============================================================================
// @hsi/simulation-engine — Simulation Evaluator
// evaluateWorld(state) derives a structured report ENTIRELY from state (via its
// graph). This is the "Report is an output of State" piece: every field carries
// provenance + confidence and is traceable back to the nodes it came from.
// =============================================================================

import { buildDependencyGraph, N } from '../graph/builder';
import { indexGraph } from '../graph/types';
import { resolveAll, nodeValue } from './propagation';
import { getUniverse, buildProvenance, type Provenance, type WorldState } from '@hsi/world-models';
import {
  computeTemporalAdaptation,
  type TemporalAdaptation,
  ENVIRONMENT_RATES,
} from './temporal-niche';
import { explainNode } from '../provenance/explain';
import type { SimulationGraph } from '../graph/types';

/** A single scored metric with provenance. */
export interface ScoredMetric {
  /** 0..1 score (or 0..100 where noted). */
  value: number;
  provenance: Provenance;
}

/** A ranked risk entry. */
export interface RankedRisk {
  name: string;
  /** 0..1 severity. */
  severity: number;
  reason: string;
}

/** The derived world report. */
export interface WorldEvaluation {
  worldId: string;
  worldName: string;
  habitability: ScoredMetric;
  lifePlausibility: ScoredMetric;
  intelligencePlausibility: ScoredMetric;
  civilizationPlausibility: ScoredMetric;
  topRisks: RankedRisk[];
  temporalAdaptation: TemporalAdaptation;
  /** Overall 0..100 viability score. */
  overallScore: number;
  /** Human-readable summary. */
  summary: string;
  provenance: Provenance;
}

function metric(graph: SimulationGraph, nodeId: string): ScoredMetric {
  const ex = explainNode(graph, nodeId);
  const node = graph.nodes.find((n) => n.id === nodeId);
  return {
    value: nodeValue(graph, nodeId),
    provenance: buildProvenance({
      reason: ex.summary,
      dependsOn: ex.chain.map((c) => c.id),
      confidence: node?.provenance.confidence ?? 0.5,
      scientificConfidence:
        node?.provenance.scientificConfidence ?? { tier: 'speculative', confidence: 0.4, color: 'amber-500', reason: 'unknown node' },
    }),
  };
}

/** Evaluate a world into a structured, fully-provenanced report. */
export function evaluateWorld(state: WorldState): WorldEvaluation {
  const universe = getUniverse(state.universeType);
  const graph = buildDependencyGraph(state, universe);
  resolveAll(graph, indexGraph(graph));

  const habitability = metric(graph, N.habitability);
  const lifePlausibility = metric(graph, N.lifePlausibility);
  const intelligencePlausibility = metric(graph, N.intelligence);
  // Civilization plausibility = technology gate (normalized 0..1) × presence.
  const techNorm = nodeValue(graph, N.technology);
  const civilizationPlausibility: ScoredMetric = {
    value: techNorm * (state.civilization.present ? 1 : 0.3),
    provenance: buildProvenance({
      reason: explainNode(graph, N.technology).summary,
      dependsOn: [N.technology, N.intelligence, N.mathematics],
      scientificConfidence: graph.nodes.find((n) => n.id === N.technology)!.provenance.scientificConfidence,
    }),
  };

  const topRisks = rankRisks(graph, state);

  // Temporal adaptation: match cognition to the climatic regime by default; this
  // is the WorldForge twist surfaced in the report.
  const temporalAdaptation = computeTemporalAdaptation({
    cognitiveRateHz: state.intelligence.cognitiveRateHz,
    environmentalChangeRate: ENVIRONMENT_RATES.climatic,
  });

  const overallScore = Math.round(
    (0.3 * habitability.value +
      0.2 * lifePlausibility.value +
      0.15 * intelligencePlausibility.value +
      0.15 * civilizationPlausibility.value +
      0.1 * (1 - nodeValue(graph, N.extinction)) +
      0.1 * (temporalAdaptation.score / 100)) *
      100,
  );

  const summary = buildSummary(state, {
    habitability: habitability.value,
    life: lifePlausibility.value,
    intel: intelligencePlausibility.value,
    civ: civilizationPlausibility.value,
    extinction: nodeValue(graph, N.extinction),
    overall: overallScore,
    temporal: temporalAdaptation,
  });

  return {
    worldId: state.id,
    worldName: state.name,
    habitability,
    lifePlausibility,
    intelligencePlausibility,
    civilizationPlausibility,
    topRisks,
    temporalAdaptation,
    overallScore,
    summary,
    provenance: buildProvenance({
      reason: 'World evaluation derived entirely from world state via its simulation graph.',
      dependsOn: [N.habitability, N.lifePlausibility, N.intelligence, N.technology, N.extinction],
      confidence: 0.75,
      scientificConfidence: { tier: 'plausible-science', confidence: 0.72, color: 'lime-500', reason: 'Composite model of known and plausible science.' },
    }),
  };
}

function rankRisks(graph: SimulationGraph, state: WorldState): RankedRisk[] {
  const risks: RankedRisk[] = [
    { name: 'Extinction (aggregate)', severity: nodeValue(graph, N.extinction), reason: 'Composite of climate, impacts, self-destruction and stellar decline.' },
    { name: 'Climate instability', severity: state.risks.climateInstability, reason: 'Declared climate volatility.' },
    { name: 'Self-destruction', severity: state.risks.selfDestructionRisk, reason: 'Civilizational self-harm potential.' },
    { name: 'Asteroid exposure', severity: state.risks.asteroidExposure, reason: 'Impact frequency / exposure.' },
    { name: 'Stellar decline', severity: nodeValue(graph, N.stellarRisk), reason: 'Pressure from remaining stellar lifetime.' },
  ];
  return risks.sort((a, b) => b.severity - a.severity).slice(0, 3);
}

function buildSummary(
  state: WorldState,
  s: { habitability: number; life: number; intel: number; civ: number; extinction: number; overall: number; temporal: TemporalAdaptation },
): string {
  const pct = (x: number): string => `${Math.round(x * 100)}%`;
  const verdict = s.overall > 70 ? 'highly viable' : s.overall > 45 ? 'marginally viable' : 'inhospitable';
  return (
    `${state.name} is ${verdict} (overall ${s.overall}/100). ` +
    `Habitability ${pct(s.habitability)}; life plausibility ${pct(s.life)}; ` +
    `intelligence plausibility ${pct(s.intel)}; civilization plausibility ${pct(s.civ)}. ` +
    `Aggregate extinction risk ${pct(s.extinction)}. ` +
    `Temporal niche: ${s.temporal.label} (${s.temporal.score}/100) — ${s.temporal.explanation}`
  );
}
