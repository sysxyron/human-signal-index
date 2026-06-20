// =============================================================================
// HSI Phase 70.4 — Signal influence metrics (PURE, deterministic). Shapes REAL
// counts (from graph edges, narrative memberships, forecasts) into reach /
// activity / supporting-evidence / downstream-usage. No weighted trust formulas,
// no AI scoring — every number is a traceable count. No I/O.
// =============================================================================

import type { InfluenceCounts, InfluenceSummary, AttributionFlags } from './types';

export const EMPTY_INFLUENCE: InfluenceCounts = {
  evidenceCount: 0, reportCount: 0, narrativeCount: 0, forecastCount: 0, relationshipCount: 0,
  supportsCount: 0, contradictsCount: 0, referencesCount: 0, derivedFromCount: 0, relatedToCount: 0,
  distinctConnectedNodes: 0, recentActivity: 0,
};

/** Compose real counts into a display summary. No weighting — sums of records. */
export function summarizeInfluence(counts: InfluenceCounts): InfluenceSummary {
  const downstreamUsage = counts.reportCount + counts.forecastCount + counts.narrativeCount;
  const observed = counts.relationshipCount > 0 || counts.narrativeCount > 0;
  return {
    ...counts,
    reach: counts.distinctConnectedNodes,
    activity: counts.recentActivity,
    supportingEvidence: counts.supportsCount,
    downstreamUsage,
    observed,
  };
}

/** A single comparable rank key — purely the sum of downstream usage + reach +
 *  evidence. Deterministic, no hidden weights. */
export function influenceRank(s: InfluenceSummary): number {
  return s.downstreamUsage + s.reach + s.evidenceCount;
}

/** Phase 71 readiness flags from real attribution. */
export function attributionFlags(input: { sourceId: string | null; narrativeCount: number; forecastCount: number; relationshipCount: number; evidenceCount: number; hasGeo: boolean }): AttributionFlags {
  return {
    hasSourceLineage: !!input.sourceId,
    hasNarrative: input.narrativeCount > 0,
    hasForecast: input.forecastCount > 0,
    hasRelationship: input.relationshipCount > 0,
    hasEvidence: input.evidenceCount > 0,
    hasGeo: input.hasGeo,
  };
}
