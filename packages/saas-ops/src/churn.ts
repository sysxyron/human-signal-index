// =============================================================================
// Churn risk engine — PURE. Scores a subscription's churn likelihood from usage
// trend, inactivity, payment failures, and expiring trials. Deterministic; no
// clocks (callers pass the factors).
// =============================================================================

import type { ChurnAssessment, ChurnFactors, ChurnRisk } from './types';

/** Compute churn risk (0..100 score → low/medium/high) + reasons. PURE. */
export function computeChurnRisk(f: ChurnFactors): ChurnAssessment {
  let score = 0;
  const reasons: string[] = [];

  // Declining usage (up to 35 pts at -100%).
  if (f.usageTrend < 0) {
    const pts = Math.min(35, Math.round(Math.abs(f.usageTrend) * 35));
    if (pts > 0) { score += pts; reasons.push(`Usage down ${Math.round(Math.abs(f.usageTrend) * 100)}%`); }
  }
  // Inactivity (up to 30 pts; ramps over 30 days).
  if (f.daysSinceActivity > 7) {
    const pts = Math.min(30, Math.round(((f.daysSinceActivity - 7) / 23) * 30));
    if (pts > 0) { score += pts; reasons.push(`${f.daysSinceActivity} days since activity`); }
  }
  // Payment failures (15 pts each, capped 30).
  if (f.paymentFailures > 0) {
    const pts = Math.min(30, f.paymentFailures * 15);
    score += pts; reasons.push(`${f.paymentFailures} payment failure(s)`);
  }
  // Expiring trial (15 pts when ≤3 days remain).
  if (f.isTrialing && f.trialDaysRemaining > 0 && f.trialDaysRemaining <= 3) {
    score += 15; reasons.push(`Trial ends in ${f.trialDaysRemaining} day(s)`);
  }

  score = Math.max(0, Math.min(100, score));
  const risk: ChurnRisk = score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low';
  if (reasons.length === 0) reasons.push('Healthy engagement');
  return { risk, score, reasons };
}

/** Aggregate churn rate over a set of assessments (high-risk share). PURE. */
export function churnRate(assessments: ChurnAssessment[]): number {
  if (assessments.length === 0) return 0;
  const high = assessments.filter((a) => a.risk === 'high').length;
  return high / assessments.length;
}
