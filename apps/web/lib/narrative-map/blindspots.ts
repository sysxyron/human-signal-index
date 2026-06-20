// =============================================================================
// HSI Phase 72 — Intelligence blind-spot detection (PURE, deterministic).
// A blind spot is an OBSERVABLE imbalance: narrative/forecast activity with no
// corroborating evidence. Computed from real counts only — no inference. No I/O.
// =============================================================================

import type { GeoMetrics, BlindSpot, BlindSpotSeverity } from './types';

/** Detect a blind spot from real activity counts. High narrative/forecast
 *  activity with zero evidence = a gap. Severity scales with the unsupported
 *  activity. Evidence present → never a blind spot. */
export function detectBlindSpot(m: Pick<GeoMetrics, 'narrativeCount' | 'forecastCount' | 'evidenceCount'>): BlindSpot {
  const reasons: string[] = [];
  if (m.evidenceCount > 0) return { isBlindSpot: false, severity: 'none', reasons: [] };

  if (m.narrativeCount > 0) reasons.push(`${m.narrativeCount} narrative(s) with no evidence`);
  if (m.forecastCount > 0) reasons.push(`${m.forecastCount} forecast(s) with no evidence`);
  if (reasons.length === 0) return { isBlindSpot: false, severity: 'none', reasons: [] };

  const unsupported = m.narrativeCount + m.forecastCount;
  let severity: BlindSpotSeverity;
  if (unsupported >= 5) severity = 'high';
  else if (unsupported >= 2) severity = 'medium';
  else severity = 'low';
  return { isBlindSpot: true, severity, reasons };
}

const RANK: Record<BlindSpotSeverity, number> = { none: 0, low: 1, medium: 2, high: 3 };
export function severityRank(s: BlindSpotSeverity): number { return RANK[s]; }
