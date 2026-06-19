// =============================================================================
// HSI Phase 63 — Monitoring policy (PURE). Stale windows by source type, the
// reliability band ladder, COMPUTED severity functions (derived from ratios /
// band transitions — no single magic threshold), and explainable trend analysis.
// PURE: no I/O, no clocks.
// =============================================================================

// Relative import for the VALUE (scoreTier) so this module — reached by the pure
// unit tests — resolves regardless of the test runner's cwd. (Type-only `@/`
// imports elsewhere are erased at compile time and don't need this.)
import { scoreTier, type ScoreTier, type SourceTypeBucket } from '../source-reliability-classify';
import type { MonitorSeverity, ReliabilityTrend, SourceSignal } from './types';

/** Stale policy windows per source type (Deliverable 5). Days + a human label. */
export const STALE_POLICY: Record<SourceTypeBucket, { days: number; label: string }> = {
  RSS: { days: 1, label: '24h' },
  Reddit: { days: 1, label: '24h' },
  Social: { days: 1, label: '24h' },
  Website: { days: 2, label: '48h' },
  API: { days: 2, label: '48h' },
  Government: { days: 3, label: '72h' },
  Forum: { days: 3, label: '72h' },
  YouTube: { days: 3, label: '72h' },
  Research: { days: 7, label: '7d' },
  Podcast: { days: 14, label: '14d' },
  Other: { days: 3, label: '72h' },
};

export function stalePolicy(type: SourceTypeBucket): { days: number; label: string } {
  return STALE_POLICY[type] ?? STALE_POLICY.Other;
}

/** Reliability band ladder (from the Phase 61 score tiers). */
export const BAND_RANK: Record<ScoreTier, number> = { Excellent: 4, Healthy: 3, 'At Risk': 2, Failing: 1 };
export function bandRank(tier: ScoreTier): number { return BAND_RANK[tier] ?? 0; }
export function bandForScore(score: number): ScoreTier { return scoreTier(score); }

// ---- computed severities (explainable; ratio / band based) ------------------

/** A newly-failed/unreachable source: CRITICAL when fully dead or persistently
 *  failing, otherwise WARNING. Derived from the score + consecutive-failure run. */
export function severityForFailure(s: Pick<SourceSignal, 'score' | 'consecutiveFailures'>): MonitorSeverity {
  if (s.score === 0 || s.consecutiveFailures >= 5) return 'CRITICAL';
  return 'WARNING';
}

/** A blocked source (anti-bot / login wall): WARNING, escalating to CRITICAL only
 *  when collection is fully dead. HSI reports protection; it never bypasses it. */
export function severityForBlocked(s: Pick<SourceSignal, 'score'>): MonitorSeverity {
  return s.score === 0 ? 'CRITICAL' : 'WARNING';
}

/** Stale severity from how far past the policy window the source is (ratio). */
export function severityForStale(daysStale: number, policyDays: number): MonitorSeverity {
  const ratio = policyDays > 0 ? daysStale / policyDays : daysStale;
  if (ratio >= 4) return 'CRITICAL';
  if (ratio >= 2) return 'WARNING';
  return 'NOTICE';
}

/** A collection gap (no capture attempts in the window) for a previously-active source. */
export function severityForGap(): MonitorSeverity { return 'WARNING'; }

/** Reliability regression severity from how many bands the score dropped. */
export function severityForRegression(bandsDropped: number): MonitorSeverity {
  if (bandsDropped >= 3) return 'CRITICAL';
  if (bandsDropped === 2) return 'WARNING';
  return 'NOTICE';
}

/** Recovery is good news — informational. */
export function severityForRecovery(): MonitorSeverity { return 'NOTICE'; }

// ---- reliability trend (Deliverable 6) -------------------------------------

/** Average-of-halves with a deadband, so noise reads as "Stable" not a fake line.
 *  <3 data points → "Insufficient Data" (never a fabricated trend). */
export const TREND_DEADBAND = 3; // points; an average move smaller than this is noise

export interface TrendResult { trend: ReliabilityTrend; detail: string }

export function reliabilityTrend(scores: number[]): TrendResult {
  const pts = scores.filter((n) => typeof n === 'number' && !Number.isNaN(n));
  if (pts.length < 3) {
    return { trend: 'Insufficient Data', detail: `Only ${pts.length} score point(s) recorded — need ≥3 to assess a trend.` };
  }
  const mid = Math.floor(pts.length / 2);
  const older = pts.slice(0, mid);
  const recent = pts.slice(pts.length - mid);
  const avg = (xs: number[]) => Math.round((xs.reduce((a, x) => a + x, 0) / xs.length) * 10) / 10;
  const a = avg(older);
  const b = avg(recent);
  const delta = Math.round((b - a) * 10) / 10;
  if (Math.abs(delta) < TREND_DEADBAND) return { trend: 'Stable', detail: `Recent avg ${b} vs earlier ${a} (Δ${delta}); within ±${TREND_DEADBAND}.` };
  return delta > 0
    ? { trend: 'Improving', detail: `Recent avg ${b} vs earlier ${a} (Δ+${delta}).` }
    : { trend: 'Declining', detail: `Recent avg ${b} vs earlier ${a} (Δ${delta}).` };
}
