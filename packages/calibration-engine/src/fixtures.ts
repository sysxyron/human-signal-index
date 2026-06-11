// =============================================================================
// @hsi/calibration-engine — deterministic offline fixtures + end-to-end demo.
//
// Builds a large-ish, FULLY DETERMINISTIC prediction set (no Date.now / no
// Math.random) covering a well-calibrated cohort, an overconfident cohort, and
// an underconfident cohort, plus trust inputs and a prior/current curve pair
// per drift kind. `calibrationDemo()` runs the whole chain offline for UI demos.
// =============================================================================

import { brierByKind, computeBrierScore } from './brier';
import {
  calibrate,
  confidenceMeaning,
} from './calibration';
import { detectConfidenceDrift, driftSeverity } from './drift';
import { computeReliabilityCurve, reliabilityByKind } from './reliability';
import {
  computeTrustScore,
  decisionTrust,
  forecastTrust,
  narrativeTrust,
  sourceTrust,
} from './trust';
import type {
  Prediction,
  ReliabilityCurve,
  TrustInputs,
} from './types';

/** Fixed clock for every fixture/demo output. */
export const FIXTURE_NOW = '2026-06-09T12:00:00.000Z';

const KINDS: Prediction['kind'][] = [
  'recommendation',
  'forecast',
  'intervention',
  'narrative',
];

/**
 * Build `count` predictions whose stated confidence sits at `confidence` and
 * whose observed success rate equals `successRate` EXACTLY (deterministically):
 * the first round(count*successRate) are successes, the rest failures.
 */
function cohort(
  prefix: string,
  count: number,
  confidence: number,
  successRate: number,
  kind: Prediction['kind'],
): Prediction[] {
  const successes = Math.round(count * successRate);
  const out: Prediction[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      id: `${prefix}-${i}`,
      kind,
      confidence,
      success: i < successes ? 1 : 0,
      at: FIXTURE_NOW,
      entityId: `${prefix}-entity`,
      sourceId: `${prefix}-source`,
    });
  }
  return out;
}

/**
 * A WELL-CALIBRATED set: each confidence band succeeds at (almost) its stated
 * rate, so per-bin error ≈ 0 and ECE is small. Bins 0.3..0.9 are populated.
 */
export const WELL_CALIBRATED: Prediction[] = [
  ...cohort('wc30', 20, 0.3, 0.3, 'forecast'),
  ...cohort('wc50', 20, 0.5, 0.5, 'forecast'),
  ...cohort('wc70', 20, 0.7, 0.7, 'recommendation'),
  ...cohort('wc82', 22, 0.82, 0.818, 'recommendation'),
  ...cohort('wc90', 20, 0.9, 0.9, 'intervention'),
];

/**
 * An OVERCONFIDENT set: stated confidence far exceeds observed success, so the
 * signed overconfidenceIndex is strongly positive.
 */
export const OVERCONFIDENT: Prediction[] = [
  ...cohort('oc70', 20, 0.7, 0.4, 'recommendation'),
  ...cohort('oc80', 20, 0.8, 0.45, 'recommendation'),
  ...cohort('oc90', 20, 0.9, 0.5, 'intervention'),
];

/**
 * An UNDERCONFIDENT set: observed success exceeds stated confidence, so the
 * signed overconfidenceIndex is strongly negative.
 */
export const UNDERCONFIDENT: Prediction[] = [
  ...cohort('uc20', 20, 0.2, 0.5, 'narrative'),
  ...cohort('uc30', 20, 0.3, 0.65, 'narrative'),
  ...cohort('uc40', 20, 0.4, 0.8, 'forecast'),
];

/** The full demo prediction set — spans every kind and every cohort type. */
export const DEMO_PREDICTIONS: Prediction[] = [
  ...WELL_CALIBRATED,
  ...OVERCONFIDENT,
  ...UNDERCONFIDENT,
];

/** Trust inputs for a source / narrative / forecast / decision. */
export const DEMO_TRUST_INPUTS: {
  source: Omit<TrustInputs, 'entityType'>;
  narrative: Omit<TrustInputs, 'entityType'>;
  forecast: Omit<TrustInputs, 'entityType'>;
  decision: Omit<TrustInputs, 'entityType'>;
} = {
  source: {
    entityId: 'src-reuters',
    historicalAccuracy: 0.88,
    evidenceQuality: 0.82,
    calibrationScore: 0.85,
    reviewOutcomes: { approved: 42, rejected: 4 },
    governanceOutcomes: { validated: 30, escalated: 2, rejected: 1 },
    sampleCount: 46,
  },
  narrative: {
    entityId: 'narr-supply-chain',
    historicalAccuracy: 0.61,
    evidenceQuality: 0.55,
    calibrationScore: 0.6,
    reviewOutcomes: { approved: 8, rejected: 5 },
    sampleCount: 13,
  },
  forecast: {
    entityId: 'fc-q3-demand',
    historicalAccuracy: 0.72,
    evidenceQuality: 0.66,
    calibrationScore: 0.74,
    governanceOutcomes: { validated: 10, escalated: 3, rejected: 2 },
    sampleCount: 15,
  },
  decision: {
    entityId: 'dec-launch-go',
    historicalAccuracy: 0.4,
    evidenceQuality: 0.45,
    calibrationScore: 0.5,
    reviewOutcomes: { approved: 1, rejected: 2 },
    sampleCount: 3,
  },
};

/** Build the prior/current curve pairs that exercise each drift kind. */
export function driftFixtures(): Record<
  'overconfidence' | 'underconfidence' | 'degradation' | 'improvement' | 'stable',
  { current: ReliabilityCurve; prior?: ReliabilityCurve }
> {
  const now = FIXTURE_NOW;
  // Well-calibrated baseline used as a low-ECE prior.
  const goodPrior = calibrate(WELL_CALIBRATED, { now });
  // A worse current curve for degradation: per-bin errors are large (high ECE)
  // but they CANCEL in the signed overconfidenceIndex (one bin overconfident,
  // one underconfident), so degradation is classified on ECE, not on over/under.
  const worseCurrent = calibrate(
    [
      ...cohort('dg80', 20, 0.8, 0.4, 'recommendation'), // overconfident by 0.4
      ...cohort('dg20', 20, 0.2, 0.6, 'recommendation'), // underconfident by 0.4
    ],
    { now },
  );
  return {
    overconfidence: { current: calibrate(OVERCONFIDENT, { now }) },
    underconfidence: { current: calibrate(UNDERCONFIDENT, { now }) },
    degradation: { current: worseCurrent, prior: goodPrior },
    improvement: { current: goodPrior, prior: worseCurrent },
    stable: { current: goodPrior, prior: goodPrior },
  };
}

/**
 * Run the full calibration chain offline and return every output for a UI/demo:
 * calibrate → reliabilityByKind → brier → drift → trust. Deterministic.
 */
export function calibrationDemo(): {
  now: string;
  curve: ReliabilityCurve;
  byKind: Record<Prediction['kind'], ReliabilityCurve>;
  meaning82: ReturnType<typeof confidenceMeaning>;
  brierOverall: ReturnType<typeof computeBrierScore>;
  brierByKind: Record<Prediction['kind'], ReturnType<typeof computeBrierScore>>;
  drift: Record<
    string,
    {
      result: ReturnType<typeof detectConfidenceDrift>;
      severity: ReturnType<typeof driftSeverity>;
    }
  >;
  trust: Record<
    'source' | 'narrative' | 'forecast' | 'decision',
    ReturnType<typeof computeTrustScore>
  >;
} {
  const now = FIXTURE_NOW;

  const curve = computeReliabilityCurve(WELL_CALIBRATED, { now });
  const byKind = reliabilityByKind(DEMO_PREDICTIONS, { now });
  const meaning82 = confidenceMeaning(curve, 0.82);

  const brierOverall = computeBrierScore(
    WELL_CALIBRATED.map((p) => ({ confidence: p.confidence, success: p.success })),
  );
  const brierKind = brierByKind(DEMO_PREDICTIONS);

  const dfx = driftFixtures();
  const drift: Record<
    string,
    {
      result: ReturnType<typeof detectConfidenceDrift>;
      severity: ReturnType<typeof driftSeverity>;
    }
  > = {};
  for (const key of Object.keys(dfx) as (keyof typeof dfx)[]) {
    const result = detectConfidenceDrift(dfx[key].current, dfx[key].prior, {
      now,
    });
    drift[key] = { result, severity: driftSeverity(result) };
  }

  const trust = {
    source: sourceTrust(DEMO_TRUST_INPUTS.source, { now }),
    narrative: narrativeTrust(DEMO_TRUST_INPUTS.narrative, { now }),
    forecast: forecastTrust(DEMO_TRUST_INPUTS.forecast, { now }),
    decision: decisionTrust(DEMO_TRUST_INPUTS.decision, { now }),
  };

  return {
    now,
    curve,
    byKind,
    meaning82,
    brierOverall,
    brierByKind: brierKind,
    drift,
    trust,
  };
}
