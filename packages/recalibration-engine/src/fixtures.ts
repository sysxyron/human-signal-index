// =============================================================================
// @hsi/recalibration-engine — deterministic offline fixtures + end-to-end demo.
//
// Builds proposals across triggers and runs the full governance chain
// (review → approve / reject) offline. `recalibrationDemo()` returns every
// output for UI demos. No Date.now / no Math.random anywhere.
// =============================================================================

import { detectTrustDrift, DEMO_SERIES } from '@hsi/trust-history';
import {
  proposalFromCalibrationError,
  proposalFromDriftEvent,
  proposeRecalibration,
} from './propose';
import {
  approveProposal,
  rejectProposal,
  reviewRecalibrationProposal,
} from './governance';
import type { RecalibrationProposal } from './types';

/** Fixed clock for every fixture/demo output. */
export const FIXTURE_NOW = '2026-06-09T12:00:00.000Z';

/** A canonical overconfidence proposal: forecast trust fell, confidence overstated. */
export const FORECAST_OVERSTATED: RecalibrationProposal = proposeRecalibration(
  {
    id: 'prop-forecast-overstated',
    entityType: 'forecast',
    entityId: 'fc-q3-demand',
    trigger: 'overconfidence',
    currentConfidence: 0.72,
    recommendedConfidence: 0.48,
    currentTrust: 72,
    recommendedTrust: 48,
    reason: 'Forecast trust fell from 72 → 48; stated confidence overstates reliability.',
    supportingEvidence: [
      'Trust fell 72 → 48 over the last 6 snapshots.',
      'Observed success 48% vs stated 72% confidence.',
    ],
  },
  { now: FIXTURE_NOW },
);

/** A calibration-error proposal. */
export const CALIBRATION_OVERSHOOT: RecalibrationProposal | null =
  proposalFromCalibrationError(
    {
      id: 'prop-cal-overshoot',
      entityType: 'source',
      entityId: 'src-reuters',
      currentConfidence: 0.8,
      ece: 0.22,
      threshold: 0.1,
    },
    { now: FIXTURE_NOW },
  );

/**
 * Run the full recalibration chain offline: drift → proposal → review →
 * approve / reject. Deterministic.
 */
export function recalibrationDemo(): {
  now: string;
  proposals: RecalibrationProposal[];
  review: ReturnType<typeof reviewRecalibrationProposal>;
  approval: ReturnType<typeof approveProposal>;
  rejection: ReturnType<typeof rejectProposal>;
  fromDrift: RecalibrationProposal | null;
} {
  const now = FIXTURE_NOW;

  // A proposal derived from a Phase-17 trust-drift event.
  const drift = detectTrustDrift(DEMO_SERIES.overconfident, { now });
  const fromDrift = proposalFromDriftEvent(
    drift,
    { id: 'prop-from-drift', currentConfidence: 0.8 },
    { now },
  );

  const proposals: RecalibrationProposal[] = [
    FORECAST_OVERSTATED,
    ...(CALIBRATION_OVERSHOOT ? [CALIBRATION_OVERSHOOT] : []),
    ...(fromDrift ? [fromDrift] : []),
  ];

  const review = reviewRecalibrationProposal(FORECAST_OVERSTATED, { now });
  const approval = approveProposal(
    FORECAST_OVERSTATED,
    { decidedBy: 'curator-alice', reason: 'Confirmed via outcome backtest.' },
    { now },
  );
  const rejection = rejectProposal(
    FORECAST_OVERSTATED,
    { decidedBy: 'curator-bob', reason: 'Insufficient evidence; revisit next cycle.' },
    { now },
  );

  return { now, proposals, review, approval, rejection, fromDrift };
}
