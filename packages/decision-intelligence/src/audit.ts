// =============================================================================
// @hsi/decision-intelligence — explainable audit trail.
//
// buildDecisionAudit turns a DecisionRun into a complete, step-by-step audit so a
// HUMAN can trace EXACTLY how the recommendation was reached: the sensitivity
// analysis, the ranking, and the final recommendation, each with its confidence
// and limitations. No black-box — every step is logged with a data-grounded
// detail string. Deterministic; caller injects `now`.
// =============================================================================

import type { DecisionAudit, DecisionRun } from './types';

/**
 * Build an explainable audit trail for a decision run. Deterministic; caller
 * injects `now`. Every step (sensitivity → ranking → recommendation) is logged.
 */
export function buildDecisionAudit(run: DecisionRun, now: string): DecisionAudit {
  const auditLog: { step: string; detail: string; at: string }[] = [];

  // ---- Step 1: sensitivity. -------------------------------------------------
  const dom = run.sensitivity.dominant;
  auditLog.push({
    step: 'sensitivity',
    detail:
      (dom
        ? `Dominant cause ${dom.eventType} at ${dom.sharePct}% of the observed change. `
        : 'No dominant cause detected. ') +
      `${run.sensitivity.contributions.length} contribution(s); ${run.sensitivity.unexplainedPct}% unexplained (residual retained).`,
    at: now,
  });

  // ---- Step 2: ranking. -----------------------------------------------------
  const top = run.rankings[0];
  auditLog.push({
    step: 'ranking',
    detail:
      `Ranked ${run.rankings.length} candidate intervention(s) by (|effect| × confidence ÷ risk). ` +
      (top
        ? `Top: ${top.interventionType} (effect ${top.expectedEffect >= 0 ? '+' : ''}${top.expectedEffect}, risk ${top.riskScore}/100, confidence ${Math.round(top.confidence * 100)}%).`
        : 'No interventions ranked.'),
    at: now,
  });

  // ---- Step 3: recommendation. ----------------------------------------------
  const rec = run.recommendation;
  auditLog.push({
    step: 'recommendation',
    detail:
      `Decision "${rec.decisionType}": ${rec.recommendedAction} ` +
      `Confidence ${Math.round(rec.confidence * 100)}% (${rec.confidenceBand}). ` +
      `Reasoning: ${rec.reasoning.join(' | ')}`,
    at: now,
  });

  // ---- Step 4: limitations roll-up (explicit, never hidden). ----------------
  const limitations = Array.from(
    new Set([...run.limitations, ...run.recommendation.limitations]),
  );
  auditLog.push({
    step: 'limitations',
    detail: limitations.join(' | '),
    at: now,
  });

  const decisionOutput: Record<string, unknown> = {
    narrativeId: run.narrativeId,
    decisionName: run.decisionName,
    decisionType: run.decisionType,
    recommendedAction: run.recommendedAction,
    confidence: run.confidence,
    expectedEffect: run.recommendation.expectedEffect,
    dominantCause: dom?.eventType,
    topIntervention: top?.interventionType,
    rankingCount: run.rankings.length,
    unexplainedPct: run.sensitivity.unexplainedPct,
  };

  return {
    decisionRunId: `${run.narrativeId}@${run.generatedAt}`,
    decisionOutput,
    confidence: run.confidence,
    limitations,
    auditLog,
  };
}
