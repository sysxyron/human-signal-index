// =============================================================================
// NPS + cohort analytics + operational report windows (Deliverables 16, 20, 22, 23).
// PURE + DETERMINISTIC.
// =============================================================================

import type { CohortAnalytics, CohortAnalyticsInput, NpsResult, ReportPeriod } from './types';

const pct = (num: number, den: number): number => (den <= 0 ? 0 : Math.round((num / den) * 100));

/** NPS from 0..10 scores: promoters(9-10) − detractors(0-6), as −100..100. */
export function npsScore(scores: number[]): NpsResult {
  let promoters = 0; let passives = 0; let detractors = 0;
  for (const s of scores) {
    if (s >= 9) promoters++;
    else if (s >= 7) passives++;
    else detractors++;
  }
  const n = scores.length;
  const score = n === 0 ? 0 : Math.round(((promoters - detractors) / n) * 100);
  return { responses: n, promoters, passives, detractors, score };
}

/** Cohort analytics: activation / retention / completion / mission completion. */
export function cohortAnalytics(i: CohortAnalyticsInput): CohortAnalytics {
  const engaged = i.active + i.completed;
  return {
    activationRate: pct(engaged, i.total),
    retentionRate: pct(i.activeLastPeriod, engaged),
    completionRate: pct(i.completed, i.total),
    missionCompletionRate: pct(i.missionsCompleted, i.missionsAssigned),
  };
}

/** The window length (ms) for an operational report period. */
export function reportWindowMs(period: ReportPeriod): number {
  return ({ daily: 1, weekly: 7, monthly: 30 } as const)[period] * 86_400_000;
}

/** Count items whose ISO timestamp falls within [now − window, now]. PURE (now injected). */
export function countInWindow(timestamps: string[], period: ReportPeriod, nowMs: number): number {
  const since = nowMs - reportWindowMs(period);
  let n = 0;
  for (const t of timestamps) {
    const ms = Date.parse(t);
    if (!Number.isNaN(ms) && ms >= since && ms <= nowMs) n++;
  }
  return n;
}
