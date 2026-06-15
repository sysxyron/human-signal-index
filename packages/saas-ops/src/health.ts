// =============================================================================
// Subscription health engine — PURE. Scores account health from active users,
// usage trend, login recency, and content/investigation/publication activity.
// Higher score = healthier. Deterministic; no clocks.
// =============================================================================

import type { HealthAssessment, HealthFactors, HealthStatus } from './types';

/** Compute subscription health (0..100 → healthy/warning/at-risk) + reasons. PURE. */
export function computeSubscriptionHealth(f: HealthFactors): HealthAssessment {
  let score = 0;
  const reasons: string[] = [];

  // Active users (up to 25 pts; saturates at 10).
  const userPts = Math.min(25, Math.round((Math.max(0, f.activeUsers) / 10) * 25));
  score += userPts;
  if (f.activeUsers === 0) reasons.push('No active users');

  // Login recency (up to 20 pts; full credit ≤3 days, none ≥30).
  const loginPts = f.daysSinceLogin <= 3 ? 20 : f.daysSinceLogin >= 30 ? 0 : Math.round((1 - (f.daysSinceLogin - 3) / 27) * 20);
  score += loginPts;
  if (f.daysSinceLogin >= 14) reasons.push(`${f.daysSinceLogin} days since login`);

  // Usage trend (up to 20 pts; positive trend adds, negative subtracts).
  if (f.usageTrend >= 0) score += Math.min(20, Math.round(f.usageTrend * 20) + 10);
  else { score += Math.max(0, 10 + Math.round(f.usageTrend * 20)); reasons.push('Declining usage'); }

  // Content + activity (up to 35 pts combined).
  const contentPts = Math.min(15, f.contentCreated);
  const invPts = Math.min(10, f.investigationActivity * 2);
  const pubPts = Math.min(10, f.publicationActivity * 2);
  score += contentPts + invPts + pubPts;
  if (f.contentCreated === 0 && f.investigationActivity === 0 && f.publicationActivity === 0) reasons.push('No recent content or activity');

  score = Math.max(0, Math.min(100, score));
  const status: HealthStatus = score >= 65 ? 'healthy' : score >= 40 ? 'warning' : 'at-risk';
  if (reasons.length === 0) reasons.push('Strong engagement across the board');
  return { status, score, reasons };
}
