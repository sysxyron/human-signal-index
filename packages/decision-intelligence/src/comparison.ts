// =============================================================================
// @hsi/decision-intelligence — scenario war-gaming (A vs B).
//
// compareScenarios runs simulateInterventionSet for two scenarios, then scores
// each on a DOCUMENTED objective and declares a winner ('tie' within a small
// margin). The objective rewards a stronger, more confident effect in the
// INTENDED direction while penalising risk (set size) — i.e. "which plan moves
// the trajectory more, more reliably?"
//
//   scenarioScore = |signalDeltaPct| × confidence × forecastBonus
//                   − setSizePenalty
// where forecastBonus = 1.15 if the plan flips the forecast (decisive), else 1.0,
// and setSizePenalty = (#interventions − 1) × 2 (more moving parts = more fragile).
//
// Winner is whichever score is higher; 'tie' when |scoreA − scoreB| ≤ TIE_MARGIN.
// reasoning + limitations + per-scenario metrics always present. Never certainty.
// Deterministic; caller injects `now`.
// =============================================================================

import { simulateInterventionSet } from './decision';
import type {
  DecisionInput,
  InterventionSetResult,
  InterventionType,
  ScenarioBattleResult,
} from './types';

/** Score difference at/below which the battle is a 'tie'. */
export const TIE_MARGIN = 3;

function round(n: number, dp = 2): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

function scenarioScore(r: InterventionSetResult, setSize: number): number {
  const forecastBonus = r.deltas.forecastChanged ? 1.15 : 1.0;
  const setSizePenalty = Math.max(0, setSize - 1) * 2;
  return round(
    Math.abs(r.deltas.signalDeltaPct) * r.confidence * forecastBonus -
      setSizePenalty,
    2,
  );
}

function metricsOf(r: InterventionSetResult, score: number): Record<string, number> {
  return {
    score,
    confidence: round(r.confidence, 3),
    signalDeltaPct: r.deltas.signalDeltaPct,
    amplificationDelta: r.deltas.amplificationDelta,
    growthDeltaPct: r.deltas.growthDeltaPct,
    forecastChanged: r.deltas.forecastChanged ? 1 : 0,
    interventionCount: r.interventions.length,
  };
}

/**
 * War-game scenario A against scenario B. Deterministic; caller injects `now`.
 * Each scenario is a named set of interventions; we simulate both cumulatively
 * and pick the higher-scoring plan ('tie' within TIE_MARGIN).
 */
export function compareScenarios(
  input: DecisionInput,
  scenarioA: { name: string; interventions: InterventionType[] },
  scenarioB: { name: string; interventions: InterventionType[] },
  now: string,
): ScenarioBattleResult {
  const resA = simulateInterventionSet(input, scenarioA.interventions, now);
  const resB = simulateInterventionSet(input, scenarioB.interventions, now);

  const scoreA = scenarioScore(resA, scenarioA.interventions.length);
  const scoreB = scenarioScore(resB, scenarioB.interventions.length);

  let winner: 'A' | 'B' | 'tie';
  if (Math.abs(scoreA - scoreB) <= TIE_MARGIN) winner = 'tie';
  else winner = scoreA > scoreB ? 'A' : 'B';

  // Confidence in the VERDICT: lower of the two scenario confidences, scaled by
  // how decisive the margin is (a near-tie is a low-confidence verdict).
  const minConf = Math.min(resA.confidence, resB.confidence);
  const margin = Math.abs(scoreA - scoreB);
  const decisiveness = winner === 'tie' ? 0.6 : Math.min(1, 0.6 + margin / 50);
  const confidence = round(Math.min(0.9, minConf * decisiveness), 3);

  const reasoning: string[] = [];
  reasoning.push(
    `Scenario A "${scenarioA.name}" [${scenarioA.interventions.join(', ') || 'baseline'}] scored ${scoreA}; ` +
      `Scenario B "${scenarioB.name}" [${scenarioB.interventions.join(', ') || 'baseline'}] scored ${scoreB}.`,
  );
  reasoning.push(`A: ${resA.outcome}`);
  reasoning.push(`B: ${resB.outcome}`);
  if (winner === 'tie') {
    reasoning.push(
      `Margin ${round(margin, 2)} ≤ tie threshold ${TIE_MARGIN} — the two plans are effectively indistinguishable on this evidence.`,
    );
  } else {
    const win = winner === 'A' ? scenarioA : scenarioB;
    reasoning.push(
      `Winner: Scenario ${winner} "${win.name}" — it moves the trajectory more reliably (margin ${round(margin, 2)} > ${TIE_MARGIN}).`,
    );
  }

  const limitations: string[] = [
    'War-gaming compares heuristic re-propagations, not real outcomes — the winner is the better ESTIMATE, never a certainty.',
    `Verdict confidence is bounded by the weaker scenario (${round(minConf, 3)}) and the decisiveness of the margin.`,
    ...resA.limitations.slice(1, 2),
    ...resB.limitations.slice(1, 2),
  ];

  return {
    scenarioA,
    scenarioB,
    winner,
    confidence,
    reasoning,
    limitations,
    metrics: {
      a: metricsOf(resA, scoreA),
      b: metricsOf(resB, scoreB),
    },
  };
}
