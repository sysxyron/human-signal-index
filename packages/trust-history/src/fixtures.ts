// =============================================================================
// @hsi/trust-history — deterministic offline fixtures + end-to-end demo.
//
// Builds trust-history series that exercise every trend (improving / stable /
// degrading / volatile) and every drift kind (collapse / degradation /
// instability / over- / under-confidence / stable), plus a provenance example.
// `trustHistoryDemo()` runs the whole chain offline for UI demos. No Date.now /
// no Math.random anywhere.
// =============================================================================

import type { TrustEntityType } from '@hsi/calibration-engine';
import { recordTrustSnapshot } from './history';
import { computeTrustTrend } from './trend';
import { detectTrustDrift } from './drift';
import { buildTrustProvenance } from './provenance';
import type { TrustSnapshot } from './types';

/** Fixed clock for every fixture/demo output. */
export const FIXTURE_NOW = '2026-06-09T12:00:00.000Z';

/** Daily ISO timestamps starting at a fixed base (deterministic). */
export function isoDay(index: number): string {
  // 2026-03-01 + index days, all at 12:00 UTC.
  const base = Date.parse('2026-03-01T12:00:00.000Z');
  return new Date(base + index * 86_400_000).toISOString();
}

/** Build a snapshot series from a list of scores at consecutive days. */
export function seriesFromScores(
  entityType: TrustEntityType,
  entityId: string,
  scores: number[],
  calibration = 0.7,
): TrustSnapshot[] {
  return scores.map((score, i) =>
    recordTrustSnapshot(
      {
        entityType,
        entityId,
        trustScore: score,
        confidence: 0.6,
        calibrationScore: calibration,
        evidenceCount: 20 + i,
        id: `${entityId}-${i}`,
      },
      { now: isoDay(i) },
    ),
  );
}

/** An IMPROVING source: steady climb with low volatility. */
export const IMPROVING: TrustSnapshot[] = seriesFromScores(
  'source',
  'src-improving',
  [52, 56, 60, 64, 69, 73],
);

/** A STABLE narrative: holds roughly flat. */
export const STABLE: TrustSnapshot[] = seriesFromScores(
  'narrative',
  'narr-stable',
  [61, 60, 62, 61, 60, 61],
);

/** A DEGRADING decision: steady decline with low volatility. */
export const DEGRADING: TrustSnapshot[] = seriesFromScores(
  'decision',
  'dec-degrading',
  [78, 74, 70, 66, 62, 58],
);

/** A VOLATILE forecast: large swings, no clean direction. */
export const VOLATILE: TrustSnapshot[] = seriesFromScores(
  'forecast',
  'fc-volatile',
  [60, 80, 45, 78, 50, 72],
);

/** A COLLAPSING source: a sudden severe fall (high → low band). */
export const COLLAPSING: TrustSnapshot[] = seriesFromScores(
  'source',
  'src-collapse',
  [82, 80, 81, 79, 80, 35],
);

/**
 * An OVERCONFIDENT decision: trust sits high while calibration stays weak, so
 * trust outruns demonstrated reliability.
 */
export const OVERCONFIDENT: TrustSnapshot[] = seriesFromScores(
  'decision',
  'dec-overconfident',
  [80, 81, 80, 82, 81, 82],
  0.4, // calibration 40 → trust 82 outruns it by > 25
);

/**
 * An UNDERCONFIDENT source: calibration is strong but trust is suppressed.
 */
export const UNDERCONFIDENT: TrustSnapshot[] = seriesFromScores(
  'source',
  'src-underconfident',
  [45, 44, 46, 45, 44, 45],
  0.9, // calibration 90 vs trust 45 → underconfident by > 25
);

/** Every named history series, keyed for the demo. */
export const DEMO_SERIES: Record<string, TrustSnapshot[]> = {
  improving: IMPROVING,
  stable: STABLE,
  degrading: DEGRADING,
  volatile: VOLATILE,
  collapsing: COLLAPSING,
  overconfident: OVERCONFIDENT,
  underconfident: UNDERCONFIDENT,
};

/**
 * Run the full trust-history chain offline and return every output for a UI/demo:
 * history → trend → drift → provenance. Deterministic.
 */
export function trustHistoryDemo(): {
  now: string;
  trend: Record<string, ReturnType<typeof computeTrustTrend>>;
  drift: Record<string, ReturnType<typeof detectTrustDrift>>;
  provenance: ReturnType<typeof buildTrustProvenance>;
  series: Record<string, TrustSnapshot[]>;
} {
  const now = FIXTURE_NOW;

  const trend: Record<string, ReturnType<typeof computeTrustTrend>> = {};
  const drift: Record<string, ReturnType<typeof detectTrustDrift>> = {};
  for (const key of Object.keys(DEMO_SERIES)) {
    const series = DEMO_SERIES[key];
    trend[key] = computeTrustTrend(series);
    drift[key] = detectTrustDrift(series, { now });
  }

  const provenance = buildTrustProvenance(
    {
      entityType: 'source',
      entityId: 'src-improving',
      score: IMPROVING[IMPROVING.length - 1].trustScore,
      historicalAccuracy: 0.74,
      calibrationScore: 0.7,
      evidenceQuality: 0.68,
      governanceSignal: 0.82,
      evidenceCount: 26,
      history: IMPROVING.map((s) => ({ trustScore: s.trustScore, at: s.at })),
    },
    { now },
  );

  return { now, trend, drift, provenance, series: DEMO_SERIES };
}
