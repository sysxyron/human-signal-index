// =============================================================================
// @hsi/decision-intelligence — strategic recommendation.
//
// generateRecommendations chooses "what should we do next?" from the ranked
// interventions + sensitivity + forecast. It applies DOCUMENTED thresholds:
//
//   * If the best intervention clears BOTH the confidence floor (MIN_CONFIDENCE)
//     and the effect floor (MIN_ABS_EFFECT) and is not too risky → recommend it
//     (decisionType 'intervention').
//   * If the best intervention is high-risk (riskScore ≥ HIGH_RISK) AND the
//     narrative is on a rising/strong trajectory → 'escalate' (hand to a human /
//     raise the alarm rather than act blindly).
//   * If a credible dampening intervention exists but the narrative is rising and
//     adversarial (high amplification, low reliability) → 'counter_narrative'.
//   * If nothing clears the floors but the narrative is moving → 'monitor'.
//   * Otherwise → 'no_action'.
//
// Confidence is CALIBRATED via input.calibration?.calibrate when provided (pulls
// overconfident bands DOWN, so calibrated ≤ raw). Reasoning, limitations, and
// evidence are ALWAYS present. Never certainty. Deterministic.
// =============================================================================

import type { ConfidenceBand } from '@hsi/counterfactual-engine';

import { rankInterventions } from './ranking';
import { runSensitivityAnalysis, eventTypeLabel } from './sensitivity';
import type {
  DecisionInput,
  DecisionType,
  InterventionRanking,
  Recommendation,
} from './types';

// ---- Documented thresholds --------------------------------------------------
/** A recommendable intervention needs at least this confidence. */
export const MIN_CONFIDENCE = 0.4;
/** A recommendable intervention needs at least this |expectedEffect|. */
export const MIN_ABS_EFFECT = 5;
/** riskScore ≥ this is "high risk" → prefer escalation over blind action. */
export const HIGH_RISK = 70;
/** Confidence ≥ this → 'high'; ≥ REC_MEDIUM_BAND → 'medium'; else 'low'. */
export const REC_HIGH_BAND = 0.66;
export const REC_MEDIUM_BAND = 0.4;

function bandOf(confidence: number): ConfidenceBand {
  if (confidence >= REC_HIGH_BAND) return 'high';
  if (confidence >= REC_MEDIUM_BAND) return 'medium';
  return 'low';
}

function round(n: number, dp = 2): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

/** Final-snapshot read of trajectory posture (rising / adversarial). */
function posture(input: DecisionInput): {
  rising: boolean;
  adversarial: boolean;
  ampScore: number;
  reliability: number;
  forecastState?: string;
} {
  const snaps = [...input.snapshots].sort(
    (a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt),
  );
  const last = snaps[snaps.length - 1];
  const ampScore = last?.amplificationScore ?? 0;
  const reliability = last?.reliabilityScore ?? 50;
  const fs = input.forecast?.forecastType;
  const rising =
    fs === 'rising' || fs === 'emerging' || (ampScore >= 60 && fs !== 'declining' && fs !== 'dead');
  const adversarial = ampScore >= 60 && reliability < 55;
  return { rising, adversarial, ampScore, reliability, forecastState: fs };
}

/**
 * Generate the strategic recommendation for a narrative. Deterministic; caller
 * injects `now`. Confidence is calibrated when a calibration model is supplied.
 */
export function generateRecommendations(
  input: DecisionInput,
  now: string,
): Recommendation {
  const rankings = rankInterventions(input, now);
  const sensitivity = runSensitivityAnalysis(input, now);
  const best: InterventionRanking | undefined = rankings[0];
  const p = posture(input);

  const reasoning: string[] = [];
  const limitations: string[] = [];
  const evidence: string[] = [];

  // ---- Evidence: dominant cause + the top candidate. ------------------------
  if (sensitivity.dominant) {
    evidence.push(
      `Dominant cause: ${eventTypeLabel(sensitivity.dominant.eventType)} (${sensitivity.dominant.sharePct}% of change).`,
    );
  }
  if (input.forecast) {
    evidence.push(
      `Forecast: ${input.forecast.forecastType} @ ${Math.round(input.forecast.probability * 100)}%.`,
    );
  }
  if (best) {
    evidence.push(
      `Top-ranked candidate: ${best.interventionType} (effect ${best.expectedEffect >= 0 ? '+' : ''}${best.expectedEffect}, risk ${best.riskScore}, conf ${Math.round(best.confidence * 100)}%).`,
    );
  }

  // ---- Decision logic (documented thresholds). ------------------------------
  let decisionType: DecisionType;
  let recommendedAction: string;
  let rawConfidence: number;
  let expectedEffect: number;

  const clears =
    best !== undefined &&
    best.confidence >= MIN_CONFIDENCE &&
    Math.abs(best.expectedEffect) >= MIN_ABS_EFFECT;
  // The best available lever has a meaningful effect but is HIGH RISK — acting
  // unilaterally is unwise; escalation to a human takes precedence over both
  // intervening blindly and merely monitoring.
  const highRiskBest =
    best !== undefined &&
    Math.abs(best.expectedEffect) >= MIN_ABS_EFFECT &&
    best.riskScore >= HIGH_RISK;

  if (best && highRiskBest && p.rising) {
    // High-risk best option on a rising narrative → escalate to a human.
    decisionType = 'escalate';
    recommendedAction = `Escalate: ${best.interventionType} could ${best.expectedEffect < 0 ? 'dampen' : 'amplify'} a rising narrative but carries high risk (${best.riskScore}/100) — escalate for human review before acting.`;
    rawConfidence = best.confidence;
    expectedEffect = best.expectedEffect;
    reasoning.push(
      `Best available intervention has a meaningful effect (|${best.expectedEffect}| ≥ ${MIN_ABS_EFFECT}) but risk ${best.riskScore} ≥ ${HIGH_RISK} on a rising trajectory — escalate rather than act blindly.`,
    );
  } else if (
    best &&
    clears &&
    best.expectedEffect < 0 &&
    p.rising &&
    p.adversarial
  ) {
    // A credible dampener on a rising, adversarial narrative → counter-narrative.
    decisionType = 'counter_narrative';
    recommendedAction = `Deploy counter-narrative alongside ${best.interventionType}: the narrative is rising under high amplification (${p.ampScore}) with low reliability (${p.reliability}); a dampening intervention plus a counter-narrative is the highest-probability response.`;
    rawConfidence = best.confidence;
    expectedEffect = best.expectedEffect;
    reasoning.push(
      `Rising + adversarial posture (amp ${p.ampScore}, reliability ${p.reliability}) with a credible dampening intervention available → counter-narrative.`,
    );
  } else if (best && clears) {
    decisionType = 'intervention';
    recommendedAction = `Apply ${best.interventionType}: estimated to ${best.expectedEffect < 0 ? 'dampen' : 'amplify'} the trajectory (effect ${best.expectedEffect >= 0 ? '+' : ''}${best.expectedEffect}) at acceptable risk (${best.riskScore}/100).`;
    rawConfidence = best.confidence;
    expectedEffect = best.expectedEffect;
    reasoning.push(
      `Best intervention "${best.interventionType}" clears the confidence floor (${best.confidence} ≥ ${MIN_CONFIDENCE}) and effect floor (|${best.expectedEffect}| ≥ ${MIN_ABS_EFFECT}) at risk ${best.riskScore} < ${HIGH_RISK}.`,
    );
  } else if (p.rising || p.forecastState === 'declining') {
    decisionType = 'monitor';
    recommendedAction =
      'Monitor: no intervention clears the confidence/effect thresholds, but the narrative is actively moving — keep watching and re-evaluate as new snapshots arrive.';
    rawConfidence = best ? Math.max(0.35, best.confidence * 0.9) : 0.35;
    expectedEffect = best ? best.expectedEffect : 0;
    reasoning.push(
      best
        ? `Best candidate "${best.interventionType}" falls short of the floors (conf ${best.confidence}, effect ${best.expectedEffect}); narrative is moving → monitor.`
        : 'No ranked interventions; narrative is moving → monitor.',
    );
  } else {
    decisionType = 'no_action';
    recommendedAction =
      'No action: no intervention clears the thresholds and the narrative is not on a notable trajectory — acting now is not justified by the evidence.';
    rawConfidence = best ? Math.max(0.3, best.confidence * 0.85) : 0.3;
    expectedEffect = best ? best.expectedEffect : 0;
    reasoning.push(
      'No intervention clears the thresholds and the trajectory is flat/dead → no action is the honest call.',
    );
  }

  reasoning.push(...sensitivity.reasoning.slice(0, 2));

  // ---- Calibrate confidence (pull overconfident bands DOWN). ----------------
  let confidence = round(Math.min(0.9, rawConfidence), 3);
  if (input.calibration) {
    const out = input.calibration.calibrate(rawConfidence);
    confidence = round(out.calibrated, 3);
    reasoning.push(
      `Confidence calibrated ${round(rawConfidence, 3)} → ${confidence} (overconfident bands pulled down by the calibration model).`,
    );
  }
  const confidenceBand = bandOf(confidence);

  // ---- Limitations (ALWAYS present). ----------------------------------------
  limitations.push(
    'This recommendation is a DECISION AID built from heuristic counterfactual estimates, not a guarantee of outcome.',
  );
  limitations.push(
    `${sensitivity.unexplainedPct}% of the observed change is unexplained by detected events — unmodeled factors may dominate.`,
  );
  if (decisionType === 'intervention' && best) {
    limitations.push(
      `The estimated effect (${best.expectedEffect}) assumes the re-propagation model holds; real-world feedback loops may differ.`,
    );
  }
  if (!best) {
    limitations.push('No interventions could be ranked — recommendation rests on trajectory posture alone.');
  }
  if (evidence.length === 0) {
    evidence.push('No dominant cause, forecast, or ranked candidate was available.');
  }

  return {
    recommendedAction,
    decisionType,
    expectedEffect,
    confidence,
    confidenceBand,
    reasoning,
    limitations,
    evidence,
  };
}
